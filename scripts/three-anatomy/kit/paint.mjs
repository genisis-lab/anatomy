import * as THREE from "three";
import { fbm3, ridged3, simplex3, worley3 } from "./noise.mjs";

// Surface painting. Vertex colours are authored in sRGB hex and stored
// linear, which is what glTF COLOR_0 and three's vertexColors expect.

export function color(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export function mix(a, b, t) {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function scale(c, s) {
  return [c[0] * s, c[1] * s, c[2] * s];
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Builds a palette lookup from [stop, hex] pairs over [0, 1]. */
export function ramp(stops) {
  const parsed = stops.map(([t, hex]) => [t, color(hex)]);
  return (x) => {
    if (x <= parsed[0][0]) return parsed[0][1];
    for (let i = 1; i < parsed.length; i += 1) {
      if (x <= parsed[i][0]) {
        const [t0, c0] = parsed[i - 1];
        const [t1, c1] = parsed[i];
        return mix(c0, c1, (x - t0) / (t1 - t0));
      }
    }
    return parsed[parsed.length - 1][1];
  };
}

// ------------------------------------------------------------------ occlusion

const HEMISPHERE = (() => {
  const directions = [];
  const count = 28;
  for (let i = 0; i < count; i += 1) {
    const z = Math.sqrt((i + 0.5) / count); // cosine-weighted
    const r = Math.sqrt(1 - z * z);
    const phi = i * 2.399963229728653;
    directions.push([Math.cos(phi) * r, Math.sin(phi) * r, z]);
  }
  return directions;
})();

/**
 * Bakes ambient occlusion for every part of a specimen together, so a vessel
 * lying on an organ darkens the tissue around it and a crevice between lobes
 * reads as depth. Triangles are voxelised, the exterior is flood-filled,
 * and short cosine-weighted rays are marched through the occupancy grid.
 */
export function bakeOcclusion(geometries, { resolution = 176, reach = 0.16 } = {}) {
  const box = new THREE.Box3();
  geometries.forEach((g) => {
    g.computeBoundingBox();
    box.union(g.boundingBox);
  });
  const size = box.getSize(new THREE.Vector3());
  const voxel = Math.max(size.x, size.y, size.z) / resolution;
  const pad = 3;
  const origin = box.min.clone().subScalar(voxel * pad);
  const nx = Math.ceil(size.x / voxel) + pad * 2;
  const ny = Math.ceil(size.y / voxel) + pad * 2;
  const nz = Math.ceil(size.z / voxel) + pad * 2;
  const grid = new Uint8Array(nx * ny * nz); // 0 empty, 1 surface, 2 exterior
  const at = (i, j, k) => i + nx * (j + ny * k);
  const mark = (x, y, z) => {
    const i = Math.floor((x - origin.x) / voxel), j = Math.floor((y - origin.y) / voxel), k = Math.floor((z - origin.z) / voxel);
    if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) grid[at(i, j, k)] = 1;
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const g of geometries) {
    const p = g.attributes.position.array;
    const index = g.index.array;
    for (let t = 0; t < index.length; t += 3) {
      a.fromArray(p, index[t] * 3); b.fromArray(p, index[t + 1] * 3); c.fromArray(p, index[t + 2] * 3);
      const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const steps = Math.max(1, Math.ceil(longest / (voxel * 0.5)));
      for (let u = 0; u <= steps; u += 1) for (let v = 0; v <= steps - u; v += 1) {
        const wu = u / steps, wv = v / steps, ww = 1 - wu - wv;
        mark(a.x * ww + b.x * wu + c.x * wv, a.y * ww + b.y * wu + c.y * wv, a.z * ww + b.z * wu + c.z * wv);
      }
    }
  }
  // Flood the exterior from the padded border; whatever is unreached is solid.
  const queue = new Int32Array(nx * ny * nz);
  let head = 0, tail = 0;
  const push = (i, j, k) => {
    const id = at(i, j, k);
    if (grid[id] !== 0) return;
    grid[id] = 2;
    queue[tail++] = id;
  };
  push(0, 0, 0);
  while (head < tail) {
    const id = queue[head++];
    const i = id % nx, j = Math.floor(id / nx) % ny, k = Math.floor(id / (nx * ny));
    if (i > 0) push(i - 1, j, k);
    if (i < nx - 1) push(i + 1, j, k);
    if (j > 0) push(i, j - 1, k);
    if (j < ny - 1) push(i, j + 1, k);
    if (k > 0) push(i, j, k - 1);
    if (k < nz - 1) push(i, j, k + 1);
  }
  const solid = (x, y, z) => {
    const i = Math.floor((x - origin.x) / voxel), j = Math.floor((y - origin.y) / voxel), k = Math.floor((z - origin.z) / voxel);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return false;
    return grid[at(i, j, k)] !== 2;
  };

  const maxDistance = Math.max(size.x, size.y, size.z) * reach;
  const steps = Math.max(4, Math.ceil(maxDistance / (voxel * 0.85)));
  const stepLength = maxDistance / steps;
  const n = new THREE.Vector3(), tangent = new THREE.Vector3(), bitangent = new THREE.Vector3();
  return geometries.map((g) => {
    const p = g.attributes.position.array;
    const normals = g.attributes.normal.array;
    const count = p.length / 3;
    const ao = new Float32Array(count);
    for (let v = 0; v < count; v += 1) {
      n.fromArray(normals, v * 3);
      tangent.set(Math.abs(n.x) < 0.9 ? 1 : 0, Math.abs(n.x) < 0.9 ? 0 : 1, 0).cross(n).normalize();
      bitangent.crossVectors(n, tangent);
      const ox = p[v * 3] + n.x * voxel * 1.6, oy = p[v * 3 + 1] + n.y * voxel * 1.6, oz = p[v * 3 + 2] + n.z * voxel * 1.6;
      let open = 0;
      for (const [hx, hy, hz] of HEMISPHERE) {
        const dx = tangent.x * hx + bitangent.x * hy + n.x * hz;
        const dy = tangent.y * hx + bitangent.y * hy + n.y * hz;
        const dz = tangent.z * hx + bitangent.z * hy + n.z * hz;
        let visible = 1;
        for (let s = 1; s <= steps; s += 1) {
          const d = s * stepLength;
          if (solid(ox + dx * d, oy + dy * d, oz + dz * d)) {
            visible = Math.pow(s / steps, 0.6) * 0.65;
            break;
          }
        }
        open += visible;
      }
      ao[v] = open / HEMISPHERE.length;
    }
    return ao;
  });
}

// ------------------------------------------------------------------ curvature

/**
 * Signed mean-curvature proxy per vertex, scaled by `length` and clamped to
 * [-1, 1]: positive in creases, negative on ridges. Used to darken sulci,
 * folds and joints and to catch light on crests, like an atlas illustration.
 */
export function curvature(geometry, length, smoothing = 2) {
  const p = geometry.attributes.position.array;
  const normals = geometry.attributes.normal.array;
  const index = geometry.index.array;
  const count = p.length / 3;
  let value = new Float32Array(count);
  const weight = new Float32Array(count);
  const accumulate = (i, j) => {
    const dx = p[j * 3] - p[i * 3], dy = p[j * 3 + 1] - p[i * 3 + 1], dz = p[j * 3 + 2] - p[i * 3 + 2];
    const l2 = dx * dx + dy * dy + dz * dz;
    if (l2 < 1e-14) return;
    value[i] += (dx * normals[i * 3] + dy * normals[i * 3 + 1] + dz * normals[i * 3 + 2]) / l2;
    weight[i] += 1;
  };
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    accumulate(a, b); accumulate(b, a); accumulate(b, c); accumulate(c, b); accumulate(c, a); accumulate(a, c);
  }
  for (let v = 0; v < count; v += 1) value[v] = weight[v] ? Math.max(-1, Math.min(1, (value[v] / weight[v]) * length)) : 0;
  for (let pass = 0; pass < smoothing; pass += 1) {
    const next = new Float32Array(count);
    const total = new Float32Array(count);
    for (let t = 0; t < index.length; t += 3) {
      const tri = [index[t], index[t + 1], index[t + 2]];
      for (const i of tri) for (const j of tri) {
        next[i] += value[j];
        total[i] += 1;
      }
    }
    for (let v = 0; v < count; v += 1) next[v] = total[v] ? next[v] / total[v] : value[v];
    value = next;
  }
  return value;
}

// ------------------------------------------------------------------ painters


/**
 * General soft-tissue painter: a mottled base ramp, crease tinting, fine
 * capillary networks and pale crests. Returns a painter `(ctx) => rgb`.
 *
 *   base       sRGB hex, mid tone
 *   dark       sRGB hex, mottled/shadow tone
 *   light      sRGB hex, crest highlight tone
 *   capillary  sRGB hex for the fine vessel network (optional)
 *   scale      mottle frequency
 */
export function tissue({
  base, dark, light, capillary, seed = 1, scale = 3, capillaryScale = 7, capillaryAmount = 0.4,
  mottleAmount = 0.55, crestAmount = 0.35, creaseColor, speckle = 0,
}) {
  const b = color(base), d = color(dark ?? base), l = color(light ?? base);
  const cap = capillary ? color(capillary) : null;
  const crease = creaseColor ? color(creaseColor) : null;
  const mottle = fbm3(simplex3(seed), 4);
  const veins = ridged3(simplex3(seed + 101), 16);
  const veinsFine = ridged3(simplex3(seed + 202), 20);
  const grain = simplex3(seed + 303);
  return (c) => {
    const m = mottle(c.x * scale, c.y * scale, c.z * scale) * 0.5 + 0.5;
    let out = mix(b, d, m * mottleAmount * 1.4 - 0.15);
    if (cap) {
      const s = capillaryScale;
      const net = Math.max(veins(c.x * s, c.y * s, c.z * s), veinsFine(c.x * s * 2.3, c.y * s * 2.3, c.z * s * 2.3) * 0.7);
      out = mix(out, cap, net * capillaryAmount * (0.6 + m * 0.6));
    }
    if (speckle) out = mix(out, d, Math.max(0, grain(c.x * 40, c.y * 40, c.z * 40) - 0.55) * speckle * 2);
    out = mix(out, l, smoothstep(0.05, 0.7, -c.curv) * crestAmount);
    if (crease) out = mix(out, crease, smoothstep(0.05, 0.6, c.curv) * 0.6);
    return out;
  };
}

/** Cellular pattern (follicles, lobules, alveoli). Returns `(ctx) => { edge, id }`. */
export function cells(seed = 1, frequency = 10) {
  const w = worley3(seed);
  return (x, y, z) => {
    const r = w(x * frequency, y * frequency, z * frequency);
    return { edge: smoothstep(0.0, 0.18, r.f2 - r.f1), id: r.id, f1: r.f1 };
  };
}
