import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { box, curveTube, displace, ellipsoid, intersect, plane, sampleCurve, smoothSubtract, smoothUnion, subtract, torus, transform, tube } from "../kit/sdf.mjs";
import { fbm3, simplex3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { growVessels, merge, taperedTube, vesselGeometry } from "../kit/geometry.mjs";

// The course from the pharyngo-oesophageal junction to the cardia, drifting
// to the patient's left (+x) and forward as it approaches the diaphragm.
const PATH = [[0.0, 1.95, -0.02], [0.02, 1.35, 0.0], [0.0, 0.7, 0.0], [0.03, 0.0, 0.01], [0.1, -0.6, 0.05], [0.22, -1.05, 0.12], [0.36, -1.36, 0.18], [0.52, -1.58, 0.22]];
const R = 0.2;
// Wall layers by depth from the outer surface (exaggerated for study).
const LONGITUDINAL = [0, 0.028], CIRCULAR = [0.028, 0.06], SUBMUCOSA = [0.06, 0.08], MUCOSA = [0.08, 0.112];
const WINDOW_BOTTOM = -0.82;
const WINDOW_TOPS = { longitudinal: 0.3, circular: 0.1, submucosa: -0.1, mucosa: -0.3 };

export function build() {
  const noise = simplex3(91);
  const lumpy = fbm3(noise, 3);
  const fibre = simplex3(92);
  const axis = sampleCurve(PATH, 120);
  // Physiological constrictions: cricopharyngeal (top), aortobronchial and
  // diaphragmatic narrowings, with the lower sphincter as a gentle swelling.
  const radii = axis.map(([, y]) => R
    - 0.025 * Math.exp(-(((y - 1.82) / 0.12) ** 2))
    - 0.02 * Math.exp(-(((y - 0.72) / 0.15) ** 2))
    + 0.02 * Math.exp(-(((y + 1.3) / 0.12) ** 2)));
  const outer = displace(tube(axis, radii), (x, y, z) => lumpy(x * 3, y * 3, z * 3) * 0.5 + noise(x * 10, y * 4, z * 10) * 0.2, 0.012);
  const layer = ([d0, d1], extra = () => 0) => ({
    d: (x, y, z) => {
      const d = outer.d(x, y, z);
      return Math.max(d0 + d, -d - d1 - extra(x, y, z));
    },
    b: outer.b,
  });
  const windowFor = (top) => box([0.04, (top + WINDOW_BOTTOM) / 2, 0.32], [0.17, (top - WINDOW_BOTTOM) / 2, 0.3], 0.02);
  const stellateFolds = (x, y, z) => {
    const angle = Math.atan2(z, x - 0.03);
    return Math.max(0, Math.sin(angle * 7 + noise(x * 2, y * 1.2, z * 2) * 1.5)) * 0.03;
  };

  const s = new Specimen("esophagus", { cell: 0.011 });
  const longitudinalPaint = (c) => {
    const stripe = 0.5 + 0.5 * Math.sin(Math.atan2(c.z, c.x) * 34 + fibre(c.x * 3, c.y * 1.2, c.z * 3) * 2);
    return mix(mix(color("#d9897a"), color("#b85c55"), stripe * 0.6), color("#f2bfae"), smoothstep(0.1, 0.7, -c.curv) * 0.3);
  };
  const circularPaint = (c) => {
    const stripe = 0.5 + 0.5 * Math.sin(c.y * 80 + fibre(c.x * 4, c.y * 4, c.z * 4) * 2.4);
    return mix(color("#c4544f"), color("#9c3a3c"), stripe * 0.65);
  };
  const submucosaPaint = tissue({ base: "#efcfb0", dark: "#d9a985", light: "#fbe8d4", capillary: "#c4524e", seed: 93, scale: 9, capillaryScale: 11, capillaryAmount: 0.45 });
  const mucosaPaint = tissue({ base: "#f0c2b8", dark: "#d48f8d", light: "#fce5dd", capillary: "#c8636a", seed: 94, scale: 6, capillaryAmount: 0.2, crestAmount: 0.5 });

  s.field("Longitudinal muscular layer", smoothSubtract(0.012, layer(LONGITUDINAL), windowFor(WINDOW_TOPS.longitudinal)), {
    simplify: { ratio: 0.35, error: 0.0012 },
    material: "muscle",
    paint: (c) => {
      let tone = longitudinalPaint(c);
      // Pale upper sphincter band and the lower oesophageal sphincter zone.
      if (c.y > 1.7) tone = mix(tone, color("#e7a38f"), smoothstep(1.7, 1.86, c.y));
      if (c.y < -1.15) tone = mix(tone, color("#d27a6e"), smoothstep(-1.15, -1.3, c.y));
      if (c.y < -1.42) tone = mix(tone, color("#e08f7f"), smoothstep(-1.42, -1.55, c.y));
      return tone;
    },
  });
  const segment = (field) => intersect(field, box([0.06, -0.32, 0], [0.42, 0.8, 0.42]));
  s.field("Circular muscular layer", segment(smoothSubtract(0.012, layer(CIRCULAR), windowFor(WINDOW_TOPS.circular))), {
    cell: 0.0065, simplify: { ratio: 0.3, error: 0.001 }, material: "muscle", paint: circularPaint,
  });
  s.field("Submucosa", segment(smoothSubtract(0.01, layer(SUBMUCOSA), windowFor(WINDOW_TOPS.submucosa))), {
    cell: 0.0065, simplify: { ratio: 0.3, error: 0.001 }, material: "fat", paint: submucosaPaint,
  });
  s.field("Mucosa", segment(smoothSubtract(0.01, layer(MUCOSA, stellateFolds), windowFor(WINDOW_TOPS.mucosa))), {
    cell: 0.0065, simplify: { ratio: 0.3, error: 0.001 }, material: "mucosa", paint: mucosaPaint,
  });

  // --- context: aortic arch and descending aorta, bronchi, diaphragm, cardia
  const aortaPath = [[-0.18, 1.02, 0.3], [0.06, 1.16, 0.12], [0.34, 1.06, -0.14], [0.44, 0.7, -0.36], [0.42, -0.2, -0.44], [0.3, -1.2, -0.5], [0.2, -1.95, -0.5]];
  const aortaCut = plane([-0.8, 0.0, 0.6], 0.32);
  const aorta = intersect(subtract(curveTube(aortaPath, 0.155, 70), curveTube(aortaPath, 0.11, 70)), aortaCut, plane([0, -1, 0], 1.9));
  s.field("Aorta", aorta, {
    material: "vessel",
    cell: 0.014,
    simplify: { ratio: 0.4, error: 0.0015 },
    caps: [{ normal: new THREE.Vector3(-0.8, 0, 0.6).normalize(), offset: 0.32 / 1.0 }, { normal: new THREE.Vector3(0, -1, 0), offset: 1.9 }],
    paint: tissue({ base: "#d0504a", dark: "#9f3238", light: "#f08a78", capillary: "#8f2a32", seed: 95, scale: 3, capillaryAmount: 0.2 }),
  });

  const ringed = (field, axisPoints) => {
    // Cartilage rings modulate the bronchial surface.
    return displace(field, (x, y, z) => {
      const p = new THREE.Vector3(x, y, z);
      let best = Infinity, along = 0, total = 0;
      for (let i = 0; i < axisPoints.length - 1; i += 1) {
        const a = new THREE.Vector3(...axisPoints[i]), b = new THREE.Vector3(...axisPoints[i + 1]);
        const ab = b.clone().sub(a);
        const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
        const d = p.distanceTo(a.clone().addScaledVector(ab, t));
        if (d < best) { best = d; along = total + t * ab.length(); }
        total += ab.length();
      }
      return -Math.pow(0.5 + 0.5 * Math.sin(along * 52), 3);
    }, 0.012);
  };
  const leftBronchus = [[0.0, 0.7, 0.34], [0.22, 0.6, 0.34], [0.44, 0.48, 0.32]];
  const rightBronchus = [[0.0, 0.7, 0.34], [-0.2, 0.6, 0.34], [-0.38, 0.5, 0.32]];
  const trachea = [[0.0, 0.94, 0.34], [0.0, 0.7, 0.34]];
  const airway = intersect(
    smoothUnion(0.05, ringed(curveTube(leftBronchus, 0.085, 24), leftBronchus), ringed(curveTube(rightBronchus, 0.095, 24), rightBronchus), ringed(curveTube(trachea, 0.12, 12), trachea)),
    plane([0, 1, 0], 0.9), plane([0.9, -0.45, 0], 0.5), plane([-0.9, -0.45, 0], 0.45),
  );
  const airwayTissue = tissue({ base: "#e7c7b6", dark: "#c8978a", light: "#f6e8dc", capillary: "#d27f78", seed: 96, scale: 5, capillaryAmount: 0.25 });
  const airwayHollow = subtract(airway, curveTube(leftBronchus, 0.06, 24), curveTube(rightBronchus, 0.068, 24), curveTube([[0, 1.0, 0.34], [0, 0.64, 0.34]], 0.088, 12));
  s.field("Tracheal bifurcation", airwayHollow, {
    material: "cartilage",
    cell: 0.009,
    simplify: { ratio: 0.4, error: 0.0012 },
    caps: [
      { normal: new THREE.Vector3(0, 1, 0), offset: 0.9 },
      { normal: new THREE.Vector3(0.9, -0.45, 0).normalize(), offset: 0.5 / Math.hypot(0.9, 0.45) },
      { normal: new THREE.Vector3(-0.9, -0.45, 0).normalize(), offset: 0.45 / Math.hypot(0.9, 0.45) },
    ],
    paint: (c) => {
      if (c.cap) return color("#efe4d2");
      // Crests of the rings are cartilage; the grooves are pinker ligament.
      const ring = smoothstep(-0.1, 0.5, -c.curv);
      return mix(airwayTissue(c), color("#f6efe4"), ring * 0.6);
    },
  });

  // A slab of diaphragm with the oesophageal hiatus slung by the right crus.
  const dome = ellipsoid([0.26, -2.25, -0.05], [1.05, 1.05, 0.8]);
  const diaphragmSheet = intersect(
    subtract(dome, ellipsoid([0.26, -2.25, -0.05], [0.99, 0.99, 0.74])),
    plane([0, -1, 0], 1.55), box([0.26, -1.3, -0.05], [0.95, 0.4, 0.62], 0.05),
  );
  const hiatusSling = transform(torus([0, 0, 0], 0.27, 0.045), { position: [0.3, -1.25, 0.15], rotation: [0.12, 0, 0.35] });
  const diaphragm = subtract(smoothUnion(0.04, diaphragmSheet, hiatusSling), curveTube(PATH.slice(4), (t) => R + 0.03 - 0.0 * t, 40));
  const radial = simplex3(97);
  s.field("Diaphragm", diaphragm, {
    material: "muscle",
    cell: 0.012,
    simplify: { ratio: 0.4, error: 0.0015 },
    paint: (c) => {
      const centralTendon = Math.hypot(c.x - 0.15, c.z + 0.1) < 0.32;
      const stripes = 0.5 + 0.5 * Math.sin(Math.atan2(c.z + 0.05, c.x - 0.26) * 40 + radial(c.x * 3, c.y * 3, c.z * 3) * 1.4);
      if (centralTendon) return mix(color("#efe3d0"), color("#d9c7ad"), stripes * 0.4);
      return mix(color("#c95b54"), color("#9a3a3c"), stripes * 0.55);
    },
  });

  const cardia = intersect(smoothUnion(0.12, ellipsoid([0.78, -1.82, 0.12], [0.42, 0.34, 0.36]), curveTube(PATH.slice(6), R + 0.01, 16)), plane([0, -1, 0], 1.95), plane([0, 1, 0], -1.5));
  s.field("Gastric cardia", displace(cardia, (x, y, z) => lumpy(x * 3, y * 3, z * 3), 0.01), {
    cell: 0.012,
    caps: [{ normal: new THREE.Vector3(0, -1, 0), offset: 1.95 }],
    simplify: { ratio: 0.4, error: 0.0015 },
    paint: (c) => (c.cap ? color("#c75e5e") : tissue({ base: "#e08d7d", dark: "#b8574f", light: "#f4c2b0", capillary: "#a8323a", seed: 98, scale: 3 })(c)),
  });

  // Oesophageal plexus of the vagus nerves on the lower oesophagus.
  const keep = (p) => !(p.z > 0.05 && p.y < WINDOW_TOPS.longitudinal + 0.03 && p.y > WINDOW_BOTTOM - 0.03 && Math.abs(p.x - 0.04) < 0.2) && p.y > -1.2;
  const plexus = growVessels(outer, {
    seed: 99,
    roots: [
      { at: [-0.12, 0.6, 0.16], dir: [0.15, -1, 0], radius: 0.014, length: 1.7, generations: 3 },
      { at: [0.18, 0.62, 0.12], dir: [-0.1, -1, 0], radius: 0.014, length: 1.7, generations: 3 },
      { at: [0.1, 0.6, -0.18], dir: [0, -1, 0], radius: 0.014, length: 1.7, generations: 2 },
    ],
    step: 0.024, hug: 0.45, keep, branchEvery: 0.2, branchAngle: 0.5, wander: 0.3, minRadius: 0.005,
  });
  s.mesh("Vagal plexus", vesselGeometry(plexus, { radial: 8 }), {
    material: "nerve",
    paint: (c) => mix(color("#e8c968"), color("#c79a3b"), smoothstep(0.0, 0.8, c.curv + 0.3) * 0.5),
    shading: { cavity: 0.2 },
  });

  const branches = [];
  for (let i = 0; i < 4; i += 1) {
    const y = 0.2 - i * 0.38;
    branches.push(taperedTube([[0.36 - i * 0.02, y, -0.24], [0.24, y + 0.05, -0.18], [0.12 + i * 0.02, y + 0.06, -0.12]], 0.018, { radial: 10 }));
  }
  s.mesh("Oesophageal arteries", merge(branches), { material: "vessel", paint: (c) => mix(color("#b8323a"), color("#e5675b"), smoothstep(0.1, 0.9, c.ny * 0.4 + c.nz * 0.6) * 0.5) });

  s.anchor("longitudinal-muscle", "Longitudinal muscular layer", [-0.12, 0.4, 0.15]);
  s.anchor("circular-muscle", "Circular muscular layer", [0.04, 0.2, 0.17]);
  s.anchor("submucosa", "Submucosa", [0.04, 0.0, 0.13]);
  s.anchor("mucosa", "Mucosa", [0.04, -0.2, 0.11]);
  s.anchor("upper-sphincter", "Longitudinal muscular layer", [0.0, 1.82, 0.18]);
  s.anchor("lower-sphincter", "Longitudinal muscular layer", [0.24, -1.12, 0.32]);
  s.anchor("hiatus", "Diaphragm", [0.1, -1.3, 0.5]);
  s.anchor("aortic-arch", "Aorta", [0.3, 1.18, 0.0]);
  s.anchor("vagal-plexus", "Vagal plexus", [0.0, -0.8, 0.22]);
  return s;
}
