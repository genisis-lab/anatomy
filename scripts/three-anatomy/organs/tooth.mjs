import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { box, capsule, curveTube, displace, ellipsoid, intersect, offset, plane, roundCone, smoothSubtract, smoothUnion, sphere, stretch, subtract, union } from "../kit/sdf.mjs";
import { fbm3, simplex3, worley3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { merge, taperedTube } from "../kit/geometry.mjs";

// A mandibular first molar in its socket, sectioned through the long axis
// (the cut face is the plane z = 0, facing the viewer). Mesial is −x.
// Layers are separate meshes so each section reads with a crisp boundary.

const SECTION = { normal: new THREE.Vector3(0, 0, 1), offset: 0 };
const CEJ = 0.8; // cemento-enamel junction
const CREST = 0.52; // alveolar crest

export function build() {
  const noise = simplex3(271);
  const lumpy = fbm3(noise, 3);
  const trabecular = worley3(272);
  const front = plane([0, 0, 1], SECTION.offset);

  // ------------------------------------------------------------ tooth form
  const crownCore = box([0, 1.16, 0], [0.86, 0.38, 0.76], 0.32);
  const cusps = union(
    sphere([-0.46, 1.42, 0.34], 0.3), sphere([0.0, 1.44, 0.4], 0.28), sphere([0.48, 1.4, 0.32], 0.27),
    sphere([-0.4, 1.44, -0.36], 0.31), sphere([0.4, 1.42, -0.36], 0.29),
  );
  const grooves = union(
    capsule([-0.75, 1.68, 0.0], [0.75, 1.68, 0.02], 0.07),
    capsule([-0.2, 1.68, 0.0], [-0.22, 1.66, 0.75], 0.05),
    capsule([0.25, 1.68, 0.0], [0.26, 1.66, 0.72], 0.05),
    capsule([0.05, 1.68, 0.0], [0.04, 1.66, -0.75], 0.05),
  );
  const crown = smoothSubtract(0.08, smoothUnion(0.18, crownCore, cusps), grooves);
  const trunk = stretch(roundCone([0, 0.9, 0], [0, 0.18, 0], 0.66, 0.58), [1, 1, 0.92], [0, 0.5, 0]);
  const roots = union(
    stretch(curveTube([[-0.42, 0.3, 0], [-0.5, -0.6, 0], [-0.58, -1.35, 0], [-0.5, -1.92, 0]], (t) => 0.4 - 0.3 * t, 30), [0.7, 1, 1], [-0.5, 0, 0]),
    stretch(curveTube([[0.42, 0.3, 0], [0.5, -0.55, 0], [0.62, -1.25, 0], [0.6, -1.78, 0]], (t) => 0.38 - 0.28 * t, 30), [0.7, 1, 1], [0.5, 0, 0]),
  );
  const tooth = displace(smoothUnion(0.16, crown, trunk, roots), (x, y, z) => lumpy(x * 3, y * 3, z * 3), 0.01);

  // Pulp: chamber with horns under the cusps, canals down each root.
  const pulp = smoothUnion(0.08,
    ellipsoid([0, 0.78, 0], [0.48, 0.2, 0.38]),
    roundCone([-0.38, 0.86, 0.15], [-0.42, 1.12, 0.22], 0.1, 0.04),
    roundCone([0.38, 0.86, 0.15], [0.42, 1.1, 0.2], 0.1, 0.04),
    roundCone([-0.34, 0.86, -0.18], [-0.38, 1.1, -0.26], 0.1, 0.04),
    curveTube([[-0.36, 0.68, 0], [-0.48, -0.4, 0], [-0.56, -1.3, 0], [-0.5, -1.88, 0]], (t) => 0.09 - 0.06 * t, 30),
    curveTube([[0.36, 0.68, 0], [0.48, -0.4, 0], [0.6, -1.2, 0], [0.6, -1.74, 0]], (t) => 0.085 - 0.055 * t, 30),
  );
  const crownZone = { d: (x, y) => CEJ - y + 0.05 * Math.cos(x * 3), b: [-9, -9, -9, 9, 9, 9] };
  const enamel = subtract(intersect(tooth, crownZone), offset(tooth, -0.2));
  const cementum = subtract(intersect(tooth, { d: (x, y) => -crownZone.d(x, y), b: crownZone.b }), offset(tooth, -0.04));
  const dentin = subtract(tooth, enamel, cementum, pulp);

  const s = new Specimen("tooth", { cell: 0.015 });
  const caps = [SECTION];
  s.field("Enamel", intersect(enamel, front), {
    material: "enamel", caps, cell: 0.012, simplify: { ratio: 0.4, error: 0.001 },
    paint: (c) => (c.cap
      ? mix(color("#eef1f2"), color("#c9d3da"), 0.5 + 0.5 * Math.sin((c.x * 0.8 + c.y) * 60) * 0.5) // enamel rods
      : tissue({ base: "#f4efe2", dark: "#d6ccb0", light: "#ffffff", seed: 273, scale: 6, crestAmount: 0.6 })(c)),
    shading: { ao: 0.75, cavity: 0.6 },
  });
  s.field("Dentin", intersect(dentin, front), {
    material: "bone", caps, simplify: { ratio: 0.35, error: 0.001 },
    paint: (c) => (c.cap ? mix(color("#efd9a6"), color("#dcbd80"), 0.5 + 0.5 * Math.sin(Math.hypot(c.x, c.y - 0.8) * 45) * 0.35) : color("#e8d3a4")),
  });
  s.field("Cementum", intersect(cementum, front), {
    material: "bone", caps, cell: 0.011, simplify: { ratio: 0.3, error: 0.001 }, paint: (c) => (c.cap ? color("#d8be8c") : tissue({ base: "#e1c995", dark: "#bea06a", light: "#f2e2bd", seed: 274, scale: 10 })(c)),
  });
  s.field("Pulp", intersect(pulp, front), {
    caps, cell: 0.01, simplify: { ratio: 0.35, error: 0.001 },
    paint: (c) => mix(color("#d6646a"), color("#a8384a"), lumpy(c.x * 14, c.y * 14, c.z * 14) * 0.5 + 0.5),
  });

  // ------------------------------------------------------------ supporting tissues
  const socket = offset(intersect(tooth, { d: (x, y) => y - (CREST + 0.08), b: [-9, -9, -9, 9, 9, 9] }), 0.05);
  const pdl = subtract(intersect(socket, { d: (x, y) => y - CREST, b: [-9, -9, -9, 9, 9, 9] }), tooth);
  s.field("Periodontal ligament", intersect(pdl, front), { caps, cell: 0.01, simplify: { ratio: 0.3, error: 0.001 }, paint: (c) => mix(color("#e7a99a"), color("#c97c74"), lumpy(c.x * 20, c.y * 20, 0) * 0.5 + 0.5) });

  const crest = (x) => CREST - 0.18 * Math.min(1, (Math.abs(x) / 1.6) ** 2) + 0.04 * Math.cos(x * 4);
  const block = intersect(box([0, -1.05, -0.1], [1.75, 1.75, 1.15], 0.12), { d: (x, y) => y - crest(x), b: [-9, -9, -9, 9, 9, 9] });
  const canalPath = [[-1.9, -2.12, -0.02], [0, -2.18, 0.0], [1.9, -2.14, -0.02]];
  const bone = subtract(displace(block, (x, y, z) => lumpy(x * 2, y * 2, z * 2), 0.02), socket, curveTube(canalPath, 0.2, 20));
  s.field("Alveolar bone", intersect(bone, front), {
    material: "bone", caps, cell: 0.017, simplify: { ratio: 0.3, error: 0.0012 },
    paint: (c) => {
      if (!c.cap) return tissue({ base: "#e4cfa6", dark: "#b28b5a", light: "#f8eedb", seed: 275, scale: 4 })(c);
      const fromSocket = socket.d(c.x, c.y, c.z);
      const fromOutside = -block.d(c.x, c.y, c.z);
      if (fromSocket < 0.06 || fromOutside < 0.12) return mix(color("#f1e5cc"), color("#e1cfa9"), lumpy(c.x * 20, c.y * 20, 0) * 0.5 + 0.5); // lamina dura and cortical plates
      const t = trabecular(c.x * 9, c.y * 9, c.z * 9);
      return mix(mix(color("#cf8d74"), color("#b8644f"), lumpy(c.x * 6, c.y * 6, 0) * 0.5 + 0.5), color("#f0e2c6"), (1 - smoothstep(0.0, 0.12, t.f2 - t.f1)) * 0.85);
    },
  });

  // Gingiva covers the crest and cuffs the neck of the tooth, leaving a sulcus.
  const collar = smoothUnion(0.12,
    intersect(offset(block, 0.14), { d: (x, y) => y - (crest(x) + 0.16), b: [-9, -9, -9, 9, 9, 9] }, { d: (x, y) => crest(x) - 0.25 - y, b: [-9, -9, -9, 9, 9, 9] }),
    intersect(offset(tooth, 0.16), { d: (x, y) => y - (CEJ + 0.04), b: [-9, -9, -9, 9, 9, 9] }, { d: (x, y) => CREST - 0.05 - y, b: [-9, -9, -9, 9, 9, 9] }),
  );
  const gingiva = subtract(collar, bone, offset(tooth, 0.012));
  s.field("Gingiva", intersect(gingiva, front), {
    caps, simplify: { ratio: 0.32, error: 0.0012 },
    paint: (c) => (c.cap ? mix(color("#e48f8f"), color("#c76a70"), lumpy(c.x * 18, c.y * 18, 0) * 0.5 + 0.5) : tissue({ base: "#e5918d", dark: "#c06467", light: "#f6c1b8", capillary: "#b34654", seed: 276, scale: 8, capillaryAmount: 0.3 })(c)),
  });

  // Inferior alveolar neurovascular bundle with apical branches into the pulp.
  const nerves = [taperedTube(canalPath.map(([x, y, z]) => [x, y + 0.02, z - 0.05]), 0.1, { radial: 18 })];
  const arteries = [taperedTube(canalPath.map(([x, y, z]) => [x, y + 0.1, z + 0.08]), 0.055, { radial: 14 })];
  const veins = [taperedTube(canalPath.map(([x, y, z]) => [x, y - 0.08, z + 0.09]), 0.065, { radial: 14 })];
  for (const [ax, apex] of [[-0.5, -1.9], [0.6, -1.76]]) {
    nerves.push(taperedTube([[ax - 0.05, -2.08, -0.02], [ax - 0.02, (apex - 2.08) / 2, -0.02], [ax, apex + 0.15, -0.02], [ax * 0.7, 0.6, -0.02]], 0.022, { radial: 8 }));
    arteries.push(taperedTube([[ax + 0.05, -2.02, 0.02], [ax + 0.03, (apex - 2.02) / 2, 0.02], [ax + 0.02, apex + 0.15, 0.02], [ax * 0.7 + 0.04, 0.62, 0.02]], 0.018, { radial: 8 }));
  }
  s.mesh("Inferior alveolar nerve", merge(nerves), { material: "nerve", paint: (c) => mix(color("#eed06d"), color("#c89a3c"), smoothstep(0.0, 0.8, c.curv + 0.3) * 0.5) });
  s.mesh("Dental arteries", merge(arteries), { material: "vessel", paint: (c) => mix(color("#b8323a"), color("#e5675b"), smoothstep(0.1, 0.9, c.nz) * 0.5) });
  s.mesh("Dental veins", merge(veins), { material: "vessel", paint: (c) => mix(color("#46549a"), color("#7a86c4"), smoothstep(0.1, 0.9, c.nz) * 0.5) });

  s.anchor("enamel", "Enamel", [-0.55, 1.4, 0]);
  s.anchor("crown", "Enamel", [0.0, 1.62, -0.3]);
  s.anchor("dentin", "Dentin", [0.3, 0.3, 0]);
  s.anchor("pulp", "Pulp", [0.0, 0.8, 0]);
  s.anchor("root-canal", "Pulp", [0.5, -0.6, 0]);
  s.anchor("cementum", "Cementum", [-0.78, -0.6, 0]);
  s.anchor("periodontal-ligament", "Periodontal ligament", [0.9, -0.9, 0]);
  s.anchor("alveolar-bone", "Alveolar bone", [1.3, -0.8, 0]);
  s.anchor("gingiva", "Gingiva", [-1.0, 0.6, 0]);
  s.anchor("nerve", "Inferior alveolar nerve", [-1.4, -2.1, 0.0]);
  return s;
}
