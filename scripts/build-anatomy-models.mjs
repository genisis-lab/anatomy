import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(root, "public/models");
const sourceDirectory = join(root, "scripts/model-sources/bodyparts3d");
const expandedIds = [
  "stomach",
  "skeleton",
  "muscles",
  "ear",
  "spinal-cord",
  "bladder",
  "thyroid",
  "lymphatic",
  "female-reproductive",
  "male-reproductive",
  "gallbladder",
  "airway-diaphragm",
];

class NodeFileReader {
  result = null;
  error = null;
  onload = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((value) => {
      this.result = value;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }).catch((error) => {
      this.error = error;
      this.onerror?.(error);
      this.onloadend?.({ target: this });
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((value) => {
      this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }).catch((error) => {
      this.error = error;
      this.onerror?.(error);
      this.onloadend?.({ target: this });
    });
  }
}

globalThis.FileReader ??= NodeFileReader;

function loadProceduralBuilder() {
  const sourcePath = join(root, "app/lib/three/procedural-models.ts");
  const buildDirectory = mkdtempSync(join(root, "scripts/.model-build-"));
  const compiledPath = join(buildDirectory, "procedural-models.mjs");
  const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  }).outputText;
  writeFileSync(compiledPath, compiled);
  return import(pathToFileURL(compiledPath).href).then((module) => ({
    buildProceduralModel: module.buildProceduralModel,
    cleanup: () => rmSync(buildDirectory, { recursive: true, force: true }),
  }));
}

function material(color) {
  const base = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.5,
    metalness: 0,
    ior: 1.38,
    clearcoat: 0.11,
    clearcoatRoughness: 0.62,
    sheen: 0.24,
    sheenRoughness: 0.76,
    sheenColor: base.clone().lerp(new THREE.Color(0xffe8dc), 0.4),
    specularIntensity: 0.48,
    specularColor: new THREE.Color(0xffeee4),
    vertexColors: true,
  });
}

function sourceGeometry(filename, targetSize, targetPosition) {
  const bytes = readFileSync(join(sourceDirectory, filename));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  let geometry = new STLLoader().parse(arrayBuffer);
  geometry = mergeVertices(geometry, 0.0001);
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);

  const box = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute("position"));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(
    targetSize[0] / Math.max(size.x, 0.001),
    targetSize[1] / Math.max(size.y, 0.001),
    targetSize[2] / Math.max(size.z, 0.001),
  );
  geometry.translate(...targetPosition);
  geometry.computeVertexNormals();
  return geometry;
}

function removeAt(group, indexes) {
  [...indexes].sort((a, b) => b - a).forEach((index) => {
    const child = group.children[index];
    if (child) group.remove(child);
  });
}

function removeMatching(group, predicate) {
  [...group.children].forEach((child) => {
    if (predicate(child)) group.remove(child);
  });
}

function addScan(group, { filename, name, color, size, position }) {
  const mesh = new THREE.Mesh(sourceGeometry(filename, size, position), material(color));
  mesh.name = name;
  mesh.userData.source = "BodyParts3D";
  group.add(mesh);
  return mesh;
}

function detailMaterial(color, roughness = 0.46) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    clearcoat: 0.1,
    clearcoatRoughness: 0.58,
    sheen: 0.18,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffe6dc), 0.35),
  });
}

function addTube(group, name, points, radius, color) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, radius, 8, false), detailMaterial(color));
  mesh.name = name;
  group.add(mesh);
  return mesh;
}

function enrichBladderSurface(group) {
  // Detrusor fibres follow the scan instead of floating behind it. Alternating
  // longitudinal and transverse strands give the smooth source mesh the same
  // layered anatomical read as the original authored specimens.
  const fibre = 0xdc8a78;
  [-0.56, -0.3, 0, 0.3, 0.56].forEach((x, index) => {
    addTube(group, `Detrusor longitudinal fibre ${index + 1}`, [
      [x * 0.62, -0.98, 0.48], [x, -0.34, 0.69], [x * 0.78, 0.38, 0.66], [x * 0.45, 0.78, 0.46],
    ], 0.018, fibre);
  });
  [-0.64, -0.28, 0.08, 0.42].forEach((y, index) => {
    addTube(group, `Detrusor transverse fibre ${index + 1}`, [
      [-0.64, y, 0.42], [-0.34, y + 0.05, 0.67], [0, y + 0.02, 0.74], [0.34, y - 0.04, 0.67], [0.64, y, 0.42],
    ], 0.014, 0xe3a08f);
  });

  // The trigone is the clinically important smooth triangle between the two
  // ureteric openings and the internal urethral opening.
  const trigoneShape = new THREE.Shape();
  trigoneShape.moveTo(-0.28, 0.18);
  trigoneShape.lineTo(0.28, 0.18);
  trigoneShape.lineTo(0, -0.35);
  trigoneShape.closePath();
  const trigone = new THREE.Mesh(new THREE.ShapeGeometry(trigoneShape), detailMaterial(0xeab18e, 0.52));
  trigone.name = "Trigone surface";
  trigone.position.set(0, -0.55, 0.715);
  group.add(trigone);

  addTube(group, "Superior vesical artery", [[-0.66, 0.48, 0.49], [-0.48, 0.25, 0.69], [-0.35, -0.08, 0.72], [-0.28, -0.48, 0.64]], 0.024, 0xb94742);
  addTube(group, "Vesical venous plexus", [[0.68, 0.38, 0.47], [0.52, 0.12, 0.68], [0.45, -0.2, 0.71], [0.34, -0.58, 0.59]], 0.027, 0x586fa8);
}

function enrichWithScans(id, group) {
  if (id === "bladder") {
    removeAt(group, [0]);
    addScan(group, { filename: "bladder.stl", name: "Urinary bladder", color: 0xcc7165, size: [1.72, 1.94, 1.28], position: [0, -0.15, 0] });
    enrichBladderSurface(group);
  }
  if (id === "stomach") {
    removeAt(group, [0, 1]);
    addScan(group, { filename: "stomach.stl", name: "Stomach body", color: 0xc96f61, size: [1.86, 2.28, 1.38], position: [0.16, -0.12, -0.08] });
  }
  if (id === "gallbladder") {
    removeAt(group, [0]);
    addScan(group, { filename: "gallbladder.stl", name: "Gallbladder sac", color: 0x85964d, size: [1.05, 2.02, 0.92], position: [0, -0.25, 0] });
  }
  if (id === "lymphatic") {
    removeMatching(group, (child) => child.position.x > 0.9 && child.geometry?.type === "SphereGeometry");
    addScan(group, { filename: "spleen.stl", name: "Spleen", color: 0x9f5367, size: [0.72, 1.25, 0.48], position: [1.02, 0.58, -0.08] });
  }
  if (id === "male-reproductive") {
    removeMatching(group, (child) => child.geometry?.type === "SphereGeometry" && (child.position.y < -0.7 || Math.abs(child.position.y - 0.36) < 0.05));
    addScan(group, { filename: "right-testis.stl", name: "Right testis", color: 0xb98a78, size: [0.54, 0.78, 0.54], position: [-0.48, -1.1, 0] });
    addScan(group, { filename: "left-testis.stl", name: "Left testis", color: 0xb98a78, size: [0.54, 0.78, 0.54], position: [0.48, -1.1, 0] });
    addScan(group, { filename: "prostate.stl", name: "Prostate", color: 0xa56f61, size: [0.92, 0.58, 0.68], position: [0, 0.36, 0.15] });
  }
  if (id === "airway-diaphragm") {
    removeMatching(group, (child) => child.geometry?.type === "CylinderGeometry" && child.position.x > 0.2);
    addScan(group, { filename: "esophagus.stl", name: "Esophagus", color: 0xb98a78, size: [0.3, 2.66, 0.34], position: [0.35, 0.45, -0.35] });
  }
  group.userData.modelPipeline = "authored-glb";
  group.userData.attribution = "BodyParts3D components are CC BY-SA 2.1 Japan; see THIRD_PARTY_ASSETS.md";
}

function addVertexTones(group, seed) {
  let meshIndex = 0;
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry;
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const colors = new Float32Array(position.count * 3);
    const point = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const surfaces = Array.isArray(child.material) ? child.material : [child.material];
    const base = surfaces.find((surface) => surface instanceof THREE.MeshStandardMaterial)?.color?.clone() ?? new THREE.Color(0xc9915e);
    const light = base.clone().lerp(new THREE.Color(0xffe8dc), 0.34);
    const shadow = base.clone().multiplyScalar(0.68);
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index);
      direction.fromBufferAttribute(normal, index);
      const grain = Math.sin(point.x * 11.7 + seed + meshIndex) * Math.sin(point.y * 9.3 - seed) * 0.5 + Math.sin(point.z * 14.1 + point.y * 2.4) * 0.5;
      const facing = THREE.MathUtils.clamp(direction.z * 0.18 + 0.5, 0, 1);
      const tone = THREE.MathUtils.clamp(0.45 + grain * 0.11 + facing * 0.16, 0, 1);
      const color = shadow.clone().lerp(light, tone);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    surfaces.forEach((surface) => {
      if (surface instanceof THREE.MeshStandardMaterial) {
        surface.vertexColors = true;
        surface.needsUpdate = true;
      }
    });
    child.name ||= `${group.name}-surface-${meshIndex + 1}`;
    meshIndex += 1;
  });
}

async function exportGlb(group) {
  group.updateMatrixWorld(true);
  const result = await new GLTFExporter().parseAsync(group, {
    binary: true,
    onlyVisible: true,
    trs: false,
    includeCustomExtensions: true,
  });
  return Buffer.from(result);
}

const { buildProceduralModel, cleanup } = await loadProceduralBuilder();
const manifest = {};
try {
  for (const [index, id] of expandedIds.entries()) {
    const group = buildProceduralModel(id);
    if (!group) throw new Error(`No model builder for ${id}`);
    enrichWithScans(id, group);
    addVertexTones(group, index + 1);
    const bytes = await exportGlb(group);
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
    const filename = `${id}.${hash}.glb`;
    for (const existing of readdirSync(outputDirectory)) {
      if (new RegExp(`^${id}\\.[a-f0-9]{8}\\.glb$`).test(existing) && existing !== filename) {
        unlinkSync(join(outputDirectory, existing));
      }
    }
    writeFileSync(join(outputDirectory, filename), bytes);
    manifest[id] = `/models/${filename}`;
  }
} finally {
  cleanup();
}

console.log(JSON.stringify(manifest, null, 2));
