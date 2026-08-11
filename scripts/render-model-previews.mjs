import { mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as THREE from "three";
import sharp from "sharp";

const COMPONENTS = {
  5120: [1, "getInt8"], 5121: [1, "getUint8"], 5122: [2, "getInt16"],
  5123: [2, "getUint16"], 5125: [4, "getUint32"], 5126: [4, "getFloat32"],
};
const SHAPES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parseGlb(filename) {
  const bytes = readFileSync(filename);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binaryHeader = 20 + jsonLength;
  const binaryOffset = binaryHeader + 8;
  return { bytes, json, binaryOffset };
}

function accessor(glb, index) {
  const definition = glb.json.accessors[index];
  const view = glb.json.bufferViews[definition.bufferView];
  const [componentBytes, reader] = COMPONENTS[definition.componentType];
  const components = SHAPES[definition.type];
  const stride = view.byteStride || componentBytes * components;
  const start = glb.binaryOffset + (view.byteOffset || 0) + (definition.byteOffset || 0);
  const data = new DataView(glb.bytes.buffer, glb.bytes.byteOffset, glb.bytes.byteLength);
  const output = new Float32Array(definition.count * components);
  const signed = definition.componentType === 5120 || definition.componentType === 5122;
  const maximum = definition.normalized ? (signed ? 2 ** (componentBytes * 8 - 1) - 1 : 2 ** (componentBytes * 8) - 1) : 1;
  for (let item = 0; item < definition.count; item += 1) {
    for (let component = 0; component < components; component += 1) {
      const offset = start + item * stride + component * componentBytes;
      output[item * components + component] = data[reader](offset, true) / maximum;
    }
  }
  return { data: output, count: definition.count, components };
}

function nodeMatrix(node) {
  if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(node.translation || [0, 0, 0])),
    new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
    new THREE.Vector3(...(node.scale || [1, 1, 1])),
  );
}

function collectVertices(glb) {
  const points = [];
  const roots = glb.json.scenes[glb.json.scene || 0].nodes || [];
  const visit = (nodeIndex, parent) => {
    const node = glb.json.nodes[nodeIndex];
    const world = parent.clone().multiply(nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const primitive of glb.json.meshes[node.mesh].primitives) {
        const positions = accessor(glb, primitive.attributes.POSITION);
        const normals = primitive.attributes.NORMAL === undefined ? null : accessor(glb, primitive.attributes.NORMAL);
        const colors = primitive.attributes.COLOR_0 === undefined ? null : accessor(glb, primitive.attributes.COLOR_0);
        const material = glb.json.materials?.[primitive.material]?.pbrMetallicRoughness?.baseColorFactor || [0.78, 0.46, 0.39, 1];
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
        for (let index = 0; index < positions.count; index += 1) {
          const position = new THREE.Vector3(
            positions.data[index * 3], positions.data[index * 3 + 1], positions.data[index * 3 + 2],
          ).applyMatrix4(world);
          const normal = normals ? new THREE.Vector3(
            normals.data[index * 3], normals.data[index * 3 + 1], normals.data[index * 3 + 2],
          ).applyMatrix3(normalMatrix).normalize() : new THREE.Vector3(0, 0, 1);
          const color = new THREE.Color(material[0], material[1], material[2]);
          if (colors) color.multiply(new THREE.Color(
            colors.data[index * colors.components], colors.data[index * colors.components + 1], colors.data[index * colors.components + 2],
          ));
          points.push({ position, normal, color });
        }
      }
    }
    for (const child of node.children || []) visit(child, world);
  };
  roots.forEach((root) => visit(root, new THREE.Matrix4()));
  return points;
}

function render(points, width = 520, height = 520) {
  const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.06, -0.34, 0));
  points.forEach((point) => {
    point.position.applyMatrix4(rotation);
    point.normal.transformDirection(rotation);
  });
  const box = new THREE.Box3();
  points.forEach(({ position }) => box.expandByPoint(position));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = Math.min((width - 56) / Math.max(size.x, 0.001), (height - 72) / Math.max(size.y, 0.001));
  const pixels = Buffer.alloc(width * height * 4, 0);
  const depth = new Float32Array(width * height).fill(-Infinity);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 247; pixels[offset + 1] = 240; pixels[offset + 2] = 231; pixels[offset + 3] = 255;
  }
  const light = new THREE.Vector3(-0.4, 0.72, 0.9).normalize();
  const radius = points.length < 40000 ? 2 : 1;
  for (const point of points) {
    const x = Math.round(width / 2 + (point.position.x - center.x) * scale);
    const y = Math.round(height / 2 - (point.position.y - center.y) * scale);
    const shade = THREE.MathUtils.clamp(0.48 + Math.max(0, point.normal.dot(light)) * 0.72, 0.35, 1.18);
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius + 0.5) continue;
      const px = x + dx, py = y + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const index = py * width + px;
      if (point.position.z < depth[index]) continue;
      depth[index] = point.position.z;
      const offset = index * 4;
      pixels[offset] = THREE.MathUtils.clamp(point.color.r * 255 * shade, 0, 255);
      pixels[offset + 1] = THREE.MathUtils.clamp(point.color.g * 255 * shade, 0, 255);
      pixels[offset + 2] = THREE.MathUtils.clamp(point.color.b * 255 * shade, 0, 255);
    }
  }
  return { pixels, width, height };
}

const filenames = process.argv.slice(2);
if (!filenames.length) throw new Error("Pass one or more GLB files to render.");
const panels = [];
for (const filename of filenames) {
  const points = collectVertices(parseGlb(filename));
  const rendered = render(points);
  const label = basename(filename).replace(/\.[a-f0-9]{8}\.glb$/, "").replaceAll("-", " ");
  const title = Buffer.from(`<svg width="520" height="44"><rect width="520" height="44" fill="#fffaf3"/><text x="20" y="29" fill="#3f342e" font-family="Arial" font-size="18" font-weight="600">${label}</text></svg>`);
  const panel = await sharp(rendered.pixels, { raw: { width: rendered.width, height: rendered.height, channels: 4 } })
    .extend({ bottom: 44, background: "#fffaf3" }).composite([{ input: title, top: 520, left: 0 }]).png().toBuffer();
  panels.push(panel);
}
const columns = 4;
const rows = Math.ceil(panels.length / columns);
const output = join(process.cwd(), "outputs/anatomy-model-previews.png");
mkdirSync(dirname(output), { recursive: true });
await sharp({ create: { width: columns * 520, height: rows * 564, channels: 4, background: "#eadfd2" } })
  .composite(panels.map((input, index) => ({ input, left: (index % columns) * 520, top: Math.floor(index / columns) * 564 })))
  .png().toFile(output);
console.log(output);
