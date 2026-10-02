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
export function taperedTube(points, radius, { radial = 14, segments, caps = "both", closed = false, up, flatten = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(toVector), closed, "centripetal");
  const length = curve.getLength();
  const r0 = typeof radius === "function" ? radius(0) : radius;
  const steps = segments ?? Math.max(6, Math.min(240, Math.ceil(length / Math.max(r0 * 0.7, 1e-3))));
  const frames = curve.computeFrenetFrames(steps, closed);
  // Ribbons (ligaments, tendons) keep a fixed thickness direction `up` and
  // are squashed along it by `flatten`.
  if (up) {
    const reference = new THREE.Vector3(...up).normalize();
    for (let i = 0; i <= steps; i += 1) {
      const T = frames.tangents[i];
      const Nn = reference.clone().addScaledVector(T, -reference.dot(T)).normalize();
      frames.normals[i].copy(Nn);
      frames.binormals[i].crossVectors(T, Nn).normalize();
    }
  }
  const positions = [];
  const normals = [];
  const indices = [];
  // Arc length per vertex, so painters can lay rings or stripes along a tube.
  const along = [];
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
      // Offset on an ellipse; its normal scales the other way.
      const ox = cos * flatten * N.x + sin * B.x, oy = cos * flatten * N.y + sin * B.y, oz = cos * flatten * N.z + sin * B.z;
      normal.set(cos / flatten * N.x + sin * B.x, cos / flatten * N.y + sin * B.y, cos / flatten * N.z + sin * B.z).normalize();
      positions.push(point.x + r * ox, point.y + r * oy, point.z + r * oz);
      normals.push(normal.x, normal.y, normal.z);
      along.push(t * length);
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
    along.push(t * length);
    const start = positions.length / 3;
    for (let j = 0; j < radial; j += 1) {
      const source = ring * radial + j;
      positions.push(positions[source * 3], positions[source * 3 + 1], positions[source * 3 + 2]);
      normals.push(tangent.x, tangent.y, tangent.z);
      along.push(t * length);
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
  geometry.userData.along = Float32Array.from(along);
  geometry.userData.cap = new Uint8Array(positions.length / 3);
  for (let v = (steps + 1) * radial; v < positions.length / 3; v += 1) geometry.userData.cap[v] = 1;
  return geometry;
}

/** Joins geometries that share position/normal/index layout. */
export function merge(geometries) {
  const list = geometries.filter(Boolean).map((geometry) => {
    const g = geometry.index ? geometry : geometry.clone();
    g.userData = geometry.userData;
    if (!g.index) {
      const count = g.attributes.position.count;
      g.setIndex([...Array(count).keys()]);
    }
    for (const name of Object.keys(g.attributes)) if (!["position", "normal"].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  });
  if (!list.length) return null;
  const merged = mergeGeometries(list, false);
  // Carry per-vertex painting data (tube arc length, cap flags, axial
  // coordinates…) through the merge.
  const keys = new Set(list.flatMap((g) => Object.keys(g.userData).filter((key) => ArrayBuffer.isView(g.userData[key]) && g.userData[key].length === g.attributes.position.count)));
  for (const key of keys) {
    const Type = list.find((g) => g.userData[key]).userData[key].constructor;
    const out = new Type(merged.attributes.position.count);
    let offset = 0;
    for (const g of list) {
      if (g.userData[key]) out.set(g.userData[key], offset);
      offset += g.attributes.position.count;
    }
    merged.userData[key] = out;
  }
  return merged;
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

/** A smooth ellipsoid mesh, for small nodules that a meshing grid would blur. */
export function ellipsoidGeometry(center, radii, { width = 20, height = 14, rotation = [0, 0, 0] } = {}) {
  const geometry = new THREE.SphereGeometry(1, width, height);
  geometry.deleteAttribute("uv");
  return bakeTransform(geometry, { position: center, rotation, scale: radii });
}

/**
 * Cuts a closed triangle mesh with a plane, keeping the side where
 * n·p ≤ offset, and closes the opening with a flat cap. Cap vertices are
 * flagged in `userData.cap` and carry their distance to the cut outline in
 * `userData.rim`, so a painter can draw cortical bone around marrow.
 */
export function clipMesh(geometry, normalArray, offset, { spacing } = {}) {
  const n = new THREE.Vector3(...normalArray).normalize();
  const src = geometry.index ? geometry : geometry.clone().setIndex([...Array(geometry.attributes.position.count).keys()]);
  const P = src.attributes.position.array;
  const N = src.attributes.normal.array;
  const I = src.index.array;
  const positions = Array.from(P);
  const normals = Array.from(N);
  const distance = (v) => P[v * 3] * n.x + P[v * 3 + 1] * n.y + P[v * 3 + 2] * n.z - offset;
  const cut = new Map();
  const point = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (cut.has(key)) return cut.get(key);
    const da = distance(a), db = distance(b);
    const t = da / (da - db);
    const index = positions.length / 3;
    for (let c = 0; c < 3; c += 1) {
      positions.push(P[a * 3 + c] + (P[b * 3 + c] - P[a * 3 + c]) * t);
      normals.push(N[a * 3 + c] + (N[b * 3 + c] - N[a * 3 + c]) * t);
    }
    cut.set(key, index);
    return index;
  };
  const triangles = [];
  const segments = [];
  for (let t = 0; t < I.length; t += 3) {
    const tri = [I[t], I[t + 1], I[t + 2]];
    const inside = tri.map((v) => distance(v) <= 0);
    const count = inside.filter(Boolean).length;
    if (count === 3) { triangles.push(...tri); continue; }
    if (count === 0) continue;
    // Rotate so the odd vertex out comes first.
    const order = [0, 1, 2].map((i) => (i + inside.findIndex((value) => value === (count === 1))) % 3);
    const [a, b, c] = order.map((i) => tri[i]);
    if (count === 1) {
      const ab = point(a, b), ac = point(a, c);
      triangles.push(a, ab, ac);
      segments.push([ab, ac]);
    } else {
      const ab = point(a, b), ac = point(a, c);
      triangles.push(ab, b, c, ab, c, ac);
      segments.push([ac, ab]);
    }
  }
  // Chain segments into closed outlines and triangulate each in the plane.
  const next = new Map();
  segments.forEach(([from, to]) => next.set(from, to));
  const u = new THREE.Vector3(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0).cross(n).normalize();
  const w = n.clone().cross(u);
  const capStart = positions.length / 3;
  const outlines = [];
  const visited = new Set();
  for (const [startVertex] of next) {
    if (visited.has(startVertex)) continue;
    const loop = [];
    let v = startVertex;
    while (v !== undefined && !visited.has(v)) { visited.add(v); loop.push(v); v = next.get(v); }
    if (loop.length >= 3) outlines.push(loop);
  }
  const rimSegments = [];
  for (const loop of outlines) {
    const contour = loop.map((v) => {
      const p = new THREE.Vector3(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
      return new THREE.Vector2(p.dot(u), p.dot(w));
    });
    contour.forEach((p, i) => rimSegments.push([p, contour[(i + 1) % contour.length]]));
    // Interior Steiner points (single-point holes for the ear-clipper) give
    // the flat section vertices to carry marrow, lamellae and other painting.
    const bounds = new THREE.Box2().setFromPoints(contour);
    const size = bounds.getSize(new THREE.Vector2());
    const step = spacing ?? Math.max(size.x, size.y) / 36;
    const inside = (q) => {
      let hit = false;
      for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
        const a = contour[i], b = contour[j];
        if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
      }
      return hit;
    };
    const edgeDistance = (q) => {
      let best = Infinity;
      for (let i = 0; i < contour.length; i += 1) {
        const a = contour[i], b = contour[(i + 1) % contour.length];
        const ab = b.clone().sub(a);
        const h = THREE.MathUtils.clamp(q.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-12), 0, 1);
        best = Math.min(best, a.clone().addScaledVector(ab, h).distanceTo(q));
      }
      return best;
    };
    const steiner = [];
    if (step > 0) {
      for (let gx = bounds.min.x + step * 0.5; gx < bounds.max.x; gx += step) {
        for (let gy = bounds.min.y + step * 0.5; gy < bounds.max.y; gy += step) {
          const q = new THREE.Vector2(gx + (Math.sin(gy * 91.7) * 0.15) * step, gy);
          if (inside(q) && edgeDistance(q) > step * 0.45) steiner.push(q);
        }
      }
    }
    const base = positions.length / 3;
    const toWorld = (q) => u.clone().multiplyScalar(q.x).addScaledVector(w, q.y).addScaledVector(n, offset);
    loop.forEach((v) => {
      positions.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
      normals.push(n.x, n.y, n.z);
    });
    steiner.forEach((q) => {
      const p = toWorld(q);
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
    });
    const faces = delaunayFlip([...contour, ...steiner], THREE.ShapeUtils.triangulateShape(contour, steiner.map((q) => [q])));
    const clockwise = THREE.ShapeUtils.isClockWise(contour);
    for (const [a, b, c] of faces) triangles.push(...(clockwise ? [base + a, base + b, base + c] : [base + a, base + c, base + b]));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  out.setIndex(triangles);
  const total = positions.length / 3;
  const cap = new Uint8Array(total);
  const rim = new Float32Array(total);
  const q = new THREE.Vector2(), closest = new THREE.Vector2();
  for (let v = capStart; v < total; v += 1) {
    cap[v] = 1;
    const p = new THREE.Vector3(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
    q.set(p.dot(u), p.dot(w));
    let best = Infinity;
    for (const [a, b] of rimSegments) {
      const ab = b.clone().sub(a);
      const h = THREE.MathUtils.clamp(q.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-12), 0, 1);
      closest.copy(a).addScaledVector(ab, h);
      best = Math.min(best, closest.distanceTo(q));
    }
    rim[v] = best;
  }
  out.userData = { ...geometry.userData, cap, rim };
  // Drop painting arrays that no longer line up with the clipped vertices.
  for (const key of Object.keys(out.userData)) {
    if (ArrayBuffer.isView(out.userData[key]) && out.userData[key].length !== total) delete out.userData[key];
  }
  return compact(out);
}

/**
 * Lawson edge flips: turns an ear-clipped polygon triangulation into the
 * constrained Delaunay one, so painted sections interpolate across
 * well-shaped triangles rather than slivers. Boundary edges never flip.
 */
function delaunayFlip(points, faces) {
  const tris = faces.map((f) => [...f]);
  const key = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  const edges = new Map();
  const link = (t) => {
    for (let e = 0; e < 3; e += 1) {
      const k = key(tris[t][e], tris[t][(e + 1) % 3]);
      const list = edges.get(k);
      if (list) { if (!list.includes(t)) list.push(t); } else edges.set(k, [t]);
    }
  };
  const unlink = (t) => {
    for (let e = 0; e < 3; e += 1) {
      const k = key(tris[t][e], tris[t][(e + 1) % 3]);
      const list = edges.get(k);
      if (!list) continue;
      const i = list.indexOf(t);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) edges.delete(k);
    }
  };
  tris.forEach((_, t) => link(t));
  const inCircle = (a, b, c, d) => {
    const ax = a.x - d.x, ay = a.y - d.y, bx = b.x - d.x, by = b.y - d.y, cx = c.x - d.x, cy = c.y - d.y;
    const det = (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay);
    const orient = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return orient > 0 ? det > 1e-14 : det < -1e-14;
  };
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  let changed = true;
  for (let pass = 0; changed && pass < 60; pass += 1) {
    changed = false;
    for (const [k, list] of [...edges]) {
      if (!list || list.length !== 2) continue;
      const [t0, t1] = list;
      const a = Math.floor(k / 1048576), b = k % 1048576;
      const c = tris[t0].find((v) => v !== a && v !== b);
      const d = tris[t1].find((v) => v !== a && v !== b);
      if (c === undefined || d === undefined) continue;
      if (!inCircle(points[a], points[b], points[c], points[d])) continue;
      // Only flip inside a convex quad, so the new edge stays in the polygon.
      const s1 = cross(points[c], points[d], points[a]), s2 = cross(points[c], points[d], points[b]);
      if (s1 * s2 >= 0) continue;
      // Keep each triangle's winding consistent with the one it replaces.
      const orientation = Math.sign(cross(points[tris[t0][0]], points[tris[t0][1]], points[tris[t0][2]]));
      unlink(t0); unlink(t1);
      tris[t0] = [c, d, a];
      tris[t1] = [d, c, b];
      if (Math.sign(cross(points[c], points[d], points[a])) !== orientation) tris[t0] = [d, c, a];
      if (Math.sign(cross(points[d], points[c], points[b])) !== orientation) tris[t1] = [c, d, b];
      link(t0); link(t1);
      changed = true;
    }
  }
  return tris;
}
