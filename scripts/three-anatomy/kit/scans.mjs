import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "meshoptimizer";
import { compact } from "./mesher.mjs";

// Registered BodyParts3D surfaces (CC BY-SA 2.1 Japan), fetched on demand
// into an ignored cache. Every scan shares one body coordinate system, so
// bones and muscles drop into place without manual alignment.

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cache = process.env.ANATOMY_SCAN_SOURCE_DIR || join(root, "scripts/.model-cache/bodyparts3d");
const SOURCE = "https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/refs/heads/main/assets/BodyParts3D_data/stl";

export const SCAN_IDS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "bodyparts3d.json"), "utf8"));

/** Downloads any missing scans (a few at a time) and returns the ids present. */
export async function ensureScans(ids) {
  mkdirSync(cache, { recursive: true });
  const present = [];
  const queue = [...new Set(ids)];
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      const file = join(cache, `FMA${id}.stl`);
      if (!existsSync(file)) {
        const response = await fetch(`${SOURCE}/FMA${id}.stl`);
        if (!response.ok) continue;
        writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      }
      present.push(id);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return new Set(present);
}

/** Taubin λ|μ smoothing: removes scan faceting without shrinking the shape. */
export function taubin(geometry, iterations = 3, lambda = 0.5, mu = -0.53) {
  const position = geometry.attributes.position.array;
  const index = geometry.index.array;
  const count = position.length / 3;
  const neighbours = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    neighbours[a].add(b).add(c); neighbours[b].add(a).add(c); neighbours[c].add(a).add(b);
  }
  const lists = neighbours.map((set) => Int32Array.from(set));
  const next = new Float32Array(position.length);
  const step = (factor) => {
    for (let v = 0; v < count; v += 1) {
      const list = lists[v];
      if (!list.length) { next.set(position.subarray(v * 3, v * 3 + 3), v * 3); continue; }
      let x = 0, y = 0, z = 0;
      for (let i = 0; i < list.length; i += 1) { const n = list[i] * 3; x += position[n]; y += position[n + 1]; z += position[n + 2]; }
      const k = 1 / list.length;
      next[v * 3] = position[v * 3] + factor * (x * k - position[v * 3]);
      next[v * 3 + 1] = position[v * 3 + 1] + factor * (y * k - position[v * 3 + 1]);
      next[v * 3 + 2] = position[v * 3 + 2] + factor * (z * k - position[v * 3 + 2]);
    }
    position.set(next);
  };
  for (let i = 0; i < iterations; i += 1) { step(lambda); step(mu); }
  geometry.attributes.position.needsUpdate = true;
  return geometry;
}

/**
 * Loads one registered scan in body millimetres with +y up and +z anterior.
 * `target` caps the triangle count; seams in the source meshes sometimes
 * stop topological simplification short, in which case the sloppy
 * simplifier takes over.
 */
export function scan(id, { target = 4000, smooth = 3 } = {}) {
  const bytes = readFileSync(join(cache, `FMA${id}.stl`));
  let geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  geometry.deleteAttribute("normal");
  geometry = mergeVertices(geometry, 1e-3);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position.array;
  const indices = new Uint32Array(geometry.index.array);
  if (indices.length / 3 > target) {
    const goal = Math.min(indices.length, Math.max(120, target) * 3);
    let [result] = MeshoptSimplifier.simplify(indices, positions, 3, goal, 0.01, []);
    if (result.length > goal * 1.6) [result] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, goal, 0.01);
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(result), 1));
    geometry = compact(geometry);
  }
  if (smooth) taubin(geometry, smooth);
  geometry.computeVertexNormals();
  geometry.userData = { source: `BodyParts3D FMA${id}` };
  return geometry;
}

/**
 * Principal-axis coordinate per vertex in [-1, 1]: −1 and 1 are the two
 * ends of a long bone or muscle, 0 its middle. Painters use it for articular
 * cartilage and tendons.
 */
export function axialCoordinate(geometry) {
  const p = geometry.attributes.position.array;
  const count = p.length / 3;
  const mean = new THREE.Vector3();
  for (let v = 0; v < count; v += 1) mean.add(new THREE.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]));
  mean.multiplyScalar(1 / count);
  const c = [0, 0, 0, 0, 0, 0];
  for (let v = 0; v < count; v += 1) {
    const x = p[v * 3] - mean.x, y = p[v * 3 + 1] - mean.y, z = p[v * 3 + 2] - mean.z;
    c[0] += x * x; c[1] += x * y; c[2] += x * z; c[3] += y * y; c[4] += y * z; c[5] += z * z;
  }
  // Power iteration for the dominant eigenvector of the covariance matrix.
  const axis = new THREE.Vector3(0.3, 1, 0.2).normalize();
  for (let i = 0; i < 40; i += 1) {
    axis.set(c[0] * axis.x + c[1] * axis.y + c[2] * axis.z, c[1] * axis.x + c[3] * axis.y + c[4] * axis.z, c[2] * axis.x + c[4] * axis.y + c[5] * axis.z).normalize();
  }
  let min = Infinity, max = -Infinity;
  const t = new Float32Array(count);
  for (let v = 0; v < count; v += 1) {
    t[v] = (p[v * 3] - mean.x) * axis.x + (p[v * 3 + 1] - mean.y) * axis.y + (p[v * 3 + 2] - mean.z) * axis.z;
    min = Math.min(min, t[v]); max = Math.max(max, t[v]);
  }
  for (let v = 0; v < count; v += 1) t[v] = ((t[v] - min) / Math.max(max - min, 1e-6)) * 2 - 1;
  // Angle around the principal axis, for fibre striations that run its length.
  const u = new THREE.Vector3(1, 0, 0).cross(axis);
  if (u.lengthSq() < 1e-6) u.set(0, 0, 1).cross(axis);
  u.normalize();
  const w = axis.clone().cross(u);
  const around = new Float32Array(count);
  for (let v = 0; v < count; v += 1) {
    const x = p[v * 3] - mean.x, y = p[v * 3 + 1] - mean.y, z = p[v * 3 + 2] - mean.z;
    around[v] = Math.atan2(x * w.x + y * w.y + z * w.z, x * u.x + y * u.y + z * u.z);
  }
  return { t, around, axis, center: mean, length: max - min };
}

/**
 * Loads and merges a list of [id, name] scans into one geometry, carrying a
 * per-vertex axial coordinate (`userData.axial`) and a per-vertex bone/muscle
 * index (`userData.member`) for painting. `transform` maps body millimetres
 * into the specimen frame.
 */
export function scanGroup(entries, { target = () => 3000, smooth = 3, transform, filter = () => true } = {}) {
  const geometries = [];
  const names = [];
  for (const [id, name] of entries) {
    if (!filter(name, id) || !existsSync(join(cache, `FMA${id}.stl`))) continue;
    const g = scan(id, { target: typeof target === "function" ? target(name, id) : target, smooth });
    if (transform) {
      g.applyMatrix4(transform);
      g.computeVertexNormals();
    }
    const { t, around } = axialCoordinate(g);
    g.userData.axial = t;
    g.userData.around = around;
    g.userData.member = new Float32Array(g.attributes.position.count).fill(names.length);
    names.push(name);
    geometries.push(g);
  }
  return { geometries, names };
}

/** Body millimetres → specimen units: centred, uniformly scaled. */
export function bodyFrame({ center = [0, 816, 90], scale = 1 / 400 } = {}) {
  return new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-center[0], -center[1], -center[2]));
}

/** Midpoint subdivision followed by Taubin smoothing, for low-poly scans
 *  that will be seen close up. */
export function refine(geometry, levels = 1, smooth = 4) {
  let g = geometry;
  for (let level = 0; level < levels; level += 1) {
    const p = g.attributes.position.array;
    const index = g.index.array;
    const positions = Array.from(p);
    const mid = new Map();
    const midpoint = (a, b) => {
      const key = a < b ? a * 4194304 + b : b * 4194304 + a;
      let m = mid.get(key);
      if (m === undefined) {
        m = positions.length / 3;
        positions.push((p[a * 3] + p[b * 3]) / 2, (p[a * 3 + 1] + p[b * 3 + 1]) / 2, (p[a * 3 + 2] + p[b * 3 + 2]) / 2);
        mid.set(key, m);
      }
      return m;
    };
    const triangles = [];
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      triangles.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    next.setIndex(triangles);
    next.userData = { source: g.userData.source };
    g = next;
  }
  taubin(g, smooth);
  g.computeVertexNormals();
  return g;
}
