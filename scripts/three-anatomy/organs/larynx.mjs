import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { box, capsule, curveTube, ellipsoid, intersect, plane, roundCone, smoothSubtract, smoothUnion, sphere, subtract, union } from "../kit/sdf.mjs";
import { fbm3, simplex3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { merge, taperedTube } from "../kit/geometry.mjs";
import { cricoid, hyoid, thyroidCartilage, trachea } from "./parts/neck.mjs";

// The larynx from the front. A window through the patient's left thyroid
// lamina (+x) opens the airway and sections the left vocal and vestibular
// folds in the coronal plane z = WINDOW_BACK, so the folds, the ventricle
// between them and the arytenoid behind can be read.

const WINDOW_BACK = -0.06;

/** Half-width of the airway at height y: the infraglottic cone narrows to
 *  the vocal folds, the ventricle recesses between them and the vestibular
 *  folds, and the vestibule opens above. Smooth so the wall reads as mucosa. */
function profile(y) {
  const g = (centre, width) => Math.exp(-(((y - centre) / width) ** 2));
  const cone = 0.07 * smoothstep(0.25, 0.76, y) * (y < 0.8 ? 1 : 0);
  return 0.21 - cone - 0.15 * g(0.785, 0.035) + 0.07 * g(0.875, 0.028) - 0.1 * g(0.975, 0.035) - 0.02 * smoothstep(1.05, 1.2, y);
}

export function build() {
  const noise = simplex3(291);
  const lumpy = fbm3(noise, 3);
  const fibre = simplex3(292);
  const s = new Specimen("larynx", { cell: 0.01 });
  const windowBox = box([0.36, 0.78, 0.28], [0.34, 0.34, 0.34], 0.03);
  const section = { normal: new THREE.Vector3(0, 0, 1), offset: WINDOW_BACK };
  const cut = (field) => smoothSubtract(0.01, field, windowBox);

  // ------------------------------------------------------------ cartilages
  const shield = thyroidCartilage({ y0: 0.34, y1: 1.16 });
  const horns = union([-1, 1].flatMap((side) => [
    curveTube([[side * 0.5, 1.12, -0.2], [side * 0.55, 1.34, -0.26], [side * 0.56, 1.52, -0.3]], (t) => 0.04 - 0.012 * t, 16),
    curveTube([[side * 0.5, 0.38, -0.2], [side * 0.46, 0.24, -0.22], [side * 0.4, 0.16, -0.22]], 0.04, 12),
  ]));
  // Oblique line: a ridge on each lamina for the attachment of the strap muscles.
  const oblique = union([-1, 1].map((side) => capsule([side * 0.3, 1.02, 0.15], [side * 0.46, 0.42, 0.0], 0.022)));
  const thyroid = cut(smoothUnion(0.03, shield.field, horns, oblique));
  s.field("Thyroid cartilage", thyroid, { material: "cartilage", simplify: { ratio: 0.4, error: 0.001 }, paint: shield.paint, caps: [section] });
  const ring = cricoid({ y0: 0.0, radius: 0.31, thickness: 0.07, front: 0.18, back: 0.48 });
  s.field("Cricoid cartilage", ring.field, { material: "cartilage", simplify: { ratio: 0.4, error: 0.001 }, paint: ring.paint });
  const bone = hyoid({ y: 1.55, z: 0.36 });
  s.field("Hyoid bone", bone.field, { material: "bone", simplify: { ratio: 0.4, error: 0.001 }, paint: bone.paint });
  const airway = trachea({ top: -0.02, bottom: -1.65, radius: 0.28, wall: 0.045, spacing: 0.13 });
  s.field("Trachea", airway.field, { material: "cartilage", simplify: { ratio: 0.4, error: 0.001 }, paint: airway.paint });

  // Epiglottis: a leaf of elastic cartilage behind the hyoid, its stalk fixed
  // inside the thyroid angle.
  const leaf = intersect(
    { d: (x, y, z) => Math.abs(ellipsoid([0, 1.42, -0.62], [0.3, 0.56, 0.62]).d(x, y, z)) - 0.022, b: [-0.4, 0.8, -1.3, 0.4, 2.1, 0.1] },
    plane([0, 0, -1], 0.06), plane([0, -1, 0], -0.98),
  );
  const stalk = roundCone([0, 1.0, 0.22], [0, 1.12, 0.06], 0.04, 0.05);
  s.field("Epiglottis", smoothUnion(0.03, leaf, stalk), {
    material: "cartilage", cell: 0.008, simplify: { ratio: 0.45, error: 0.001 },
    paint: tissue({ base: "#e9c4a6", dark: "#c9977d", light: "#f8e2cf", capillary: "#c97a6c", seed: 293, scale: 8, capillaryAmount: 0.3 }),
  });

  // Arytenoids ride on the cricoid lamina; their vocal processes anchor the folds.
  const arytenoids = union([-1, 1].map((side) => smoothUnion(0.04,
    ellipsoid([side * 0.15, 0.74, -0.3], [0.09, 0.1, 0.08]),
    roundCone([side * 0.15, 0.76, -0.3], [side * 0.11, 1.0, -0.33], 0.07, 0.025),
    roundCone([side * 0.14, 0.74, -0.28], [side * 0.06, 0.76, -0.13], 0.04, 0.018),
    roundCone([side * 0.17, 0.72, -0.3], [side * 0.3, 0.7, -0.32], 0.05, 0.03),
    sphere([side * 0.1, 1.02, -0.33], 0.03),
  )));
  s.field("Arytenoid cartilages", arytenoids, { material: "cartilage", cell: 0.007, paint: tissue({ base: "#e8d6c0", dark: "#c3a68a", light: "#f8eee0", seed: 294, scale: 10 }) });

  // ------------------------------------------------------------ laryngeal wall and folds
  const outerWall = {
    d: (x, y, z) => {
      const rx = y > 0.32 ? 0.4 : 0.27, rz = y > 0.32 ? 0.34 : 0.27;
      return Math.max((Math.hypot(x / rx, (z - 0.02) / rz) - 1) * Math.min(rx, rz), -0.02 - y, y - 1.18);
    },
    b: [-0.45, -0.05, -0.36, 0.45, 1.2, 0.4],
  };
  const lumen = {
    d: (x, y, z) => {
      const taper = 0.25 + 0.75 * smoothstep(0.32, -0.25, z);
      const hw = profile(y) * taper;
      return Math.max(Math.abs(x) - hw, z - 0.3, -0.27 - z, y - 1.3, -0.3 - y) / 2;
    },
    b: [-0.3, -0.3, -0.3, 0.3, 1.3, 0.32],
  };
  // The lining stays inside the thyroid laminae (angle 0.9, depth 0.26).
  const insideShield = {
    d: (x, y, z) => Math.max(x * 0.783 + z * 0.622 - 0.205, -x * 0.783 + z * 0.622 - 0.205, z - 0.29),
    b: outerWall.b,
  };
  const lining = subtract(intersect(outerWall, insideShield), lumen);
  const wall = cut(lining);
  s.field("Laryngeal folds and mucosa", wall, {
    caps: [section],
    cell: 0.007,
    simplify: { ratio: 0.38, error: 0.0008 },
    paint: (c) => {
      const nearLumen = -lumen.d(c.x, c.y, c.z) * 2 < 0.03;
      if (c.cap && !nearLumen) {
        if (c.y > 0.7 && c.y < 0.84) {
          // Vocal fold in section: thyroarytenoid (vocalis) muscle with the
          // pale vocal ligament along its free edge.
          const edge = Math.abs(c.x) < 0.11;
          return edge ? color("#efe6dc") : mix(color("#b9443d"), color("#86282b"), (0.5 + 0.5 * Math.sin(c.x * 120)) * 0.4);
        }
        if (c.y > 0.92 && c.y < 1.02) return mix(color("#f1d8bc"), color("#dbb48f"), lumpy(c.x * 30, c.y * 30, 0) * 0.5 + 0.5); // glandular vestibular fold
        return mix(color("#efd0c0"), color("#d9a898"), lumpy(c.x * 20, c.y * 20, 0) * 0.5 + 0.5);
      }
      // Pearly vocal folds against the pink mucosa of the rest of the airway.
      const vocal = smoothstep(0.7, 0.75, c.y) * smoothstep(0.86, 0.81, c.y) * (nearLumen ? 1 : 0);
      return mix(tissue({ base: "#e4a29c", dark: "#c06f72", light: "#f6cbc3", capillary: "#b8505f", seed: 295, scale: 9, capillaryAmount: 0.35 })(c), color("#f3eee6"), vocal * 0.85);
    },
  });

  // ------------------------------------------------------------ membranes, muscles, nerves
  const membrane = intersect(
    { d: (x, y, z) => Math.abs(z - (0.32 - 0.7 * x * x)) - 0.014, b: [-0.6, 1.1, -0.4, 0.6, 1.6, 0.45] },
    box([0, 1.34, 0], [0.52, 0.22, 0.5]),
  );
  s.field("Thyrohyoid membrane", smoothSubtract(0.02, membrane, capsule([0.42, 1.32, 0.1], [0.42, 1.32, 0.3], 0.05), capsule([-0.42, 1.32, 0.1], [-0.42, 1.32, 0.3], 0.05)), {
    material: "fat", cell: 0.008,
    paint: tissue({ base: "#efe1cf", dark: "#cdb59c", light: "#fbf3e8", capillary: "#d08f82", seed: 296, scale: 8, capillaryAmount: 0.2 }),
    shading: { ao: 0.6 },
  });
  const muscleFibres = (c) => mix(color("#b9443d"), color("#86282b"), (0.5 + 0.5 * Math.sin((c.x * 2 + c.y) * 60 + fibre(c.x * 3, c.y * 3, c.z * 3) * 2)) * 0.55);
  const cricothyroid = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k += 1) {
      cricothyroid.push(taperedTube([[side * (0.07 + k * 0.03), 0.12, 0.33], [side * (0.2 + k * 0.05), 0.26, 0.28], [side * (0.32 + k * 0.05), 0.38, 0.17 - k * 0.03]], (t) => 0.045 - 0.01 * t, { radial: 12, up: [0, 0, 1], flatten: 0.5 }));
    }
  }
  s.mesh("Cricothyroid muscles", merge(cricothyroid), { material: "muscle", paint: muscleFibres });
  const nervePaint = (c) => mix(color("#eed06d"), color("#c89a3c"), smoothstep(0.0, 0.8, c.curv + 0.3) * 0.5);
  const nerves = [];
  const arteries = [];
  for (const side of [-1, 1]) {
    nerves.push(taperedTube([[side * 0.95, 1.8, -0.3], [side * 0.7, 1.45, 0.05], [side * 0.44, 1.32, 0.2], [side * 0.3, 1.2, 0.08]], 0.025, { radial: 10 }));
    nerves.push(taperedTube([[side * 0.36, -1.6, -0.42], [side * 0.38, -0.6, -0.36], [side * 0.36, 0.12, -0.28], [side * 0.3, 0.3, -0.24]], 0.024, { radial: 10 }));
    arteries.push(taperedTube([[side * 1.0, 1.65, -0.1], [side * 0.68, 1.38, 0.14], [side * 0.44, 1.3, 0.22], [side * 0.32, 1.18, 0.1]], 0.026, { radial: 10 }));
  }
  s.mesh("Laryngeal nerves", merge(nerves), { material: "nerve", paint: nervePaint });
  s.mesh("Laryngeal arteries", merge(arteries), { material: "vessel", paint: (c) => mix(color("#b8323a"), color("#e5675b"), smoothstep(0.1, 0.9, c.nz) * 0.5) });

  s.anchor("thyroid-cartilage", "Thyroid cartilage", [0, 1.0, 0.46]);
  s.anchor("cricoid", "Cricoid cartilage", [0.1, 0.12, 0.34]);
  s.anchor("hyoid", "Hyoid bone", [0, 1.55, 0.44]);
  s.anchor("epiglottis", "Epiglottis", [0, 1.85, 0.0]);
  s.anchor("vocal-folds", "Laryngeal folds and mucosa", [0.08, 0.78, WINDOW_BACK]);
  s.anchor("vestibular-folds", "Laryngeal folds and mucosa", [0.14, 0.97, WINDOW_BACK]);
  s.anchor("ventricle", "Laryngeal folds and mucosa", [0.3, 0.88, WINDOW_BACK]);
  s.anchor("arytenoid", "Arytenoid cartilages", [0.15, 0.95, -0.25]);
  s.anchor("thyrohyoid-membrane", "Thyrohyoid membrane", [-0.2, 1.32, 0.3]);
  s.anchor("cricothyroid", "Cricothyroid muscles", [-0.25, 0.27, 0.3]);
  s.anchor("trachea", "Trachea", [0, -0.9, 0.3]);
  return s;
}
