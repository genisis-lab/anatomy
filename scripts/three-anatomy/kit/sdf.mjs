import * as THREE from "three";

// Signed distance fields: negative inside, positive outside. Every field is
// a `{ d(x, y, z), b }` pair where `b` is a conservative bounding box
// [minX, minY, minZ, maxX, maxY, maxZ]. The bounds let unions skip far-away
// children, which keeps specimens with hundreds of primitives fast to mesh.

const INF = Number.POSITIVE_INFINITY;

export function boxDistance(b, x, y, z) {
  const dx = Math.max(b[0] - x, 0, x - b[3]);
  const dy = Math.max(b[1] - y, 0, y - b[4]);
  const dz = Math.max(b[2] - z, 0, z - b[5]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function grow(b, r) {
  return [b[0] - r, b[1] - r, b[2] - r, b[3] + r, b[4] + r, b[5] + r];
}

function mergeBounds(list) {
  const b = [INF, INF, INF, -INF, -INF, -INF];
  for (const item of list) {
    for (let i = 0; i < 3; i += 1) {
      b[i] = Math.min(b[i], item.b[i]);
      b[i + 3] = Math.max(b[i + 3], item.b[i + 3]);
    }
  }
  return b;
}

const v3 = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

// ------------------------------------------------------------------ primitives

export function sphere(center, radius) {
  const [cx, cy, cz] = v3(center);
  return {
    d: (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - radius,
    b: [cx - radius, cy - radius, cz - radius, cx + radius, cy + radius, cz + radius],
  };
}

/** Ellipsoid bound by Inigo Quilez — not exact, but smooth and well behaved. */
export function ellipsoid(center, radii) {
  const [cx, cy, cz] = v3(center);
  const [rx, ry, rz] = radii;
  const m = Math.min(rx, ry, rz);
  return {
    d: (x, y, z) => {
      const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      if (k0 < 1e-9) return -m;
      const qx = px / rx, qy = py / ry, qz = pz / rz;
      const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
      return (k0 * (k0 - 1)) / k1;
    },
    b: [cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz],
  };
}

/** Exact round cone from a (radius ra) to b (radius rb). */
export function roundCone(a, b, ra, rb) {
  const [ax, ay, az] = v3(a);
  const [bx, by, bz] = v3(b);
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / Math.max(l2, 1e-12);
  const rmax = Math.max(ra, rb);
  if (l2 < 1e-12) return sphere(a, rmax);
  return {
    d: (x, y, z) => {
      const pax = x - ax, pay = y - ay, paz = z - az;
      const yv = pax * bax + pay * bay + paz * baz;
      const zv = yv - l2;
      const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yv * yv * l2;
      const z2 = zv * zv * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
    },
    b: [
      Math.min(ax - ra, bx - rb), Math.min(ay - ra, by - rb), Math.min(az - ra, bz - rb),
      Math.max(ax + ra, bx + rb), Math.max(ay + ra, by + rb), Math.max(az + ra, bz + rb),
    ],
  };
}

export const capsule = (a, b, r) => roundCone(a, b, r, r);

export function box(center, half, round = 0) {
  const [cx, cy, cz] = v3(center);
  const [hx, hy, hz] = half.map((h) => h - round);
  return {
    d: (x, y, z) => {
      const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy, qz = Math.abs(z - cz) - hz;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - round;
    },
    b: [cx - half[0], cy - half[1], cz - half[2], cx + half[0], cy + half[1], cz + half[2]],
  };
}

/** Torus lying in the XZ plane around +Y. */
export function torus(center, major, minor) {
  const [cx, cy, cz] = v3(center);
  return {
    d: (x, y, z) => {
      const qx = Math.hypot(x - cx, z - cz) - major;
      return Math.hypot(qx, y - cy) - minor;
    },
    b: [cx - major - minor, cy - minor, cz - major - minor, cx + major + minor, cy + minor, cz + major + minor],
  };
}

/** Capped cylinder between a and b with optional edge rounding. */
export function cylinder(a, b, radius, round = 0) {
  const A = new THREE.Vector3(...v3(a));
  const B = new THREE.Vector3(...v3(b));
  const axis = B.clone().sub(A);
  const length = axis.length();
  axis.normalize();
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const r = radius - round;
  const h = length / 2 - round;
  return {
    d: (x, y, z) => {
      const px = x - mid.x, py = y - mid.y, pz = z - mid.z;
      const along = px * axis.x + py * axis.y + pz * axis.z;
      const rx = px - axis.x * along, ry = py - axis.y * along, rz = pz - axis.z * along;
      const dx = Math.hypot(rx, ry, rz) - r;
      const dy = Math.abs(along) - h;
      return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - round;
    },
    b: grow(mergeBounds([{ b: [A.x, A.y, A.z, A.x, A.y, A.z] }, { b: [B.x, B.y, B.z, B.x, B.y, B.z] }]), radius),
  };
}

/** Half-space; positive on the side the normal points to. */
export function plane(normal, offset) {
  const n = new THREE.Vector3(...v3(normal)).normalize();
  return {
    d: (x, y, z) => x * n.x + y * n.y + z * n.z - offset,
    b: [-INF, -INF, -INF, INF, INF, INF],
    normal: n,
    offset,
  };
}

/**
 * A tube following sampled points with per-point radii — the workhorse for
 * vessels, ducts, intestines and any organ that is fundamentally a curved
 * swept volume. Points may be arrays or Vector3s.
 */
export function tube(points, radii) {
  const pts = points.map(v3);
  const rs = typeof radii === "number" ? pts.map(() => radii) : radii;
  const segments = [];
  for (let i = 0; i < pts.length - 1; i += 1) segments.push(roundCone(pts[i], pts[i + 1], rs[i], rs[i + 1]));
  return union(...segments);
}

/** Samples a centripetal Catmull–Rom curve through control points. */
export function sampleCurve(controls, count = 48, closed = false) {
  const curve = new THREE.CatmullRomCurve3(controls.map((p) => new THREE.Vector3(...v3(p))), closed, "centripetal");
  return curve.getSpacedPoints(count).map((p) => [p.x, p.y, p.z]);
}

/** A tube along a smooth curve whose radius is a function of t ∈ [0, 1]. */
export function curveTube(controls, radius, count = 48) {
  const pts = sampleCurve(controls, count);
  const radii = pts.map((_, i) => (typeof radius === "function" ? radius(i / (pts.length - 1)) : radius));
  return tube(pts, radii);
}

// ------------------------------------------------------------------ operations

export function union(...items) {
  const list = items.flat().filter(Boolean);
  if (list.length === 1) return list[0];
  return {
    d: (x, y, z) => {
      let best = INF;
      for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        // A child whose box is farther than the best distance so far cannot
        // win. Inside a box (distance 0) the child must always be evaluated.
        const bound = boxDistance(item.b, x, y, z);
        if (bound > 0 && bound >= best) continue;
        const d = item.d(x, y, z);
        if (d < best) best = d;
      }
      return best;
    },
    b: mergeBounds(list),
  };
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smoothUnion(k, ...items) {
  const list = items.flat().filter(Boolean);
  if (list.length === 1) return list[0];
  if (!(k > 0)) return union(list);
  return {
    d: (x, y, z) => {
      let best = INF;
      for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        const bound = boxDistance(item.b, x, y, z);
        if (bound > 0 && bound >= best + k) continue;
        const d = item.d(x, y, z);
        best = best === INF ? d : smin(best, d, k);
      }
      return best;
    },
    b: grow(mergeBounds(list), k * 0.25),
  };
}

export function subtract(a, ...cutters) {
  const cut = union(...cutters);
  return {
    d: (x, y, z) => {
      const da = a.d(x, y, z);
      const bound = boxDistance(cut.b, x, y, z);
      if (bound > 0 && bound >= -da) return da;
      return Math.max(da, -cut.d(x, y, z));
    },
    b: a.b,
  };
}

export function smoothSubtract(k, a, ...cutters) {
  const cut = union(...cutters);
  return {
    d: (x, y, z) => {
      const da = a.d(x, y, z);
      const bound = boxDistance(cut.b, x, y, z);
      if (bound > 0 && bound >= k - da) return da;
      return -smin(-da, cut.d(x, y, z), k);
    },
    b: a.b,
  };
}

export function intersect(...items) {
  const list = items.flat().filter(Boolean);
  const b = [-INF, -INF, -INF, INF, INF, INF];
  for (const item of list) {
    for (let i = 0; i < 3; i += 1) {
      b[i] = Math.max(b[i], item.b[i]);
      b[i + 3] = Math.min(b[i + 3], item.b[i + 3]);
    }
  }
  return {
    d: (x, y, z) => {
      let worst = -INF;
      for (let i = 0; i < list.length; i += 1) worst = Math.max(worst, list[i].d(x, y, z));
      return worst;
    },
    b,
  };
}

export function smoothIntersect(k, a, b) {
  return {
    d: (x, y, z) => -smin(-a.d(x, y, z), -b.d(x, y, z), k),
    b: intersect(a, b).b,
  };
}

export function offset(item, amount) {
  return { d: (x, y, z) => item.d(x, y, z) - amount, b: grow(item.b, Math.max(0, amount)) };
}

/** Hollow wall of the given thickness centred on the original surface. */
export function shell(item, thickness) {
  return { d: (x, y, z) => Math.abs(item.d(x, y, z)) - thickness / 2, b: grow(item.b, thickness / 2) };
}

/** Wall of the given thickness grown inward from the original surface. */
export function innerShell(item, thickness) {
  return {
    d: (x, y, z) => {
      const d = item.d(x, y, z);
      return Math.max(d, -d - thickness);
    },
    b: item.b,
  };
}

/** Adds a scalar field to the distance. Keep amplitudes small relative to the
 *  meshing cell so the field stays close to Lipschitz-continuous. */
export function displace(item, field, amplitude = 0.05) {
  return {
    d: (x, y, z) => {
      const d = item.d(x, y, z);
      if (d > amplitude * 2) return d;
      return d + field(x, y, z) * amplitude;
    },
    b: grow(item.b, amplitude),
  };
}

/** Rigid transform plus optional uniform scale. */
export function transform(item, { position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 } = {}) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(scale, scale, scale),
  );
  const inverse = matrix.clone().invert();
  const e = inverse.elements;
  const corners = [];
  for (let i = 0; i < 8; i += 1) {
    corners.push(new THREE.Vector3(
      i & 1 ? item.b[3] : item.b[0], i & 2 ? item.b[4] : item.b[1], i & 4 ? item.b[5] : item.b[2],
    ).applyMatrix4(matrix));
  }
  const box3 = new THREE.Box3().setFromPoints(corners);
  return {
    d: (x, y, z) => item.d(
      e[0] * x + e[4] * y + e[8] * z + e[12],
      e[1] * x + e[5] * y + e[9] * z + e[13],
      e[2] * x + e[6] * y + e[10] * z + e[14],
    ) * scale,
    b: [box3.min.x, box3.min.y, box3.min.z, box3.max.x, box3.max.y, box3.max.z],
  };
}

/** Non-uniform scale. The distance is scaled by the smallest factor, which
 *  keeps it a conservative bound. */
export function stretch(item, [sx, sy, sz], pivot = [0, 0, 0]) {
  const [px, py, pz] = pivot;
  const m = Math.min(sx, sy, sz);
  return {
    d: (x, y, z) => item.d((x - px) / sx + px, (y - py) / sy + py, (z - pz) / sz + pz) * m,
    b: [
      (item.b[0] - px) * sx + px, (item.b[1] - py) * sy + py, (item.b[2] - pz) * sz + pz,
      (item.b[3] - px) * sx + px, (item.b[4] - py) * sy + py, (item.b[5] - pz) * sz + pz,
    ],
  };
}

/** Restricts evaluation to a box, returning a cheap bound outside it. */
export function bounded(item, bounds) {
  return { d: item.d, b: bounds };
}

// ------------------------------------------------------------------ queries

export function gradient(item, x, y, z, h = 1e-3, out = new THREE.Vector3()) {
  out.set(
    item.d(x + h, y, z) - item.d(x - h, y, z),
    item.d(x, y + h, z) - item.d(x, y - h, z),
    item.d(x, y, z + h) - item.d(x, y, z - h),
  );
  const length = out.length();
  return length > 1e-12 ? out.multiplyScalar(1 / length) : out.set(0, 1, 0);
}

/** Moves a point onto the iso-surface `d = level` along the gradient. */
export function project(item, point, level = 0, iterations = 6, h = 1e-3) {
  const p = point.clone ? point.clone() : new THREE.Vector3(...point);
  const g = new THREE.Vector3();
  for (let i = 0; i < iterations; i += 1) {
    const d = item.d(p.x, p.y, p.z) - level;
    if (Math.abs(d) < 1e-5) break;
    gradient(item, p.x, p.y, p.z, h, g);
    p.addScaledVector(g, -d);
  }
  return p;
}
