import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(root, "public/models");
const sourceDirectory = join(root, "scripts/model-sources/bodyparts3d");
const scanSourceDirectory = process.env.ANATOMY_SCAN_SOURCE_DIR || join(root, "scripts/.model-cache/bodyparts3d");
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
const requestedIds = process.argv.slice(2);
const idsToBuild = requestedIds.length ? expandedIds.filter((id) => requestedIds.includes(id)) : expandedIds;

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

class NodeImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

class NodeOffscreenCanvas {
  constructor(width, height) {
    this._width = width;
    this._height = height;
    this.pixels = new Uint8ClampedArray(width * height * 4);
    this.fillStyle = "#000000";
  }

  get width() { return this._width; }
  set width(value) { this._width = value; this.pixels = new Uint8ClampedArray(this._width * this._height * 4); }
  get height() { return this._height; }
  set height(value) { this._height = value; this.pixels = new Uint8ClampedArray(this._width * this._height * 4); }

  getContext() {
    const context = {
      fillStyle: "#000000",
      translate() {},
      scale() {},
      fillRect: () => {
        const hex = context.fillStyle.startsWith("#") ? context.fillStyle.slice(1) : "000000";
        const value = Number.parseInt(hex.padEnd(6, "0").slice(0, 6), 16);
        const red = (value >> 16) & 255;
        const green = (value >> 8) & 255;
        const blue = value & 255;
        for (let offset = 0; offset < this.pixels.length; offset += 4) {
          this.pixels[offset] = red;
          this.pixels[offset + 1] = green;
          this.pixels[offset + 2] = blue;
          this.pixels[offset + 3] = 255;
        }
      },
      getImageData: () => new NodeImageData(new Uint8ClampedArray(this.pixels), this.width, this.height),
      drawImage: (image) => {
        const source = image?.data ?? image?.pixels;
        const sourceWidth = image?.width ?? this.width;
        const sourceHeight = image?.height ?? this.height;
        if (!source) return;
        for (let y = 0; y < this.height; y += 1) {
          for (let x = 0; x < this.width; x += 1) {
            const sx = Math.min(sourceWidth - 1, Math.floor((x / this.width) * sourceWidth));
            const sy = Math.min(sourceHeight - 1, Math.floor((y / this.height) * sourceHeight));
            const from = (sy * sourceWidth + sx) * 4;
            const to = (y * this.width + x) * 4;
            this.pixels[to] = source[from];
            this.pixels[to + 1] = source[from + 1];
            this.pixels[to + 2] = source[from + 2];
            this.pixels[to + 3] = source[from + 3] ?? 255;
          }
        }
      },
      putImageData: (image) => {
        this.pixels = new Uint8ClampedArray(image.data);
      },
    };
    return context;
  }

  async convertToBlob({ type = "image/png" } = {}) {
    const bytes = await sharp(Buffer.from(this.pixels), {
      raw: { width: this.width, height: this.height, channels: 4 },
    }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    return new Blob([bytes], { type });
  }
}

globalThis.ImageData ??= NodeImageData;
globalThis.OffscreenCanvas ??= NodeOffscreenCanvas;

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

const BODY_SCAN_CENTER = new THREE.Vector3(-0.673, 839.284, 92.679);
const BODY_SCAN_SCALE = 4.4 / 1597.872;

const skeletonScans = [
  [52734, "Frontal bone"], [52735, "Occipital bone"], [52736, "Sphenoid bone"],
  [52738, "Right temporal bone"], [52739, "Left temporal bone"], [52740, "Ethmoid bone"],
  [52748, "Mandible"], [52749, "Hyoid bone"], [52788, "Right parietal bone"], [52789, "Left parietal bone"],
  [52892, "Right zygomatic bone"], [52893, "Left zygomatic bone"], [53649, "Right maxilla"], [53650, "Left maxilla"],
  [54737, "Right inferior nasal concha"], [54738, "Left inferior nasal concha"],
  [12519, "Atlas"], [12520, "Axis"], [12521, "Third cervical vertebra"], [12522, "Fourth cervical vertebra"],
  [12523, "Fifth cervical vertebra"], [12524, "Sixth cervical vertebra"], [12525, "Seventh cervical vertebra"],
  [9165, "First thoracic vertebra"], [9187, "Second thoracic vertebra"], [9209, "Third thoracic vertebra"],
  [9248, "Fourth thoracic vertebra"], [9922, "Fifth thoracic vertebra"], [9945, "Sixth thoracic vertebra"],
  [9968, "Seventh thoracic vertebra"], [9991, "Eighth thoracic vertebra"], [10014, "Ninth thoracic vertebra"],
  [10037, "Tenth thoracic vertebra"], [10059, "Eleventh thoracic vertebra"], [10081, "Twelfth thoracic vertebra"],
  [13072, "First lumbar vertebra"], [13073, "Second lumbar vertebra"], [13074, "Third lumbar vertebra"],
  [13075, "Fourth lumbar vertebra"], [13076, "Fifth lumbar vertebra"], [16202, "Sacrum"],
  [7857, "Right first rib"], [7987, "Left first rib"], [7882, "Right second rib"], [8012, "Left second rib"],
  [7909, "Right third rib"], [8039, "Left third rib"], [7957, "Right fourth rib"], [8148, "Left fourth rib"],
  [8066, "Right fifth rib"], [8093, "Left fifth rib"], [8175, "Right sixth rib"], [8202, "Left sixth rib"],
  [8229, "Right seventh rib"], [8256, "Left seventh rib"], [8283, "Right eighth rib"], [8310, "Left eighth rib"],
  [8364, "Right ninth rib"], [8391, "Left ninth rib"], [8445, "Right tenth rib"], [8472, "Left tenth rib"],
  [8531, "Right eleventh rib"], [8532, "Left eleventh rib"], [8533, "Right twelfth rib"], [8534, "Left twelfth rib"],
  [13323, "Left clavicle"], [13395, "Right scapula"], [13396, "Left scapula"],
  [23130, "Right humerus"], [23131, "Left humerus"], [23464, "Right radius"], [23465, "Left radius"],
  [23467, "Right ulna"], [23468, "Left ulna"], [16586, "Right hip bone"], [16587, "Left hip bone"],
  [24474, "Right femur"], [24475, "Left femur"], [24477, "Right tibia"], [24478, "Left tibia"],
  [24480, "Right fibula"], [24481, "Left fibula"], [24486, "Right patella"], [24487, "Left patella"],
];

const muscleScans = [
  [13336, "Right external oblique", true, 22000],
  [13377, "Right rectus abdominis", false, 17000],
  [13378, "Left rectus abdominis", false, 17000],
  [22328, "Right gluteus maximus", true, 9000],
];

async function ensureRawScanSources() {
  const entries = [];
  if (idsToBuild.includes("skeleton")) entries.push(...skeletonScans);
  if (idsToBuild.includes("muscles")) entries.push(...muscleScans);
  if (!entries.length) return;
  mkdirSync(scanSourceDirectory, { recursive: true });
  const ids = [...new Set(entries.map(([id]) => id))];
  for (let offset = 0; offset < ids.length; offset += 5) {
    await Promise.all(ids.slice(offset, offset + 5).map(async (id) => {
      const filename = join(scanSourceDirectory, `FMA${id}.stl`);
      if (existsSync(filename)) return;
      const url = `https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/refs/heads/main/assets/BodyParts3D_data/stl/FMA${id}.stl`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to retrieve BodyParts3D FMA${id}: HTTP ${response.status}`);
      writeFileSync(filename, Buffer.from(await response.arrayBuffer()));
    }));
  }
}

function compactGeometry(geometry, targetTriangles) {
  const indexed = mergeVertices(geometry, 0.0001);
  const position = indexed.getAttribute("position");
  const sourceIndex = indexed.getIndex();
  if (!sourceIndex || sourceIndex.count <= targetTriangles * 3) {
    indexed.computeVertexNormals();
    return indexed;
  }

  const input = new Uint32Array(sourceIndex.array);
  const target = Math.max(300, Math.floor(targetTriangles) * 3);
  // BodyParts3D surfaces contain many open seams, so the conservative
  // topological simplifier cannot reach a web-friendly budget. The sloppy
  // variant preserves the visible silhouette while collapsing those seams.
  const [simplified] = MeshoptSimplifier.simplifySloppy(input, position.array, 3, null, target, 0.018);
  const output = new Uint32Array(simplified);
  const [remap, vertexCount] = MeshoptSimplifier.compactMesh(output);
  const positions = new Float32Array(vertexCount * 3);
  const missing = 2 ** 32 - 1;
  for (let oldIndex = 0; oldIndex < remap.length; oldIndex += 1) {
    const newIndex = remap[oldIndex];
    if (newIndex === missing) continue;
    positions[newIndex * 3] = position.getX(oldIndex);
    positions[newIndex * 3 + 1] = position.getY(oldIndex);
    positions[newIndex * 3 + 2] = position.getZ(oldIndex);
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  result.setIndex(new THREE.BufferAttribute(output, 1));
  result.computeVertexNormals();
  return result;
}

function rawScanGeometry(id, targetTriangles) {
  const filename = join(scanSourceDirectory, `FMA${id}.stl`);
  if (!existsSync(filename)) return null;
  const bytes = readFileSync(filename);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const geometry = compactGeometry(new STLLoader().parse(arrayBuffer), targetTriangles);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function bodyScanLayer(entries, color, defaultTargetTriangles) {
  const layer = new THREE.Group();
  layer.name = "BodyParts3D anatomical scan layer";
  const surface = material(color);
  for (const entry of entries) {
    const [id, name, mirror = false, targetTriangles = defaultTargetTriangles] = entry;
    const geometry = rawScanGeometry(id, targetTriangles);
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    mesh.userData.source = `BodyParts3D FMA${id}`;
    layer.add(mesh);
    if (mirror) {
      const mirrored = new THREE.Mesh(geometry.clone(), surface);
      mirrored.name = name.replace("Right", "Left");
      mirrored.scale.x = -1;
      mirrored.userData.source = `BodyParts3D FMA${id}, mirrored counterpart`;
      layer.add(mirrored);
    }
  }
  layer.scale.setScalar(BODY_SCAN_SCALE);
  layer.position.copy(BODY_SCAN_CENTER).multiplyScalar(-BODY_SCAN_SCALE);
  return layer;
}

function replaceSkeletonWithScans(group) {
  group.clear();
  group.add(bodyScanLayer(skeletonScans, 0xd7c5a7, 1900));
}

function enrichMusclesWithScans(group) {
  const underlay = group.children.filter((child) => child instanceof THREE.Mesh);
  underlay.forEach((mesh) => {
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.color.multiplyScalar(0.72);
      mesh.material.roughness = 0.7;
    }
  });
  group.add(bodyScanLayer(muscleScans, 0xb84f47, 16000));
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
  if (id === "skeleton") replaceSkeletonWithScans(group);
  if (id === "muscles") enrichMusclesWithScans(group);
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

function ensureUv(geometry) {
  if (geometry.getAttribute("uv")) return;
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const uv = new Float32Array(position.count * 2);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    p.fromBufferAttribute(position, index);
    n.fromBufferAttribute(normal, index).set(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
    let u;
    let v;
    if (n.x >= n.y && n.x >= n.z) {
      u = (p.z - box.min.z) / Math.max(size.z, 0.001);
      v = (p.y - box.min.y) / Math.max(size.y, 0.001);
    } else if (n.y >= n.z) {
      u = (p.x - box.min.x) / Math.max(size.x, 0.001);
      v = (p.z - box.min.z) / Math.max(size.z, 0.001);
    } else {
      u = (p.x - box.min.x) / Math.max(size.x, 0.001);
      v = (p.y - box.min.y) / Math.max(size.y, 0.001);
    }
    uv[index * 2] = u;
    uv[index * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function surfaceField(x, y, seed, kind) {
  const cell = Math.sin(x * 31 + seed * 1.7) * Math.sin(y * 27 - seed * 0.8);
  const grain = Math.sin(x * 91 + y * 17 + seed) * Math.sin(y * 83 - x * 13);
  const vesselPath = Math.sin(x * 7.2 + Math.sin(y * 5.1 + seed) * 1.4 + seed * 0.41);
  const vessel = Math.exp(-Math.abs(vesselPath) * (kind === "bone" ? 24 : 38));
  const fibre = Math.sin((x * 5 + Math.sin(y * 3)) * Math.PI * 2) * 0.5 + 0.5;
  const base = kind === "muscle" ? fibre * 0.34 + cell * 0.16 : cell * 0.22 + grain * 0.08;
  return { height: base + vessel * 0.38, vessel, grain };
}

function dataTexture(data, width, height, colorSpace = THREE.NoColorSpace) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function buildSurfaceMaps(id, seed) {
  const width = 384;
  const height = 384;
  const color = new Uint8Array(width * height * 4);
  const normal = new Uint8Array(width * height * 4);
  const roughness = new Uint8Array(width * height * 4);
  const kind = id === "skeleton" ? "bone" : id === "muscles" ? "muscle" : "organ";
  const step = 1 / width;
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const x = px / width;
      const y = py / height;
      const field = surfaceField(x, y, seed, kind);
      const dx = surfaceField(x + step, y, seed, kind).height - surfaceField(x - step, y, seed, kind).height;
      const dy = surfaceField(x, y + step, seed, kind).height - surfaceField(x, y - step, seed, kind).height;
      const n = new THREE.Vector3(-dx * 7.5, -dy * 7.5, 1).normalize();
      const offset = (py * width + px) * 4;
      const base = kind === "bone" ? 238 : 229;
      const warmth = kind === "bone" ? 0 : field.vessel * 68;
      color[offset] = THREE.MathUtils.clamp(base + field.grain * 13 + warmth, 0, 255);
      color[offset + 1] = THREE.MathUtils.clamp(base + field.grain * 8 - warmth * 0.58, 0, 255);
      color[offset + 2] = THREE.MathUtils.clamp(base - 5 + field.grain * 7 - warmth * 0.7, 0, 255);
      color[offset + 3] = 255;
      normal[offset] = (n.x * 0.5 + 0.5) * 255;
      normal[offset + 1] = (n.y * 0.5 + 0.5) * 255;
      normal[offset + 2] = n.z * 255;
      normal[offset + 3] = 255;
      const r = THREE.MathUtils.clamp(142 + field.grain * 18 - field.vessel * 26 + (kind === "bone" ? 25 : 0), 80, 220);
      roughness[offset] = r;
      roughness[offset + 1] = r;
      roughness[offset + 2] = r;
      roughness[offset + 3] = 255;
    }
  }
  return {
    map: dataTexture(color, width, height, THREE.SRGBColorSpace),
    normalMap: dataTexture(normal, width, height),
    roughnessMap: dataTexture(roughness, width, height),
  };
}

function addSurfaceMaps(group, id, seed) {
  const maps = buildSurfaceMaps(id, seed);
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    ensureUv(child.geometry);
    const surfaces = Array.isArray(child.material) ? child.material : [child.material];
    surfaces.forEach((surface) => {
      if (!(surface instanceof THREE.MeshStandardMaterial)) return;
      surface.map = maps.map;
      surface.normalMap = maps.normalMap;
      surface.normalScale.set(0.66, 0.66);
      surface.roughnessMap = maps.roughnessMap;
      surface.needsUpdate = true;
    });
  });
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
  await MeshoptSimplifier.ready;
  await ensureRawScanSources();
  for (const id of idsToBuild) {
    const index = expandedIds.indexOf(id);
    const group = buildProceduralModel(id);
    if (!group) throw new Error(`No model builder for ${id}`);
    enrichWithScans(id, group);
    addSurfaceMaps(group, id, index + 1);
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
