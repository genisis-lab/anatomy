import { curveTube, displace, ellipsoid, intersect, smoothSubtract, smoothUnion, subtract } from "../../kit/sdf.mjs";
import { color, mix, smoothstep, tissue } from "../../kit/paint.mjs";

// Shared laryngeal and tracheal skeleton used by the thyroid, larynx and
// airway specimens. The airway axis is +y at x = 0; anterior is +z.

const ALL = [-1e9, -1e9, -1e9, 1e9, 1e9, 1e9];

/**
 * Trachea from `top` down to `bottom`: C-shaped cartilage rings in front,
 * a flat membranous wall behind where the oesophagus rests.
 */
export function trachea({ top = 0.45, bottom = -1.8, radius = 0.3, wall = 0.05, spacing = 0.13, z = 0 } = {}) {
  const tube = {
    d: (x, y, zz) => {
      const dz = zz - z;
      // D-shaped section: the posterior wall is flattened.
      const round = Math.hypot(x, dz) - radius;
      const back = -dz - radius * 0.62;
      const k = 0.08;
      const h = Math.max(k - Math.abs(round - back), 0) / k;
      return Math.max(Math.max(round, back) + h * h * k * 0.25, y - top, bottom - y);
    },
    b: [-radius - 0.1, bottom - 0.1, z - radius - 0.1, radius + 0.1, top + 0.1, z + radius + 0.1],
  };
  const rings = (x, y, zz) => {
    if (zz - z < -radius * 0.4) return 0;
    return Math.pow(Math.abs(Math.sin(((y - bottom) / spacing) * Math.PI)), 2.2);
  };
  const outer = displace(tube, (x, y, zz) => -rings(x, y, zz), 0.022);
  const lumen = { d: (x, y, zz) => -(tube.d(x, y, zz) + wall), b: ALL };
  const field = { d: (x, y, zz) => Math.max(outer.d(x, y, zz), lumen.d(x, y, zz)), b: outer.b };
  const cartilage = color("#f1e6d6"), ligament = color("#d9a99b"), membrane = color("#d79a8f");
  const base = tissue({ base: "#e7c9b8", dark: "#c99889", light: "#f8ece2", capillary: "#d0777a", seed: 401, scale: 5, capillaryAmount: 0.3 });
  const paint = (c) => {
    if (c.cap) return Math.hypot(c.x, c.z - z) < radius - wall * 0.6 ? color("#b86a66") : cartilage;
    if (c.z - z < -radius * 0.42) return mix(base(c), membrane, 0.5);
    return mix(mix(base(c), ligament, 0.45), cartilage, smoothstep(0.25, 0.8, rings(c.x, c.y, c.z)));
  };
  return { field, paint, outer: tube };
}

/** Shield-shaped thyroid cartilage: two laminae meeting at the laryngeal prominence. */
export function thyroidCartilage({ y0 = 0.75, y1 = 1.45, angle = 0.9, thickness = 0.045, depth = 0.26 } = {}) {
  const s = Math.sin(angle), c = Math.cos(angle);
  const prism = {
    d: (x, y, z) => {
      const a = x * s + z * c - depth;
      const b = -x * s + z * c - depth;
      // Smooth maximum keeps the prominence rounded.
      const k = 0.06;
      const h = Math.max(k - Math.abs(a - b), 0) / k;
      return Math.max(a, b) + h * h * k * 0.25;
    },
    b: ALL,
  };
  const laminae = {
    d: (x, y, z) => {
      const d = Math.abs(prism.d(x, y, z) + thickness / 2) - thickness / 2;
      // Laminae end posteriorly and rise into superior horns.
      const back = -0.22 - z;
      const height = Math.max(y0 - y, y - (y1 + (z < -0.05 ? (-0.05 - z) * 0.9 : 0)));
      return Math.max(d, back, height);
    },
    b: [-0.62, y0 - 0.2, -0.45, 0.62, y1 + 0.35, depth / Math.cos(angle) + 0.1],
  };
  const notch = ellipsoid([0, y1 + 0.06, depth / Math.cos(angle)], [0.13, 0.22, 0.3]);
  const field = smoothSubtract(0.03, laminae, notch);
  const paint = tissue({ base: "#dfcbb0", dark: "#b89a7c", light: "#f5ead9", capillary: "#cf8e80", seed: 402, scale: 3.5, capillaryAmount: 0.25, crestAmount: 0.5, mottleAmount: 0.7 });
  return { field, paint };
}

/** Signet-ring cricoid: a narrow anterior arch and a tall posterior lamina. */
export function cricoid({ y0 = 0.46, radius = 0.33, thickness = 0.06 } = {}) {
  const field = {
    d: (x, y, z) => {
      const r = Math.abs(Math.hypot(x, z * 1.05) - radius) - thickness / 2;
      const back = smoothstep(0.1, -0.85, z / radius);
      const top = y0 + 0.09 + back * 0.3;
      return Math.max(r, y0 - y, y - top);
    },
    b: [-radius - 0.1, y0 - 0.1, -radius - 0.1, radius + 0.1, y0 + 0.5, radius + 0.1],
  };
  const paint = tissue({ base: "#e7d9c6", dark: "#c2a98f", light: "#f9f1e5", seed: 403, scale: 4, crestAmount: 0.5 });
  return { field, paint };
}

/** U-shaped hyoid bone with greater horns sweeping back. */
export function hyoid({ y = 1.78, z = 0.36 } = {}) {
  const body = curveTube([[-0.2, y, z - 0.05], [0, y - 0.02, z], [0.2, y, z - 0.05]], 0.075, 16);
  const horns = [-1, 1].map((side) => curveTube([[side * 0.18, y, z - 0.05], [side * 0.42, y + 0.02, z - 0.22], [side * 0.56, y + 0.06, z - 0.55]], (t) => 0.05 - 0.02 * t + (t > 0.92 ? 0.015 : 0), 24));
  const field = smoothUnion(0.04, body, ...horns);
  const paint = tissue({ base: "#e9dcc4", dark: "#c6ae8a", light: "#fbf3e3", seed: 404, scale: 6, crestAmount: 0.45 });
  return { field, paint };
}

/** A collapsed oesophagus behind the trachea. */
export function oesophagus({ top = 0.45, bottom = -1.8, z = -0.5 } = {}) {
  const tube = intersect(curveTube([[0.02, top + 0.1, z], [0.0, (top + bottom) / 2, z - 0.02], [0.04, bottom - 0.1, z]], 0.19, 30), {
    d: (x, y) => Math.max(y - top, bottom - y),
    b: ALL,
  });
  const field = subtract(tube, curveTube([[0.02, top + 0.2, z], [0.04, bottom - 0.2, z]], 0.05, 4));
  const paint = tissue({ base: "#dc9a88", dark: "#b8695e", light: "#f2c4b2", capillary: "#b14f4e", seed: 405, scale: 4, capillaryAmount: 0.3 });
  return { field, paint };
}
