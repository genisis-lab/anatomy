import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { curveTube, displace, ellipsoid, intersect, plane, smoothSubtract, smoothUnion } from "../kit/sdf.mjs";
import { fbm3, mulberry32, simplex3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { merge, taperedTube } from "../kit/geometry.mjs";
import { cricoid, hyoid, thyroidCartilage, trachea } from "./parts/neck.mjs";

// Anterior view of the conducting airway and its muscular floor. Patient's
// left is +x. The lungs are omitted so the bronchial tree can be followed.
const CARINA = [0, 0.12, 0.1];

/** Grows subsegmental branches from a lobar or segmental bronchus. */
function subdivide(random, out, start, direction, length, radius, generations) {
  const dir = new THREE.Vector3(...direction).normalize();
  const a = new THREE.Vector3(...start);
  const bend = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(0.25);
  const mid = a.clone().addScaledVector(dir, length * 0.5).addScaledVector(bend, length * 0.3);
  const end = a.clone().addScaledVector(dir.clone().add(bend.multiplyScalar(0.3)).normalize(), length);
  out.push({ points: [a, mid, end], r0: radius, r1: radius * 0.78 });
  if (generations <= 0) return;
  const side = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).cross(dir).normalize();
  for (const sign of [-1, 1]) {
    const child = dir.clone().applyAxisAngle(side, sign * (0.42 + random() * 0.25));
    subdivide(random, out, end.toArray(), child.toArray(), length * (0.62 + random() * 0.12), radius * 0.72, generations - 1);
  }
}

export function build() {
  const noise = simplex3(191);
  const lumpy = fbm3(noise, 3);
  const fibre = simplex3(192);
  const s = new Specimen("airway-diaphragm", { cell: 0.012 });

  // ------------------------------------------------------------ larynx and trachea
  const shield = thyroidCartilage({ y0: 1.48, y1: 2.04 });
  s.field("Larynx", smoothUnion(0.02, shield.field, cricoid({ y0: 1.22 }).field, hyoid({ y: 2.22, z: 0.3 }).field), {
    material: "cartilage", cell: 0.01, simplify: { ratio: 0.4, error: 0.0012 }, paint: shield.paint,
  });
  const airway = trachea({ top: 1.2, bottom: CARINA[1] + 0.02, radius: 0.24, wall: 0.045, spacing: 0.11, z: CARINA[2] });
  s.field("Trachea", airway.field, { material: "cartilage", cell: 0.01, simplify: { ratio: 0.4, error: 0.0012 }, paint: airway.paint });

  // ------------------------------------------------------------ bronchial tree
  const random = mulberry32(193);
  const branches = [];
  const lobar = [];
  const add = (points, r0, r1) => branches.push({ points: points.map((p) => new THREE.Vector3(...p)), r0, r1 });
  // Right main bronchus: shorter, wider and more vertical than the left.
  add([CARINA, [-0.22, 0.0, 0.1], [-0.4, -0.2, 0.08]], 0.17, 0.15);
  add([[-0.3, -0.1, 0.09], [-0.48, -0.02, 0.06], [-0.66, 0.06, 0.04]], 0.1, 0.09); // right upper lobe
  add([[-0.4, -0.2, 0.08], [-0.48, -0.36, 0.08], [-0.52, -0.46, 0.08]], 0.13, 0.12); // intermediate
  add([[-0.52, -0.46, 0.08], [-0.62, -0.56, 0.2], [-0.72, -0.62, 0.3]], 0.085, 0.075); // middle lobe
  add([[-0.52, -0.46, 0.08], [-0.58, -0.68, 0.02], [-0.62, -0.86, -0.04]], 0.11, 0.1); // right lower lobe
  // Left main bronchus: longer and more horizontal, passing under the arch.
  add([CARINA, [0.24, 0.02, 0.1], [0.46, -0.16, 0.08], [0.58, -0.3, 0.07]], 0.15, 0.13);
  add([[0.58, -0.3, 0.07], [0.72, -0.18, 0.1], [0.86, -0.06, 0.12]], 0.1, 0.09); // left upper lobe
  add([[0.72, -0.24, 0.1], [0.8, -0.44, 0.22], [0.86, -0.58, 0.3]], 0.075, 0.065); // lingula
  add([[0.58, -0.3, 0.07], [0.66, -0.58, 0.02], [0.7, -0.84, -0.04]], 0.105, 0.095); // left lower lobe
  lobar.push(
    [[-0.66, 0.06, 0.04], [-0.6, 0.6, 0.1], 0.36, 0.07], [[-0.66, 0.06, 0.04], [-1, 0.2, -0.3], 0.34, 0.065], [[-0.66, 0.06, 0.04], [-0.8, 0, 0.6], 0.34, 0.065],
    [[-0.72, -0.62, 0.3], [-0.9, -0.2, 0.5], 0.3, 0.055], [[-0.72, -0.62, 0.3], [-0.6, -0.5, 0.8], 0.3, 0.055],
    [[-0.62, -0.86, -0.04], [-0.9, -0.4, -0.3], 0.32, 0.065], [[-0.62, -0.86, -0.04], [-0.6, -0.4, 0.5], 0.3, 0.06], [[-0.62, -0.86, -0.04], [-0.3, -0.3, -0.6], 0.32, 0.06],
    [[0.86, -0.06, 0.12], [0.5, 0.8, 0.1], 0.36, 0.065], [[0.86, -0.06, 0.12], [1, 0.25, -0.3], 0.34, 0.06], [[0.86, -0.06, 0.12], [0.8, 0.1, 0.6], 0.32, 0.06],
    [[0.86, -0.58, 0.3], [0.8, -0.3, 0.6], 0.28, 0.05],
    [[0.7, -0.84, -0.04], [0.9, -0.35, -0.3], 0.32, 0.065], [[0.7, -0.84, -0.04], [0.6, -0.35, 0.5], 0.3, 0.06], [[0.7, -0.84, -0.04], [0.3, -0.3, -0.6], 0.32, 0.06],
  );
  for (const [start, dir, length, radius] of lobar) subdivide(random, branches, start, dir, length, radius, 3);
  const bronchi = merge(branches.map(({ points, r0, r1 }) => taperedTube(points, (t) => r0 + (r1 - r0) * t, { radial: r0 > 0.06 ? 18 : 12, caps: r0 < 0.03 ? "end" : "none" })));
  const bronchusTissue = tissue({ base: "#e8cbbb", dark: "#c99a8b", light: "#f8ebe0", capillary: "#cf7b7c", seed: 194, scale: 6, capillaryAmount: 0.3 });
  s.mesh("Bronchial tree", bronchi, {
    material: "cartilage",
    paint: (c) => {
      const ring = Math.pow(Math.abs(Math.sin(c.along * 30)), 2.5);
      return mix(mix(bronchusTissue(c), color("#d8a196"), 0.3), color("#f5ece0"), ring * 0.65);
    },
    shading: { cavity: 0.3 },
  });

  // Pulmonary arteries accompany each bronchus, carrying deoxygenated blood
  // from the pulmonary trunk (which rises in front of the carina).
  const arteryBranches = [
    taperedTube([[0.12, -0.62, 0.52], [0.1, -0.3, 0.42], [0.06, -0.12, 0.3]], 0.16, { radial: 22 }),
    taperedTube([[0.06, -0.12, 0.3], [-0.18, -0.12, 0.26], [-0.4, -0.16, 0.22]], 0.12, { radial: 18 }),
    taperedTube([[0.06, -0.12, 0.3], [0.3, -0.12, 0.24], [0.52, -0.2, 0.2]], 0.11, { radial: 18 }),
  ];
  for (const { points, r0, r1 } of branches) {
    if (points[0].y > 0.1) continue;
    const shift = new THREE.Vector3(0, r0 * 0.5, r0 * 1.5);
    arteryBranches.push(taperedTube(points.map((p) => p.clone().add(shift)), (t) => (r0 + (r1 - r0) * t) * 0.62, { radial: r0 > 0.06 ? 14 : 10, caps: r0 < 0.03 ? "end" : "none" }));
  }
  s.mesh("Pulmonary arteries", merge(arteryBranches), {
    material: "vessel",
    paint: (c) => mix(color("#4c5aa4"), color("#8590cf"), smoothstep(0.1, 0.95, c.ny * 0.45 + c.nz * 0.65) * 0.55),
    shading: { cavity: 0.25 },
  });

  // ------------------------------------------------------------ oesophagus
  const gullet = curveTube([[0.02, 1.25, -0.32], [0.04, 0.4, -0.36], [0.08, -0.5, -0.32], [0.2, -1.05, -0.12], [0.34, -1.32, 0.02]], 0.15, 40);
  const oesophagus = displace(gullet, (x, y, z) => lumpy(x * 4, y * 4, z * 4), 0.01);
  s.field("Oesophagus", intersect(oesophagus, plane([0, 1, 0], 1.25), plane([0, -1, 0], 1.32)), {
    material: "muscle",
    simplify: { ratio: 0.4, error: 0.0012 },
    paint: (c) => mix(color("#d98d7b"), color("#b9625a"), 0.5 + 0.5 * Math.sin(Math.atan2(c.z + 0.3, c.x) * 30 + fibre(c.x * 3, c.y, c.z * 3) * 2) * 0.6),
  });

  // ------------------------------------------------------------ diaphragm
  // Two domes, the right higher over the liver, joined by the central tendon.
  const domes = smoothUnion(0.35,
    ellipsoid([-0.62, -1.62, -0.08], [1.0, 0.98, 0.9]),
    ellipsoid([0.66, -1.76, -0.08], [0.98, 0.92, 0.9]),
  );
  const sheet = intersect({ d: (x, y, z) => Math.abs(domes.d(x, y, z) + 0.03) - 0.032, b: domes.b }, plane([0, -1, 0], 1.75));
  const crura = [
    curveTube([[-0.2, -0.95, -0.62], [-0.16, -1.35, -0.7], [-0.08, -1.74, -0.72]], (t) => 0.09 + 0.03 * t, 20),
    curveTube([[0.24, -1.0, -0.62], [0.2, -1.4, -0.7], [0.12, -1.74, -0.72]], (t) => 0.07 + 0.02 * t, 20),
  ];
  const hiatus = curveTube([[0.2, -0.6, -0.2], [0.24, -1.1, -0.1], [0.32, -1.5, 0.05]], 0.17, 20);
  const aorticPath = [[0.24, 1.0, -0.75], [0.18, -0.4, -0.78], [0.08, -1.3, -0.8], [0.04, -1.9, -0.8]];
  const ivcPath = [[-0.34, -1.9, -0.32], [-0.36, -1.1, -0.24], [-0.36, -0.55, -0.22]];
  const diaphragm = smoothSubtract(0.03, smoothUnion(0.06, sheet, ...crura), hiatus, curveTube(aorticPath, 0.18, 20), curveTube(ivcPath, 0.16, 20));
  s.field("Diaphragm", diaphragm, {
    material: "muscle",
    simplify: { ratio: 0.36, error: 0.0012 },
    paint: (c) => {
      // Trefoil central tendon; radiating muscle fibres around it.
      const angle = Math.atan2(c.z + 0.05, c.x + 0.02);
      const lobe = 0.38 + 0.12 * Math.cos(angle * 3 + 0.6);
      const tendon = smoothstep(lobe + 0.06, lobe - 0.02, Math.hypot(c.x + 0.02, c.z + 0.05)) * smoothstep(-1.55, -1.1, c.y);
      const stripes = 0.5 + 0.5 * Math.sin(angle * 46 + fibre(c.x * 2.5, c.y * 2.5, c.z * 2.5) * 2);
      const muscle = mix(color("#cf5f57"), color("#a23e3e"), stripes * 0.55);
      const sheen = mix(color("#f1e8d8"), color("#dccbb2"), stripes * 0.3);
      return mix(muscle, sheen, tendon);
    },
  });

  // ------------------------------------------------------------ vessels and nerves
  const vessel = (base, lightHex) => {
    const b = color(base), l = color(lightHex);
    return (c) => mix(b, l, smoothstep(0.1, 0.95, c.ny * 0.45 + c.nz * 0.65) * 0.55);
  };
  s.mesh("Descending aorta", taperedTube(aorticPath, 0.15, { radial: 24 }), { material: "vessel", paint: vessel("#c0383d", "#e8705f") });
  s.mesh("Inferior vena cava", taperedTube(ivcPath, 0.14, { radial: 24 }), { material: "vessel", paint: vessel("#46549a", "#7a86c4") });
  const nerves = [-1, 1].map((side) => taperedTube([[side * 0.36, 1.3, -0.05], [side * 0.5, 0.4, 0.1], [side * 0.62, -0.4, 0.22], [side * 0.7, -0.78, 0.26]], 0.022, { radial: 10 }));
  s.mesh("Phrenic nerves", merge(nerves), { material: "nerve", paint: (c) => mix(color("#ecd06f"), color("#c89a3c"), smoothstep(0.0, 0.8, c.curv + 0.3) * 0.5) });

  s.anchor("larynx", "Larynx", [0, 1.8, 0.42]);
  s.anchor("trachea", "Trachea", [0, 0.8, 0.34]);
  s.anchor("carina", "Bronchial tree", [0, 0.1, 0.27]);
  s.anchor("main-bronchi", "Bronchial tree", [0.36, -0.08, 0.24]);
  s.anchor("lobar-bronchi", "Bronchial tree", [-0.66, -0.56, 0.38]);
  s.anchor("esophagus", "Oesophagus", [0.16, 0.6, -0.2]);
  s.anchor("diaphragm", "Diaphragm", [0.9, -1.0, 0.6]);
  s.anchor("central-tendon", "Diaphragm", [-0.1, -0.66, 0.2]);
  s.anchor("hiatus", "Diaphragm", [0.36, -0.9, 0.12]);
  s.anchor("phrenic-nerve", "Phrenic nerves", [0.5, 0.4, 0.13]);
  s.anchor("pulmonary-artery", "Pulmonary arteries", [0.1, -0.4, 0.6]);
  return s;
}

