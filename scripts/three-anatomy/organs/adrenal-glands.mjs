import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { capsule, curveTube, displace, ellipsoid, intersect, plane, smoothUnion, stretch, subtract, transform, union } from "../kit/sdf.mjs";
import { fbm3, simplex3, worley3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { merge, taperedTube } from "../kit/geometry.mjs";

// Anterior view of the suprarenal (adrenal) glands on the upper poles of the
// kidneys. Patient's left is +x. The left gland is sectioned in the coronal
// plane to show the yellow cortex around the dark medulla; the kidneys are
// cut horizontally below their hila.

const SECTION = { normal: new THREE.Vector3(0, 0, 1), offset: 0.02 };
const KIDNEY_CUT = -1.75;

/** The right gland: a flattened, rounded pyramid capping the upper pole. */
function pyramid(a, b, c, thickness) {
  const centre = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  return smoothUnion(0.08,
    capsule(a, b, thickness * 0.55), capsule(b, c, thickness * 0.55), capsule(c, a, thickness * 0.55),
    ellipsoid(centre, [0.22, 0.24, thickness]),
  );
}

export function build() {
  const noise = simplex3(301);
  const lumpy = fbm3(noise, 3);
  const zones = simplex3(302);
  const pyramids = worley3(303);
  const s = new Specimen("adrenal-glands", { cell: 0.011 });

  // ------------------------------------------------------------ kidneys (upper halves)
  const kidney = (side, cy) => {
    const bean = ellipsoid([0, 0, 0], [0.42, 0.76, 0.3]);
    const hilum = ellipsoid([-side * 0.38, -0.08, 0.08], [0.16, 0.24, 0.2]);
    return transform(subtract(bean, hilum), { position: [side * 0.95, cy, -0.12], rotation: [0.1, 0, side * 0.22] });
  };
  const kidneys = intersect(displace(union(kidney(-1, -1.2), kidney(1, -1.05)), (x, y, z) => lumpy(x * 3, y * 3, z * 3), 0.012), plane([0, -1, 0], -KIDNEY_CUT));
  const renalCapsule = tissue({ base: "#b65a4c", dark: "#8a3a34", light: "#de8f7c", capillary: "#7a2630", seed: 304, scale: 3, capillaryAmount: 0.3 });
  s.field("Kidneys", kidneys, {
    caps: [{ normal: new THREE.Vector3(0, -1, 0), offset: -KIDNEY_CUT }],
    simplify: { ratio: 0.36, error: 0.0012 },
    paint: (c) => {
      if (!c.cap) return renalCapsule(c);
      // Renal section: cortex, striped medullary pyramids, a pale sinus.
      const side = Math.sign(c.x), local = new THREE.Vector2(c.x - side * 0.95, c.z + 0.12);
      const r = Math.hypot(local.x / 0.42, local.y / 0.3);
      if (r > 0.82) return mix(color("#c4685a"), color("#a84c44"), lumpy(c.x * 20, 0, c.z * 20) * 0.5 + 0.5);
      if (local.x * -side > 0.12 && r < 0.5) return color("#f0dcc2");
      const p = pyramids(c.x * 6, 0, c.z * 6);
      return mix(color("#9c3a3a"), color("#c96b62"), 0.5 + 0.5 * Math.sin(Math.atan2(local.y, local.x) * 40) * smoothstep(0.1, 0.3, p.f2 - p.f1));
    },
  });

  // ------------------------------------------------------------ adrenal glands
  const surface = (x, y, z) => lumpy(x * 6, y * 6, z * 6) * 0.8 + noise(x * 18, y * 18, z * 18) * 0.25;
  const right = displace(smoothUnion(0.05,
    pyramid([-1.18, -0.5, 0.02], [-0.58, -0.44, 0.08], [-0.86, 0.18, 0.0], 0.11),
    curveTube([[-0.62, -0.44, 0.06], [-0.48, -0.62, 0.04], [-0.44, -0.8, 0.0]], (t) => 0.06 - 0.02 * t, 16),
  ), surface, 0.014);
  const leftAxis = [[0.52, 0.06, 0.02], [0.6, -0.22, 0.06], [0.58, -0.56, 0.06], [0.5, -0.84, 0.02]];
  const left = displace(smoothUnion(0.06,
    stretch(curveTube(leftAxis, (t) => 0.12 + 0.05 * Math.sin(t * Math.PI), 30), [1.25, 1, 0.75], [0.56, -0.4, 0.04]),
    ellipsoid([0.72, -0.42, 0.04], [0.14, 0.26, 0.1]),
  ), surface, 0.014);
  const leftCut = subtract(left, plane(SECTION.normal.clone().negate(), -SECTION.offset));
  const gland = tissue({ base: "#dda54a", dark: "#b87a2c", light: "#f2cd7e", capillary: "#b0583c", seed: 305, scale: 8, capillaryAmount: 0.3, crestAmount: 0.4 });
  s.field("Right suprarenal gland", right, { cell: 0.008, simplify: { ratio: 0.4, error: 0.001 }, paint: gland });
  s.field("Left suprarenal gland", leftCut, {
    cell: 0.008,
    caps: [SECTION],
    simplify: { ratio: 0.4, error: 0.001 },
    paint: (c) => {
      if (!c.cap) return gland(c);
      const depth = -left.d(c.x, c.y, c.z);
      if (depth < 0.008) return color("#e7c79a"); // capsule
      if (depth < 0.02) return color("#e99a3c"); // zona glomerulosa
      if (depth < 0.055) return mix(color("#f2c85a"), color("#e5ad3e"), 0.5 + 0.5 * Math.sin(Math.atan2(c.y + 0.4, c.x - 0.6) * 60)); // zona fasciculata, radial cords
      if (depth < 0.07) return color("#a8572e"); // zona reticularis
      return mix(color("#8c3f3f"), color("#6f2c34"), zones(c.x * 20, c.y * 20, 0) * 0.5 + 0.5); // medulla
    },
  });

  // ------------------------------------------------------------ vessels
  const vessel = (base, lightHex) => {
    const b = color(base), l = color(lightHex);
    return (c) => mix(b, l, smoothstep(0.1, 0.95, c.ny * 0.45 + c.nz * 0.65) * 0.55);
  };
  const arteries = [
    taperedTube([[0.14, 0.72, -0.4], [0.12, -0.4, -0.38], [0.1, -1.72, -0.36]], 0.13, { radial: 24 }), // abdominal aorta
  ];
  for (const side of [-1, 1]) {
    const k = side > 0 ? -1.08 : -1.2;
    arteries.push(taperedTube([[0.12, k + 0.1, -0.24], [side * 0.4, k + 0.06, -0.14], [side * 0.62, k + 0.04, -0.06]], 0.06, { radial: 16 })); // renal artery
    // Superior suprarenals arise from the inferior phrenic artery…
    arteries.push(taperedTube([[0.12, 0.62, -0.26], [side * 0.4, 0.62, -0.2], [side * 0.8, 0.5, -0.18], [side * 1.05, 0.62, -0.22]], 0.026, { radial: 10 }));
    for (let i = 0; i < 3; i += 1) {
      arteries.push(taperedTube([[side * (0.52 + i * 0.16), 0.58, -0.18], [side * (0.6 + i * 0.12), 0.32, -0.06], [side * (0.64 + i * 0.1), 0.06 - i * 0.04, 0.02]], 0.012, { radial: 8 }));
    }
    // …the middle suprarenal straight from the aorta, the inferior from the renal artery.
    arteries.push(taperedTube([[0.12, -0.3, -0.24], [side * 0.3, -0.34, -0.12], [side * 0.52, -0.4, 0.0]], 0.018, { radial: 10 }));
    arteries.push(taperedTube([[side * 0.45, k + 0.06, -0.12], [side * 0.5, -0.82, -0.04], [side * 0.56, -0.66, 0.02]], 0.014, { radial: 8 }));
  }
  s.mesh("Suprarenal arteries", merge(arteries), { material: "vessel", paint: vessel("#b8323a", "#e5675b"), shading: { cavity: 0.2 } });
  const veins = [
    taperedTube([[-0.3, 0.72, -0.28], [-0.32, -0.4, -0.26], [-0.3, -1.72, -0.24]], 0.15, { radial: 24 }), // inferior vena cava
    taperedTube([[-0.3, -1.12, -0.12], [-0.5, -1.16, -0.04], [-0.66, -1.16, 0.0]], 0.075, { radial: 16 }), // right renal vein
    taperedTube([[-0.3, -1.0, -0.1], [0.1, -0.96, 0.02], [0.45, -1.0, 0.0], [0.66, -1.02, 0.0]], 0.075, { radial: 16 }), // left renal vein, in front of the aorta
    // The right suprarenal vein is short and empties straight into the IVC…
    taperedTube([[-0.66, -0.2, 0.02], [-0.46, -0.24, -0.06], [-0.34, -0.28, -0.12]], 0.03, { radial: 10 }),
    // …the left descends to the left renal vein.
    taperedTube([[0.56, -0.62, 0.04], [0.5, -0.82, 0.02], [0.44, -0.98, 0.0]], 0.032, { radial: 10 }),
  ];
  s.mesh("Suprarenal and renal veins", merge(veins), { material: "vessel", paint: vessel("#46549a", "#7a86c4"), shading: { cavity: 0.2 } });

  s.anchor("right-adrenal", "Right suprarenal gland", [-0.86, -0.2, 0.15]);
  s.anchor("left-adrenal", "Left suprarenal gland", [0.6, 0.0, 0.1]);
  s.anchor("cortex", "Left suprarenal gland", [0.66, -0.26, SECTION.offset]);
  s.anchor("medulla", "Left suprarenal gland", [0.62, -0.45, SECTION.offset]);
  s.anchor("suprarenal-arteries", "Suprarenal arteries", [-0.68, 0.3, -0.04]);
  s.anchor("right-suprarenal-vein", "Suprarenal and renal veins", [-0.46, -0.24, -0.02]);
  s.anchor("left-suprarenal-vein", "Suprarenal and renal veins", [0.5, -0.82, 0.06]);
  s.anchor("kidney", "Kidneys", [1.1, -0.9, 0.2]);
  s.anchor("aorta", "Suprarenal arteries", [0.14, 0.4, -0.2]);
  return s;
}
