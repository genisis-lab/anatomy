import { Specimen } from "../kit/bake.mjs";
import { displace, ellipsoid, smoothUnion, transform } from "../kit/sdf.mjs";
import { fbm3, mulberry32, simplex3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { clipMesh, ellipsoidGeometry, merge, taperedTube } from "../kit/geometry.mjs";
import { bodyFrame, ensureScans, scanGroup, SCAN_IDS } from "../kit/scans.mjs";
import { boneTissue } from "./skeleton.mjs";

// The lymphatic system of the head, trunk and upper limbs over a registered
// skeletal frame (the rib cage is left out so the thoracic duct and
// mediastinal nodes stay visible). Lymph vessels and nodes follow the atlas
// convention of green; they are enlarged so the drainage pathways read.
// Patient's left is +x.

const FRAME = { center: [0, 1150, 100], scale: 1 / 240 };
const mm = (x, y, z) => [x * FRAME.scale, (y - FRAME.center[1]) * FRAME.scale, (z - FRAME.center[2]) * FRAME.scale];
const NODE = 8; // node radius in mm, enlarged
const VESSEL = 2.6; // vessel radius in mm, enlarged

export async function build() {
  const bones = SCAN_IDS.skeleton;
  const frameGroups = ["skull", "mandible", "vertebrae", "girdle", "arm", "pelvis", "leg"];
  await ensureScans(frameGroups.flatMap((key) => bones[key]).map(([id]) => id));
  const frame = bodyFrame(FRAME);
  const s = new Specimen("lymphatic", { occlusion: { resolution: 210, reach: 0.05 } });
  const random = mulberry32(261);

  // ------------------------------------------------------------ skeletal frame
  const reference = [];
  for (const [key, target] of [["skull", 1400], ["mandible", 2000], ["vertebrae", 900], ["girdle", 1500], ["arm", 1800], ["pelvis", 3500], ["leg", 2500]]) {
    const entries = key === "leg" ? bones.leg.filter(([, name]) => /femur/.test(name)) : bones[key];
    reference.push(...scanGroup(entries, { target, transform: frame }).geometries);
  }
  const bottom = mm(0, 712, 0)[1];
  const skeleton = clipMesh(merge(reference), [0, -1, 0], -bottom);
  const bone = boneTissue(262)(null);
  s.mesh("Skeletal frame", skeleton, {
    material: "bone",
    paint: (c) => (c.cap ? color("#efe3c8") : mix(bone(c), color("#f4ecdc"), 0.25)),
    shading: { ao: 0.8, cavity: 0.6 },
  });

  // ------------------------------------------------------------ nodes
  const nodeGeometries = {};
  const cluster = (name, center, count, spread, radius = NODE) => {
    const list = (nodeGeometries[name] ??= []);
    for (let i = 0; i < count; i += 1) {
      const offset = [(random() - 0.5) * spread[0], (random() - 0.5) * spread[1], (random() - 0.5) * spread[2]];
      const r = radius * (0.65 + random() * 0.6);
      list.push(ellipsoidGeometry(mm(center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]), [r * FRAME.scale * 1.3, r * FRAME.scale, r * FRAME.scale * 0.9], { width: 16, height: 12, rotation: [random() * 3, random() * 3, random() * 3] }));
    }
  };
  const chain = (name, from, to, count, radius = NODE) => {
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      cluster(name, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t], 1, [6, 6, 6], radius);
    }
  };
  for (const side of [-1, 1]) {
    cluster("Cervical nodes", [side * 42, 1452, 138], 4, [22, 14, 14]);
    chain("Cervical nodes", [side * 48, 1480, 108], [side * 40, 1385, 116], 7);
    cluster("Cervical nodes", [side * 62, 1378, 116], 4, [24, 10, 12]);
    cluster("Axillary nodes", [side * 125, 1292, 80], 11, [40, 46, 34], NODE * 1.1);
    cluster("Axillary nodes", [side * 205, 1066, 92], 2, [12, 14, 10]);
    chain("Abdominal and pelvic nodes", [side * 24, 1100, 112], [side * 26, 975, 115], 6);
    chain("Abdominal and pelvic nodes", [side * 40, 950, 112], [side * 80, 862, 128], 5);
    chain("Inguinal nodes", [side * 68, 812, 142], [side * 118, 800, 136], 5, NODE * 1.05);
    chain("Inguinal nodes", [side * 98, 790, 140], [side * 102, 748, 140], 3);
  }
  cluster("Mediastinal nodes", [0, 1268, 104], 9, [46, 40, 26]);
  cluster("Mesenteric nodes", [-6, 1002, 150], 14, [70, 60, 30], NODE * 0.85);

  const nodePaint = tissue({ base: "#94b65f", dark: "#5e7f3c", light: "#d1e2a2", capillary: "#6d8a3f", seed: 263, scale: 40, capillaryAmount: 0.2, crestAmount: 0.5 });
  for (const [name, list] of Object.entries(nodeGeometries)) s.mesh(name, merge(list), { material: "organ", paint: nodePaint, shading: { ao: 0.6, cavity: 0.3 } });

  // ------------------------------------------------------------ vessels and ducts
  const beaded = (points, radius = VESSEL) => {
    // Valves give collecting lymphatics their beaded outline.
    const r = radius * FRAME.scale;
    return taperedTube(points.map((p) => mm(...p)), (t) => r * (1 + 0.28 * Math.pow(Math.max(0, Math.sin(t * 46)), 6)), { radial: 8 });
  };
  const vessels = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k += 1) {
      const o = (k - 1) * 10;
      vessels.push(beaded([[side * (238 + o), 830, 112 + o], [side * (222 + o * 0.6), 950, 104], [side * 205, 1062, 94], [side * (176 + o), 1170, 88], [side * 132, 1286, 82]]));
    }
    for (let k = 0; k < 3; k += 1) {
      const o = (k - 1) * 14;
      vessels.push(beaded([[side * (95 + o), 712, 146], [side * (98 + o * 0.6), 760, 142], [side * (96 + o * 0.3), 800, 140]]));
    }
    // Inguinal → iliac → para-aortic → cisterna chyli (lumbar trunks).
    vessels.push(beaded([[side * 96, 805, 140], [side * 78, 866, 128], [side * 42, 948, 112], [side * 24, 1010, 120], [-6, 1040, 128]], VESSEL * 1.2));
    // Axillary → subclavian trunk; deep cervical chain → jugular trunk.
    vessels.push(beaded([[side * 125, 1292, 80], [side * 92, 1338, 100], [side * 34, 1362, 120]], VESSEL * 1.2));
    vessels.push(beaded([[side * 48, 1484, 108], [side * 44, 1430, 112], [side * 36, 1370, 120]], VESSEL * 1.1));
    // Bronchomediastinal trunks.
    vessels.push(beaded([[side * 12, 1272, 104], [side * 22, 1320, 112], [side * 32, 1360, 120]]));
  }
  vessels.push(beaded([[-6, 1004, 150], [-8, 1020, 138], [-6, 1040, 128]], VESSEL * 1.3)); // intestinal trunk
  const lymphPaint = (c) => mix(color("#86b25c"), color("#c6dd96"), smoothstep(0.1, 0.9, c.ny * 0.4 + c.nz * 0.6) * 0.5);
  s.mesh("Lymphatic vessels", merge(vessels), { material: "vessel", paint: lymphPaint, shading: { ao: 0.5, cavity: 0.2 } });

  // Thoracic duct: from the cisterna chyli, right of the aorta, crossing to the
  // left in the upper thorax and arching into the left venous angle.
  const ductPath = [[-6, 1040, 128], [-7, 1120, 122], [-6, 1200, 118], [-2, 1255, 116], [8, 1300, 116], [16, 1350, 116], [26, 1392, 118], [36, 1384, 122], [34, 1364, 122]];
  const ducts = [
    taperedTube(ductPath.map((p) => mm(...p)), (t) => 3.6 * FRAME.scale * (1 + 0.2 * Math.pow(Math.max(0, Math.sin(t * 60)), 6)), { radial: 12 }),
    ellipsoidGeometry(mm(-6, 1032, 128), [10 * FRAME.scale, 22 * FRAME.scale, 9 * FRAME.scale], { width: 18, height: 14 }), // cisterna chyli
    taperedTube([mm(-28, 1388, 120), mm(-31, 1376, 121), mm(-33, 1364, 121)], 3 * FRAME.scale, { radial: 10 }), // right lymphatic duct
  ];
  s.mesh("Thoracic duct and cisterna chyli", merge(ducts), { material: "vessel", paint: (c) => mix(color("#b6cf7c"), color("#e4edc0"), smoothstep(0.1, 0.9, c.nz) * 0.5), shading: { ao: 0.5, cavity: 0.2 } });

  // Venous angles where lymph returns to the blood.
  const veins = [];
  for (const side of [-1, 1]) {
    veins.push(taperedTube([mm(side * 48, 1500, 104), mm(side * 42, 1430, 110), mm(side * 34, 1364, 121)], 7 * FRAME.scale, { radial: 14 }));
    veins.push(taperedTube([mm(side * 140, 1342, 96), mm(side * 90, 1352, 108), mm(side * 34, 1364, 121)], 6 * FRAME.scale, { radial: 14 }));
  }
  veins.push(taperedTube([mm(34, 1364, 121), mm(8, 1340, 126), mm(-20, 1318, 124), mm(-24, 1240, 120)], 7.5 * FRAME.scale, { radial: 14 }));
  veins.push(taperedTube([mm(-34, 1364, 121), mm(-24, 1336, 124), mm(-22, 1318, 124)], 7 * FRAME.scale, { radial: 14 }));
  s.mesh("Great veins", merge(veins), { material: "vessel", paint: (c) => mix(color("#46549a"), color("#7a86c4"), smoothstep(0.1, 0.9, c.nz) * 0.5), shading: { cavity: 0.2 } });

  // ------------------------------------------------------------ lymphoid organs
  const lumpy = fbm3(simplex3(264), 3);
  const spleen = displace(transform(smoothUnion(0.02, ellipsoid([0, 0, 0], [0.11, 0.22, 0.085]), ellipsoid([0.02, -0.08, 0], [0.09, 0.12, 0.075])), { position: mm(96, 1105, 62), rotation: [0.2, 0.3, -0.45] }), (x, y, z) => lumpy(x * 14, y * 14, z * 14), 0.006);
  s.field("Spleen", spleen, { cell: 0.006, paint: tissue({ base: "#8a3c55", dark: "#5e2340", light: "#c48298", capillary: "#4e2a52", seed: 265, scale: 12, capillaryAmount: 0.25 }) });
  const thymus = displace(smoothUnion(0.03,
    transform(ellipsoid([0, 0, 0], [0.07, 0.19, 0.045]), { position: mm(-10, 1306, 158), rotation: [0, 0, 0.12] }),
    transform(ellipsoid([0, 0, 0], [0.065, 0.17, 0.045]), { position: mm(12, 1300, 156), rotation: [0, 0, -0.1] }),
  ), (x, y, z) => lumpy(x * 30, y * 30, z * 30), 0.008);
  s.field("Thymus", thymus, { cell: 0.006, paint: tissue({ base: "#dcb7a4", dark: "#b88a78", light: "#f2d9cb", capillary: "#c4736e", seed: 266, scale: 30, capillaryAmount: 0.3 }) });
  const tonsils = merge([-1, 1].map((side) => ellipsoidGeometry(mm(side * 18, 1478, 128), [0.036, 0.055, 0.026], { width: 16, height: 12 })));
  s.mesh("Palatine tonsils", tonsils, { paint: tissue({ base: "#d98a84", dark: "#b0595a", light: "#f0b8ae", seed: 267, scale: 40 }) });

  s.anchor("cervical", "Cervical nodes", mm(-44, 1430, 125));
  s.anchor("axillary", "Axillary nodes", mm(125, 1290, 100));
  s.anchor("mediastinal", "Mediastinal nodes", mm(0, 1268, 118));
  s.anchor("thoracic-duct", "Thoracic duct and cisterna chyli", mm(-4, 1180, 130));
  s.anchor("cisterna-chyli", "Thoracic duct and cisterna chyli", mm(-6, 1032, 140));
  s.anchor("mesenteric", "Mesenteric nodes", mm(-6, 1002, 165));
  s.anchor("inguinal", "Inguinal nodes", mm(-90, 806, 150));
  s.anchor("spleen", "Spleen", mm(96, 1105, 90));
  s.anchor("thymus", "Thymus", mm(0, 1300, 172));
  s.anchor("tonsils", "Palatine tonsils", mm(-18, 1478, 140));
  s.anchor("venous-angle", "Great veins", mm(34, 1364, 135));
  return s;
}
