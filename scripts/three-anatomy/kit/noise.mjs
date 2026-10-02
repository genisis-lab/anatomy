// Deterministic noise used for organic displacement and surface painting.
// Every specimen is rebuilt bit-for-bit from its seed, so model hashes only
// change when the anatomy source changes.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

/** Seeded 3D simplex noise in roughly [-1, 1]. */
export function simplex3(seed = 1) {
  const random = mulberry32(seed * 9973 + 17);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) p[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i += 1) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  const F3 = 1 / 3;
  const G3 = 1 / 6;
  return (x, y, z) => {
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const g = permMod12[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n += t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0 + GRAD3[g + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const g = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n += t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1 + GRAD3[g + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const g = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n += t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2 + GRAD3[g + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const g = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n += t3 * t3 * (GRAD3[g] * x3 + GRAD3[g + 1] * y3 + GRAD3[g + 2] * z3);
    }
    return 32 * n;
  };
}

/** Fractal sum of simplex octaves, normalised to roughly [-1, 1]. */
export function fbm3(noise, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  return (x, y, z) => {
    let sum = 0;
    let amplitude = 1;
    let norm = 0;
    let fx = x, fy = y, fz = z;
    for (let o = 0; o < octaves; o += 1) {
      sum += noise(fx, fy, fz) * amplitude;
      norm += amplitude;
      amplitude *= gain;
      fx = fx * lacunarity + 11.3;
      fy = fy * lacunarity - 7.1;
      fz = fz * lacunarity + 3.7;
    }
    return sum / norm;
  };
}

/** Ridged noise: thin bright lines where the base noise crosses zero, used for
 *  capillary and connective-tissue patterns. Returns [0, 1]. */
export function ridged3(noise, sharpness = 18) {
  return (x, y, z) => Math.exp(-Math.abs(noise(x, y, z)) * sharpness);
}

function hash3(i, j, k, seed) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Worley (cellular) noise. Returns F1, F2 and a stable per-cell id in [0,1),
 *  which paints follicles, lobules, alveoli and acini. */
export function worley3(seed = 1, jitter = 0.9) {
  const out = { f1: 0, f2: 0, id: 0 };
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let f1 = Infinity, f2 = Infinity, id = 0;
    for (let k = -1; k <= 1; k += 1) for (let j = -1; j <= 1; j += 1) for (let i = -1; i <= 1; i += 1) {
      const cx = xi + i, cy = yi + j, cz = zi + k;
      const px = cx + 0.5 + (hash3(cx, cy, cz, seed) - 0.5) * jitter;
      const py = cy + 0.5 + (hash3(cx, cy, cz, seed + 1) - 0.5) * jitter;
      const pz = cz + 0.5 + (hash3(cx, cy, cz, seed + 2) - 0.5) * jitter;
      const dx = px - x, dy = py - y, dz = pz - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < f1) { f2 = f1; f1 = d; id = hash3(cx, cy, cz, seed + 3); }
      else if (d < f2) f2 = d;
    }
    out.f1 = Math.sqrt(f1);
    out.f2 = Math.sqrt(f2);
    out.id = id;
    return out;
  };
}
