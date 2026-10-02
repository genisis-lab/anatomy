import { createHash } from "node:crypto";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { meshField } from "./mesher.mjs";
import { bakeTransform, simplify } from "./geometry.mjs";
import { bakeOcclusion, curvature } from "./paint.mjs";

/** Edge length of the cube the viewer fits each model into (see loaders.ts). */
export const FIT_SIZE = 3.8;

// GLTFExporter reads its binary output back through FileReader, which Node
// does not provide.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
};

/**
 * Surface response per tissue. Vertex colours carry albedo, so every preset
 * is white; the viewer clamps roughness and clearcoat into a stable range.
 */
const TISSUES = {
  organ: { roughness: 0.46, clearcoat: 0.12, clearcoatRoughness: 0.5 },
  mucosa: { roughness: 0.42, clearcoat: 0.12, clearcoatRoughness: 0.45 },
  muscle: { roughness: 0.54, clearcoat: 0.08, clearcoatRoughness: 0.6 },
  bone: { roughness: 0.62, clearcoat: 0.04, clearcoatRoughness: 0.7 },
  cartilage: { roughness: 0.44, clearcoat: 0.12, clearcoatRoughness: 0.45 },
  vessel: { roughness: 0.42, clearcoat: 0.12, clearcoatRoughness: 0.45 },
  nerve: { roughness: 0.5, clearcoat: 0.08, clearcoatRoughness: 0.6 },
  fat: { roughness: 0.48, clearcoat: 0.1, clearcoatRoughness: 0.55 },
  section: { roughness: 0.58, clearcoat: 0.06, clearcoatRoughness: 0.65 },
  enamel: { roughness: 0.42, clearcoat: 0.12, clearcoatRoughness: 0.35 },
};

function tissueMaterial(name) {
  const preset = TISSUES[name] ?? TISSUES.organ;
  const material = new THREE.MeshPhysicalMaterial({
    name,
    color: 0xffffff,
    vertexColors: true,
    metalness: 0,
    ior: 1.4,
    specularIntensity: 0.5,
    ...preset,
  });
  return material;
}

/**
 * A specimen is a set of named parts. Each part is either a signed distance
 * field (meshed here) or a ready geometry, plus a painter that returns a
 * linear RGB albedo per vertex. Anchors tie hotspot ids to named parts.
 */
export class Specimen {
  constructor(id, { cell = 0.016, occlusion = {} } = {}) {
    this.id = id;
    this.cell = cell;
    this.occlusion = occlusion;
    this.parts = [];
    this.anchors = {};
  }

  field(name, field, options = {}) {
    this.parts.push({ name, field, ...options });
    return this;
  }

  mesh(name, geometry, options = {}) {
    if (!geometry) throw new Error(`${this.id}: ${name} has no geometry`);
    this.parts.push({ name, geometry, ...options });
    return this;
  }

  anchor(hotspotId, meshName, at) {
    this.anchors[hotspotId] = { meshName, at };
    return this;
  }
}

/** Maps a point from a placed part's frame into the specimen. */
export function placePoint(point, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale, scale, scale])),
  );
  return new THREE.Vector3(...point).applyMatrix4(matrix).toArray();
}

const DEFAULT_SHADE = { ao: 0.82, cavity: 0.6, ridge: 0.12, saturate: 0.9 };

export async function bakeSpecimen(specimen, { log = console.log } = {}) {
  const started = Date.now();
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  const built = [];
  for (const part of specimen.parts) {
    const t0 = Date.now();
    let geometry = part.geometry;
    if (!geometry) {
      geometry = meshField(part.field, {
        cell: part.cell ?? specimen.cell,
        shade: part.shade ?? part.field,
        caps: part.caps ?? [],
        bounds: part.bounds ?? part.field.b,
      });
    }
    if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (geometry.attributes.position.count === 0) throw new Error(`${specimen.id}: ${part.name} produced no surface`);
    // A placed part is authored (and painted) in its own frame, then moved
    // into the specimen; occlusion and curvature use the placed geometry.
    let local = null;
    if (part.place) {
      local = { position: geometry.attributes.position.array.slice(), normal: geometry.attributes.normal.array.slice() };
      geometry = bakeTransform(geometry, part.place);
    }
    built.push({ part, geometry, local });
    log(`  ${part.name.padEnd(42)} ${String(geometry.index.count / 3).padStart(7)} tris  ${Date.now() - t0}ms`);
  }

  const box = new THREE.Box3();
  built.forEach(({ geometry }) => {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox);
  });
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  const occlusion = bakeOcclusion(built.filter(({ part }) => part.occlude !== false).map(({ geometry }) => geometry), specimen.occlusion);
  let occluderIndex = 0;

  const group = new THREE.Group();
  group.name = specimen.id;
  const materials = new Map();
  const ctx = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1, ao: 1, curv: 0, cap: 0, along: 0, index: 0, span };
  for (const { part, geometry, local } of built) {
    const ao = part.occlude === false ? null : occlusion[occluderIndex++];
    const curv = curvature(geometry, part.curvatureScale ?? span * 0.012);
    const shade = { ...DEFAULT_SHADE, ...(part.shading ?? {}) };
    const p = local ? local.position : geometry.attributes.position.array;
    const n = local ? local.normal : geometry.attributes.normal.array;
    const cap = geometry.userData.cap;
    const along = geometry.userData.along;
    const colors = new Float32Array(p.length);
    for (let v = 0; v < p.length / 3; v += 1) {
      ctx.x = p[v * 3]; ctx.y = p[v * 3 + 1]; ctx.z = p[v * 3 + 2];
      ctx.nx = n[v * 3]; ctx.ny = n[v * 3 + 1]; ctx.nz = n[v * 3 + 2];
      ctx.ao = ao ? ao[v] : 1;
      ctx.curv = curv[v];
      ctx.cap = cap ? cap[v] : 0;
      ctx.along = along ? along[v] : 0;
      ctx.index = v;
      if (process.env.BAKE_DEBUG === "flat") { ctx.ao = 1; ctx.curv = 0; }
      const albedo = process.env.BAKE_DEBUG === "white" ? [0.8, 0.8, 0.8] : part.paint ? part.paint(ctx) : [0.8, 0.5, 0.45];
      const occluded = 1 - shade.ao * (1 - Math.pow(ctx.ao, 1.15));
      const crease = 1 - shade.cavity * Math.max(0, ctx.curv);
      const crest = 1 + shade.ridge * Math.max(0, -ctx.curv);
      const k = Math.max(0.04, occluded * crease * crest);
      // Shadowed tissue deepens in saturation rather than going grey, the
      // way light scatters through wet organs in an atlas plate.
      const rich = Math.min(1, Math.max(0, 1 - k)) * shade.saturate;
      for (let ch = 0; ch < 3; ch += 1) {
        const a = albedo[ch];
        colors[v * 3 + ch] = Math.min(1, (a + (a * a * 1.15 - a) * rich) * k);
      }
    }
    let out = new THREE.BufferGeometry();
    out.setAttribute("position", geometry.attributes.position);
    out.setAttribute("normal", geometry.attributes.normal);
    out.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    out.setIndex(geometry.index);
    // Decimate after painting so colour boundaries (sections, folds,
    // vessels drawn into the surface) keep the vertices they need.
    if (part.simplify) {
      const before = out.index.count / 3;
      out = simplify(out, part.simplify);
      log(`  ${part.name.padEnd(42)} ${String(before).padStart(7)} → ${out.index.count / 3} tris`);
    }
    const tissue = part.material ?? "organ";
    if (!materials.has(tissue)) materials.set(tissue, tissueMaterial(tissue));
    const mesh = new THREE.Mesh(out, materials.get(tissue));
    mesh.name = part.name;
    group.add(mesh);
  }

  // Hotspot anchors snap to the nearest vertex of their named part and are
  // expressed in the viewer's normalised space, exactly as loaders.ts fits it.
  const delivered = new THREE.Box3();
  group.children.forEach((mesh) => {
    mesh.geometry.computeBoundingBox();
    delivered.union(mesh.geometry.boundingBox);
  });
  const center = delivered.getCenter(new THREE.Vector3());
  const fit = FIT_SIZE / Math.max(...delivered.getSize(new THREE.Vector3()).toArray(), 1e-3);
  const anchors = {};
  for (const [id, { meshName, at: authored }] of Object.entries(specimen.anchors)) {
    const mesh = group.children.find((child) => child.name === meshName);
    if (!mesh) throw new Error(`${specimen.id}: anchor ${id} names missing part ${meshName}`);
    const owner = specimen.parts.find((part) => part.name === meshName);
    const at = owner?.place ? placePoint(authored, owner.place) : authored;
    const p = mesh.geometry.attributes.position.array;
    let best = Infinity, bx = 0, by = 0, bz = 0;
    for (let v = 0; v < p.length; v += 3) {
      const d = (p[v] - at[0]) ** 2 + (p[v + 1] - at[1]) ** 2 + (p[v + 2] - at[2]) ** 2;
      if (d < best) { best = d; bx = p[v]; by = p[v + 1]; bz = p[v + 2]; }
    }
    anchors[id] = {
      meshName,
      position: [(bx - center.x) * fit, (by - center.y) * fit, (bz - center.z) * fit].map((value) => Number(value.toFixed(4))),
    };
  }

  const exported = await new GLTFExporter().parseAsync(group, { binary: true, onlyVisible: true, trs: false });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
  const document = await io.readBinary(new Uint8Array(exported));
  await document.transform(
    dedup(),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: "medium", quantizeNormal: 10, quantizePosition: 14, quantizeColor: 8 }),
  );
  const bytes = await io.writeBinary(document);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  const triangles = group.children.reduce((total, mesh) => total + mesh.geometry.index.count / 3, 0);
  log(`  → ${specimen.id}: ${group.children.length} meshes, ${triangles} tris, ${(bytes.length / 1024).toFixed(0)} KB in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return { bytes, hash, meshes: group.children.length, triangles, anchors, group };
}
