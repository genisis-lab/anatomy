import { Specimen } from "../kit/bake.mjs";
import { curveTube, stretch } from "../kit/sdf.mjs";
import { fbm3, simplex3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { clipMesh, merge, taperedTube } from "../kit/geometry.mjs";
import { bodyFrame, ensureScans, refine, scan } from "../kit/scans.mjs";

// The right knee in extension, anterior view: registered BodyParts3D bones
// (femur, tibia, fibula, patella) with sectioned shafts, plus articular
// cartilage, menisci, cruciate and collateral ligaments and the extensor
// mechanism authored in Three.js. Medial is +x, lateral (fibular) is −x.

const BONES = { femur: 24474, tibia: 24477, fibula: 24480, patella: 24486 };
const FEMUR_CUT = 2.15, TIBIA_CUT = -2.0;

export async function build() {
  await ensureScans(Object.values(BONES));
  const frame = bodyFrame({ center: [-84, 400, 75], scale: 1 / 55 });
  const load = (id, target, levels = 1) => {
    const g = refine(scan(id, { target, smooth: 2 }), levels, 3);
    g.applyMatrix4(frame);
    g.computeVertexNormals();
    return g;
  };
  const femur = clipMesh(load(BONES.femur, 22000), [0, 1, 0], FEMUR_CUT);
  const tibia = clipMesh(load(BONES.tibia, 18000), [0, -1, 0], -TIBIA_CUT);
  const fibula = clipMesh(load(BONES.fibula, 6000), [0, -1, 0], -TIBIA_CUT);
  const patella = load(BONES.patella, 6000, 2);

  const s = new Specimen("knee", { occlusion: { resolution: 190, reach: 0.08 } });
  const boneBase = tissue({ base: "#e4cfa6", dark: "#b48e5d", light: "#f8eedb", capillary: "#b98a5e", seed: 231, scale: 5, capillaryAmount: 0.22, mottleAmount: 0.6, crestAmount: 0.5 });
  const cartilage = tissue({ base: "#e6ecea", dark: "#b9c7c4", light: "#fbfdfc", capillary: "#c3b1b6", seed: 232, scale: 6, capillaryAmount: 0.1, crestAmount: 0.4 });
  const marrow = fbm3(simplex3(233), 3);
  // Cut shafts show a ring of compact bone around yellow marrow.
  const section = (geometry, articular) => (c) => {
    if (c.cap) {
      const rim = geometry.userData.rim[c.index];
      if (rim < 0.07) return mix(color("#f3ead6"), color("#e2d2b2"), marrow(c.x * 30, c.y * 30, c.z * 30) * 0.5 + 0.5);
      return mix(color("#e0b061"), color("#c9853f"), marrow(c.x * 12, c.y * 12, c.z * 12) * 0.5 + 0.5);
    }
    return mix(boneBase(c), cartilage(c), articular(c));
  };
  const femoralCartilage = (c) => {
    const condyles = smoothstep(0.62, 0.4, c.y) * smoothstep(-0.15, -0.45, c.ny);
    const posterior = smoothstep(0.95, 0.6, c.y) * smoothstep(-0.4, -0.7, c.nz);
    const groove = smoothstep(1.0, 0.75, c.y) * smoothstep(0.05, 0.2, c.y) * smoothstep(0.35, 0.6, c.nz) * smoothstep(0.55, 0.35, Math.abs(c.x - 0.12));
    return Math.min(1, condyles + posterior + groove) * 0.9;
  };
  const tibialCartilage = (c) => smoothstep(-0.16, -0.06, c.y) * smoothstep(0.45, 0.7, c.ny) * 0.9;
  const patellarCartilage = (c) => smoothstep(-0.15, -0.45, c.nz) * 0.9;
  const shading = { ao: 0.9, cavity: 0.7, saturate: 1 };
  s.mesh("Right femur", femur, { material: "bone", paint: section(femur, femoralCartilage), shading });
  s.mesh("Right tibia", tibia, { material: "bone", paint: section(tibia, tibialCartilage), shading });
  s.mesh("Right fibula", fibula, { material: "bone", paint: section(fibula, () => 0), shading });
  s.mesh("Right patella", patella, { material: "bone", paint: (c) => mix(boneBase(c), cartilage(c), patellarCartilage(c)), shading });

  // Menisci: C-shaped fibrocartilage wedges on each tibial plateau.
  const arc = (center, rx, rz, from, to, samples = 40) => {
    const points = [];
    for (let i = 0; i <= samples; i += 1) {
      const t = from + (to - from) * (i / samples);
      points.push([center[0] + Math.cos(t) * rx, center[1], center[2] + Math.sin(t) * rz]);
    }
    return points;
  };
  const meniscus = (points) => stretch(curveTube(points, (t) => 0.06 + 0.035 * Math.sin(t * Math.PI), 60), [1, 0.62, 1], [0, 0.03, 0]);
  const medial = meniscus(arc([0.33, 0.03, -0.1], 0.27, 0.36, -Math.PI / 2 - 0.45, Math.PI / 2 + 0.45));
  const lateral = meniscus(arc([-0.31, 0.04, -0.05], 0.24, 0.28, Math.PI * 0.32, Math.PI * 1.68));
  const fibro = tissue({ base: "#ecece2", dark: "#c6c4b2", light: "#fbfaf4", capillary: "#d3a8a6", seed: 234, scale: 10, capillaryAmount: 0.15, crestAmount: 0.5 });
  s.field("Medial meniscus", medial, { cell: 0.008, material: "cartilage", paint: fibro, simplify: { ratio: 0.45, error: 0.001 } });
  s.field("Lateral meniscus", lateral, { cell: 0.008, material: "cartilage", paint: fibro, simplify: { ratio: 0.45, error: 0.001 } });

  // Ligaments and tendons: glistening dense connective tissue with fibres.
  const fibres = simplex3(235);
  const ligament = (hex) => {
    const base = color(hex);
    return (c) => mix(base, color("#d9cbb3"), (0.5 + 0.5 * fibres(c.x * 40, c.y * 6, c.z * 40)) * 0.4);
  };
  s.mesh("Anterior cruciate ligament", taperedTube([[0.06, 0.0, 0.18], [-0.04, 0.22, -0.05], [-0.16, 0.5, -0.32]], (t) => 0.075 - 0.01 * t, { radial: 16 }), { material: "cartilage", paint: ligament("#f0e6d4"), shading: { cavity: 0.3 } });
  s.mesh("Posterior cruciate ligament", taperedTube([[0.04, -0.14, -0.58], [0.12, 0.2, -0.3], [0.24, 0.52, 0.02]], (t) => 0.085 - 0.01 * t, { radial: 16 }), { material: "cartilage", paint: ligament("#ece0cc"), shading: { cavity: 0.3 } });
  s.mesh("Medial collateral ligament", taperedTube([[0.93, 0.85, -0.1], [0.98, 0.42, -0.07], [0.92, 0.0, -0.04], [0.8, -0.45, 0.0], [0.62, -1.05, 0.06]], (t) => 0.12 + 0.06 * Math.sin(t * Math.PI), { radial: 20, up: [1, 0, 0], flatten: 0.3 }), { material: "cartilage", paint: ligament("#f1e8d8"), shading: { cavity: 0.3 } });
  s.mesh("Lateral collateral ligament", taperedTube([[-0.6, 0.72, -0.12], [-0.64, 0.3, -0.22], [-0.6, -0.1, -0.36]], 0.05, { radial: 14 }), { material: "cartilage", paint: ligament("#efe5d2"), shading: { cavity: 0.3 } });
  s.mesh("Patellar ligament", taperedTube([[0.0, 0.06, 0.6], [-0.01, -0.36, 0.58], [-0.02, -0.82, 0.5]], (t) => 0.2 - 0.04 * t, { radial: 24, up: [0, 0, 1], flatten: 0.42 }), { material: "cartilage", paint: ligament("#f2e9d8"), shading: { cavity: 0.3 } });
  const quadriceps = taperedTube([[0.0, 0.58, 0.56], [0.0, 0.95, 0.56], [0.0, 1.5, 0.5], [0.0, FEMUR_CUT, 0.42]], (t) => 0.2 + 0.2 * t, { radial: 24, up: [0, 0, 1], flatten: 0.48 });
  // The tendon gives way to the red bellies of rectus femoris and the vasti.
  const muscleFibre = (c) => mix(color("#b9443d"), color("#86282b"), (0.5 + 0.5 * Math.sin(c.x * 60 + fibres(c.x * 3, c.y * 3, c.z * 3) * 2)) * 0.55);
  s.mesh("Quadriceps tendon", quadriceps, { material: "muscle", paint: (c) => (c.cap ? color("#a8403e") : mix(ligament("#efe5d2")(c), muscleFibre(c), smoothstep(0.85, 1.35, c.y))), shading: { cavity: 0.3 } });

  s.anchor("femur", "Right femur", [0.3, 1.2, 0.3]);
  s.anchor("cartilage", "Right femur", [0.5, 0.15, 0.2]);
  s.anchor("tibia", "Right tibia", [0.4, -0.9, 0.3]);
  s.anchor("fibula", "Right fibula", [-0.6, -0.5, -0.2]);
  s.anchor("patella", "Right patella", [0.05, 0.35, 0.75]);
  s.anchor("patellar-ligament", "Patellar ligament", [0.0, -0.4, 0.64]);
  s.anchor("menisci", "Medial meniscus", [0.55, 0.03, 0.12]);
  s.anchor("acl", "Anterior cruciate ligament", [-0.04, 0.22, -0.0]);
  s.anchor("pcl", "Posterior cruciate ligament", [0.12, 0.2, -0.25]);
  s.anchor("mcl", "Medial collateral ligament", [1.0, 0.3, -0.05]);
  s.anchor("lcl", "Lateral collateral ligament", [-0.68, 0.3, -0.2]);
  return s;
}
