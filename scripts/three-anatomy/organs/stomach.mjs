import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { curveTube, displace, ellipsoid, innerShell, sampleCurve, smoothSubtract, smoothUnion, stretch, torus, transform, tube, union } from "../kit/sdf.mjs";
import { fbm3, ridged3, simplex3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { growVessels, merge, surfaceTube, taperedTube, vesselGeometry } from "../kit/geometry.mjs";

const WALL = 0.075;

// Anterior view: the patient's left (fundus side) is +x and cranial is +y.
const AXIS = [
  [-0.36, 2.02, -0.14], [-0.33, 1.62, -0.07], [-0.14, 1.2, 0.0], [0.2, 0.9, 0.02],
  [0.44, 0.38, 0.04], [0.4, -0.2, 0.05], [0.14, -0.66, 0.06], [-0.28, -0.93, 0.05],
  [-0.66, -0.92, 0.03], [-0.94, -0.78, 0.0], [-1.14, -0.64, -0.06], [-1.34, -0.74, -0.14], [-1.42, -1.02, -0.2],
];
const RADII = [0.14, 0.15, 0.25, 0.56, 0.62, 0.6, 0.52, 0.42, 0.32, 0.19, 0.23, 0.22, 0.21];

const radiusAt = (t) => {
  const f = t * (RADII.length - 1);
  const i = Math.min(RADII.length - 2, Math.floor(f));
  const k = f - i;
  return RADII[i] + (RADII[i + 1] - RADII[i]) * k * k * (3 - 2 * k);
};

/** Lines along the lesser (inner) or greater (outer) curvature of the J. */
function curvatureLine(axis, side, from, to, reach = 0.95) {
  const points = [];
  for (let i = from; i <= to; i += 1) {
    const prev = axis[Math.max(0, i - 1)], next = axis[Math.min(axis.length - 1, i + 1)];
    const tx = next[0] - prev[0], ty = next[1] - prev[1];
    const length = Math.hypot(tx, ty) || 1;
    const r = radiusAt(i / (axis.length - 1)) * reach;
    const sign = side === "greater" ? 1 : -1;
    points.push([axis[i][0] + (-ty / length) * r * sign, axis[i][1] + (tx / length) * r * sign, axis[i][2] + 0.12]);
  }
  return points;
}

export function build() {
  const noise = simplex3(31);
  const lumpy = fbm3(noise, 3);
  const striae = ridged3(simplex3(33), 9);

  const axis = sampleCurve(AXIS, 110);
  const body = tube(axis, axis.map((_, i) => radiusAt(i / (axis.length - 1))));
  // The fundus domes above the gastro-oesophageal junction, leaving the
  // cardiac notch (angle of His) between them.
  const fundus = ellipsoid([0.42, 1.2, -0.05], [0.56, 0.54, 0.47]);
  const pyloricRing = transform(torus([0, 0, 0], 0.17, 0.07), { position: [-0.95, -0.77, 0.0], rotation: [0, 0, 1.0] });
  const shaped = smoothUnion(0.06, stretch(smoothUnion(0.3, body, fundus), [1, 1, 0.78]), pyloricRing);
  const outer = displace(shaped, (x, y, z) =>
    lumpy(x * 1.7, y * 1.7, z * 1.7) * 0.55 + noise(x * 8, y * 8, z * 8) * 0.12 - striae(x * 3 + y * 1.2, y * 5.5, z * 3) * 0.18, 0.032);

  // Rugae: longitudinal mucosal folds on the posterior wall.
  const rugae = [];
  for (let r = 0; r < 8; r += 1) {
    const lane = (r - 3.5) * 0.1;
    const controls = [];
    for (let i = 2; i <= 9; i += 1) {
      const [x, y, z] = AXIS[i];
      const wobble = Math.sin(i * 1.7 + r * 2.1) * 0.035;
      controls.push([x + lane + wobble, y + lane * 0.3, (z - radiusAt(i / 12) * 0.6) * 0.78 + 0.03]);
    }
    rugae.push(curveTube(controls, (t) => 0.024 + 0.014 * Math.sin(t * Math.PI), 44));
  }
  const lining = smoothUnion(0.035, innerShell(outer, WALL), union(rugae));
  const contained = { d: (x, y, z) => Math.max(lining.d(x, y, z), outer.d(x, y, z)), b: outer.b };

  // Anterior window through the body exposes the rugae and wall layers.
  const windowCut = ellipsoid([0.26, 0.04, 0.64], [0.42, 0.62, 0.5]);
  const stomachWall = smoothSubtract(0.02, contained, windowCut);

  const s = new Specimen("stomach", { cell: 0.0125 });
  const serosa = tissue({ base: "#e08d7d", dark: "#b8574f", light: "#f4c2b0", capillary: "#a8323a", seed: 3, scale: 2.6, capillaryAmount: 0.42 });
  const mucosaPaint = tissue({ base: "#c8494f", dark: "#9c2f3a", light: "#ee9a8c", capillary: "#8a2232", seed: 4, scale: 5, crestAmount: 0.7 });
  const layers = [
    [0.008, color("#f2c9b8")], // serosa
    [0.03, color("#c7544e")], // longitudinal muscle
    [0.05, color("#a3393a")], // circular and oblique muscle
    [0.062, color("#ecc6a4")], // submucosa
    [1, color("#cf5a60")], // mucosa
  ];
  s.field("Stomach wall", stomachWall, {
    simplify: { ratio: 0.34, error: 0.0015 },
    paint: (c) => {
      const depth = -outer.d(c.x, c.y, c.z);
      if (depth > WALL * 0.45) return mucosaPaint(c);
      if (windowCut.d(c.x, c.y, c.z) < 0.03 && depth > 0.004) return layers.find(([limit]) => depth <= limit)[1];
      let tone = serosa(c);
      // The abdominal oesophagus and the duodenum are paler than the stomach.
      if (c.y > 1.42) tone = mix(tone, color("#e7ab98"), smoothstep(1.42, 1.72, c.y));
      if (c.x < -1.04) tone = mix(tone, color("#eab595"), smoothstep(-1.04, -1.16, c.x));
      return tone;
    },
  });

  const keep = (p) => windowCut.d(p.x, p.y, p.z) > 0.05 && p.y < 1.5 && p.x > -1.02;
  const lesser = curvatureLine(AXIS, "lesser", 2, 9, 0.9);
  const greater = curvatureLine(AXIS, "greater", 3, 9, 0.92);
  greater.unshift([0.92, 1.45, 0.05], [0.98, 1.05, 0.08]);
  const arteries = [];
  const veins = [];
  for (const [line, name, toward] of [[lesser, "lesser", [1, -0.2, 0.5]], [greater, "greater", [-0.9, 0.4, 0.5]]]) {
    const veinLine = line.map(([x, y, z]) => [x, y - 0.035, z - 0.04]);
    arteries.push(surfaceTube(outer, line, 0.024, { hug: 0.55, radial: 12 }));
    veins.push(surfaceTube(outer, veinLine, 0.03, { hug: 0.5, radial: 12 }));
    const curve = new THREE.CatmullRomCurve3(line.map((p) => new THREE.Vector3(...p)));
    const roots = [];
    for (let i = 0; i < 10; i += 1) roots.push({ at: curve.getPointAt((i + 0.5) / 10), dir: toward, radius: 0.015, length: 0.6, generations: 2 });
    arteries.push(vesselGeometry(growVessels(outer, { seed: name.length * 7, roots, step: 0.02, hug: 0.4, keep, branchEvery: 0.15, minRadius: 0.0045 }), { radial: 7 }));
    veins.push(vesselGeometry(growVessels(outer, {
      seed: name.length * 7 + 3,
      roots: roots.map((root) => ({ ...root, at: root.at.clone().add(new THREE.Vector3(0.04, -0.06, 0)), radius: 0.018 })),
      step: 0.02, hug: 0.4, keep, branchEvery: 0.17, minRadius: 0.005, wander: 0.45,
    }), { radial: 7 }));
  }
  // Short gastric arteries fan over the fundus from the splenic side.
  arteries.push(vesselGeometry(growVessels(outer, {
    seed: 23,
    roots: [0, 1, 2, 3].map((i) => ({ at: [0.95, 1.05 + i * 0.13, 0.2], dir: [-0.5, 0.6, 0.3], radius: 0.013, length: 0.5, generations: 1 })),
    step: 0.02, hug: 0.4, keep, minRadius: 0.004,
  }), { radial: 7 }));
  // Trunks leaving the specimen: left gastric toward the coeliac trunk, right
  // gastroepiploic down behind the duodenum.
  arteries.push(taperedTube([[-0.08, 1.06, 0.26], [-0.4, 1.18, 0.06], [-0.64, 1.1, -0.26]], 0.03, { radial: 12 }));
  arteries.push(taperedTube([[-0.92, -1.04, 0.2], [-1.02, -1.26, 0.05], [-1.0, -1.52, -0.12]], 0.03, { radial: 12 }));
  veins.push(taperedTube([[-0.04, 1.0, 0.2], [-0.36, 1.06, -0.02], [-0.56, 0.94, -0.3]], 0.036, { radial: 12 }));

  const vessel = (base, lightHex) => {
    const b = color(base), l = color(lightHex);
    return (c) => mix(b, l, smoothstep(0.1, 0.95, c.ny * 0.45 + c.nz * 0.65) * 0.55);
  };
  s.mesh("Gastric arteries", merge(arteries), { material: "vessel", paint: vessel("#b8323a", "#e5675b"), shading: { cavity: 0.2 } });
  s.mesh("Gastric veins", merge(veins), { material: "vessel", paint: vessel("#46549a", "#7a86c4"), shading: { cavity: 0.2 } });

  // Cut edges of the greater and lesser omentum: lobulated fat at the curvatures.
  const fatty = fbm3(simplex3(41), 3);
  const omentum = [];
  for (const [line, width, shift] of [[greater, 0.075, 0.05], [lesser, 0.05, -0.03]]) {
    const pts = sampleCurve(line.map(([x, y]) => [x * 1.04, y * 1.02 + shift * (line === greater ? -1 : 1), -0.1]), 44);
    omentum.push(tube(pts, pts.map((_, i) => width * (0.7 + 0.3 * Math.sin(i * 0.9)))));
  }
  const omentumField = displace(union(omentum), (x, y, z) => fatty(x * 9, y * 9, z * 9), 0.026);
  const fat = tissue({ base: "#f1cd7c", dark: "#d39a45", light: "#fbe6b0", seed: 8, scale: 12, capillary: "#d0703f", capillaryAmount: 0.2, crestAmount: 0.4 });
  s.field("Omental fat", smoothSubtract(0.02, omentumField, outer), { material: "fat", simplify: { ratio: 0.45, error: 0.002 }, paint: fat });

  s.anchor("cardia", "Stomach wall", [-0.12, 1.2, 0.3]);
  s.anchor("fundus", "Stomach wall", [0.48, 1.68, 0.2]);
  s.anchor("body", "Stomach wall", [0.75, 0.25, 0.32]);
  s.anchor("rugae", "Stomach wall", [0.24, 0.05, -0.12]);
  s.anchor("antrum", "Stomach wall", [-0.42, -0.86, 0.34]);
  s.anchor("pylorus", "Stomach wall", [-0.96, -0.74, 0.2]);
  s.anchor("gastroepiploic", "Gastric arteries", [0.6, -0.8, 0.4]);
  return s;
}
