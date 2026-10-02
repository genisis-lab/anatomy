import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "meshoptimizer";
import { gradient, project } from "./sdf.mjs";
import { mulberry32 } from "./noise.mjs";
import { compact } from "./mesher.mjs";

const toVector = (p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p));

/**
 * A swept tube whose radius can taper along its length. Unlike
 * TubeGeometry it closes its ends and supports radius as a function of t,
 * so vessels narrow naturally toward their terminal branches.
 */
export function taperedTube(points, radius, { radial = 14, segments, caps = "both", closed = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(toVector), closed, "centripetal");
  const length = curve.getLength();
  const r0 = typeof radius === "function" ? radius(0) : radius;
  const steps = segments ?? Math.max(6, Math.min(240, Math.ceil(length / Math.max(r0 * 0.7, 1e-3))));
  const frames = curve.computeFrenetFrames(steps, closed);
  const positions = [];
  const normals = [];
  const indices = [];
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    curve.getPointAt(t, point);
    const r = typeof radius === "function" ? radius(t) : radius;
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j < radial; j += 1) {
      const angle = (j / radial) * Math.PI * 2;
      const sin = Math.sin(angle), cos = -Math.cos(angle);
      normal.set(cos * N.x + sin * B.x, cos * N.y + sin * B.y, cos * N.z + sin * B.z).normalize();
      positions.push(point.x + r * normal.x, point.y + r * normal.y, point.z + r * normal.z);
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * radial + j;
      const b = (i + 1) * radial + j;
      const c = (i + 1) * radial + ((j + 1) % radial);
      const d = i * radial + ((j + 1) % radial);
      indices.push(a, b, d, b, c, d);
    }
  }
  const cap = (ring, t, flip) => {
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).multiplyScalar(flip ? -1 : 1);
    const centerIndex = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    normals.push(tangent.x, tangent.y, tangent.z);
    const start = positions.length / 3;
    for (let j = 0; j < radial; j += 1) {
      const source = ring * radial + j;
      positions.push(positions[source * 3], positions[source * 3 + 1], positions[source * 3 + 2]);
      normals.push(tangent.x, tangent.y, tangent.z);
    }
    for (let j = 0; j < radial; j += 1) {
      const a = start + j, b = start + ((j + 1) % radial);
      if (flip) indices.push(centerIndex, b, a);
      else indices.push(centerIndex, a, b);
    }
  };
  if (!closed && (caps === "both" || caps === "start")) cap(0, 0, true);
  if (!closed && (caps === "both" || caps === "end")) cap(steps, 1, false);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Joins geometries that share position/normal/index layout. */
export function merge(geometries) {
  const list = geometries.filter(Boolean).map((geometry) => {
    const g = geometry.index ? geometry : geometry.clone();
    if (!g.index) {
      const count = g.attributes.position.count;
      g.setIndex([...Array(count).keys()]);
    }
    for (const name of Object.keys(g.attributes)) if (!["position", "normal"].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  });
  if (!list.length) return null;
  return mergeGeometries(list, false);
}

/**
 * Grows a branching vessel network that hugs the surface of a field — the
 * coronary-style vessels that make the original atlas organs read as living
 * tissue. Returns an array of { points, radii } branches.
 */
export function growVessels(field, {
  seed = 1,
  roots,
  step = 0.03,
  hug = 0.45,
  wander = 0.35,
  branchEvery = 0.22,
  branchAngle = 0.75,
  shrink = 0.68,
  minRadius = 0.004,
  keep = () => true,
  maxBranches = 400,
} = {}) {
  const random = mulberry32(seed);
  const branches = [];
  const g = new THREE.Vector3();
  const grow = (start, direction, radius, length, generations) => {
    if (branches.length >= maxBranches || radius < minRadius) return;
    let p = project(field, toVector(start), radius * hug);
    let d = toVector(direction).normalize();
    const points = [p.clone()];
    const radii = [radius];
    let travelled = 0;
    let nextBranch = branchEvery * (0.55 + random() * 0.6);
    let side = random() < 0.5 ? -1 : 1;
    const children = [];
    while (travelled < length) {
      gradient(field, p.x, p.y, p.z, 1e-3, g);
      d.addScaledVector(g, -d.dot(g)).normalize();
      d.applyAxisAngle(g, (random() - 0.5) * wander);
      const next = p.clone().addScaledVector(d, step);
      const r = radius * (1 - 0.72 * (travelled / length));
      p = project(field, next, r * hug);
      if (!keep(p)) break;
      travelled += step;
      points.push(p.clone());
      radii.push(r);
      if (generations > 0 && travelled >= nextBranch) {
        const childDirection = d.clone().applyAxisAngle(g, side * branchAngle * (0.75 + random() * 0.5));
        children.push([p.clone(), childDirection, r * shrink, length * (0.42 + random() * 0.3), generations - 1]);
        side = -side;
        nextBranch += branchEvery * (0.6 + random() * 0.7);
      }
    }
    if (points.length >= 3) branches.push({ points, radii });
    children.forEach((child) => grow(...child));
  };
  roots.forEach((root) => grow(root.at, root.dir, root.radius, root.length, root.generations ?? 3));
  return branches;
}

/** Converts grown branches into one tapered-tube geometry. */
export function vesselGeometry(branches, { radial = 10 } = {}) {
  return merge(branches.map(({ points, radii }) => {
    const last = radii.length - 1;
    return taperedTube(points, (t) => {
      const f = t * last;
      const i = Math.min(last - 1, Math.floor(f));
      const r = radii[i] + (radii[i + 1] - radii[i]) * (f - i);
      // Taper the final stretch to a point so terminal twigs dissolve into
      // the surface instead of ending in a blunt cap.
      return r * (t > 0.85 ? Math.max(0.15, 1 - (t - 0.85) / 0.15) : 1);
    }, { radial });
  }));
}

/** A tube that follows control points projected onto a field's surface. */
export function surfaceTube(field, controls, radius, { hug = 0.5, samples = 60, ...options } = {}) {
  const curve = new THREE.CatmullRomCurve3(controls.map(toVector), false, "centripetal");
  const points = curve.getSpacedPoints(samples).map((p) => {
    const r = typeof radius === "function" ? radius(0.5) : radius;
    return project(field, p, r * hug);
  });
  return taperedTube(points, radius, options);
}

/**
 * Attribute-aware decimation. Normals are weighted so curved regions keep
 * their density while flat sections collapse; borders (cut seams) stay put.
 */
export function simplify(geometry, { ratio = 0.5, error = 0.004, colorWeight = 1.2 } = {}) {
  if (ratio >= 1) return geometry;
  const positions = geometry.attributes.position.array;
  const normals = geometry.attributes.normal.array;
  const colors = geometry.attributes.color?.array;
  const stride = colors ? 6 : 3;
  const attributes = new Float32Array((positions.length / 3) * stride);
  for (let v = 0; v < positions.length / 3; v += 1) {
    for (let c = 0; c < 3; c += 1) attributes[v * stride + c] = normals[v * 3 + c];
    // Square-root colour so differences between dark tones still count.
    if (colors) for (let c = 0; c < 3; c += 1) attributes[v * stride + 3 + c] = Math.sqrt(colors[v * 3 + c]);
  }
  const weights = colors ? [0.6, 0.6, 0.6, colorWeight, colorWeight, colorWeight] : [0.6, 0.6, 0.6];
  const indices = new Uint32Array(geometry.index.array);
  const target = Math.max(3, Math.floor((indices.length / 3) * ratio) * 3);
  const [result] = MeshoptSimplifier.simplifyWithAttributes(
    indices, positions, 3, attributes, stride, weights, null, target, error, ["LockBorder"],
  );
  const out = geometry.clone();
  out.userData = { ...geometry.userData };
  out.setIndex(new THREE.BufferAttribute(new Uint32Array(result), 1));
  return compact(out);
}

/** Applies an object's world transform to a geometry copy. */
export function bakeTransform(geometry, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale, scale, scale])),
  );
  const out = geometry.clone();
  out.applyMatrix4(matrix);
  if (matrix.determinant() < 0 && out.index) {
    const index = out.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const tmp = index[i + 1];
      index[i + 1] = index[i + 2];
      index[i + 2] = tmp;
    }
  }
  out.userData = { ...geometry.userData };
  return out;
}
