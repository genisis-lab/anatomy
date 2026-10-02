import { Specimen } from "../kit/bake.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { clipMesh, ellipsoidGeometry, merge, taperedTube } from "../kit/geometry.mjs";
import { fbm3, simplex3, worley3 } from "../kit/noise.mjs";
import { bodyFrame, ensureScans, refine, scan } from "../kit/scans.mjs";

// The lumbar spine (L2 to the upper sacrum) in median sagittal section:
// registered BodyParts3D vertebrae and discs halved at the midline, with the
// dural sac and cauda equina in the canal and the spinal ligaments added in
// Three.js. The specimen is turned so the cut face looks at the viewer;
// anterior is to the viewer's left. Turn it to see the intact right side and
// its exiting nerve roots.

const VERTEBRAE = [[13073, "L2"], [13074, "L3"], [13075, "L4"], [13076, "L5"]];
const DISCS = [[16034, "L2–L3"], [16035, "L3–L4"], [16036, "L4–L5"], [16037, "L5–S1"]];
const SACRUM = 16202;
const SAGITTAL = 0.02;
const PLACE = { rotation: [0, -Math.PI / 2, 0] };

/** Splits a section's cap vertices into the vertebral body (front) and the
 *  posterior arch (back) by the widest gap in z, the vertebral canal. */
function profile(geometry) {
  const p = geometry.attributes.position.array;
  const cap = geometry.userData.cap;
  const points = [];
  for (let v = 0; v < cap.length; v += 1) if (cap[v]) points.push([p[v * 3 + 1], p[v * 3 + 2]]);
  points.sort((a, b) => b[1] - a[1]);
  let gap = 0, split = 1;
  for (let i = 1; i < points.length; i += 1) if (points[i - 1][1] - points[i][1] > gap) { gap = points[i - 1][1] - points[i][1]; split = i; }
  const range = (list) => list.reduce((r, [y, z]) => ({ y0: Math.min(r.y0, y), y1: Math.max(r.y1, y), z0: Math.min(r.z0, z), z1: Math.max(r.z1, z) }), { y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity });
  return { body: range(points.slice(0, split)), arch: range(points.slice(split)) };
}

export async function build() {
  await ensureScans([...VERTEBRAE, ...DISCS].map(([id]) => id).concat(SACRUM));
  const frame = bodyFrame({ center: [0, 965, 72], scale: 1 / 45 });
  const load = (id, target, levels = 1) => {
    const g = refine(scan(id, { target, smooth: 2 }), levels, 2);
    g.applyMatrix4(frame);
    g.computeVertexNormals();
    return clipMesh(g, [1, 0, 0], SAGITTAL);
  };
  const s = new Specimen("lumbar-spine", { occlusion: { resolution: 200, reach: 0.07 } });
  const trabecular = worley3(251);
  const marrow = fbm3(simplex3(252), 3);
  const bone = tissue({ base: "#e4cfa6", dark: "#b28b5a", light: "#f8eedb", capillary: "#b98a5e", seed: 253, scale: 5, capillaryAmount: 0.22, mottleAmount: 0.6, crestAmount: 0.5 });
  const shading = { ao: 0.9, cavity: 0.7, saturate: 1 };

  const vertebrae = VERTEBRAE.map(([id]) => load(id, 9000));
  const sacrum = (() => {
    const g = load(SACRUM, 14000);
    return clipMesh(g, [0, -1, 0], 1.95);
  })();
  const profiles = vertebrae.map(profile);
  const boneSection = (geometry) => (c) => {
    if (!c.cap) return bone(c);
    if (geometry.userData.rim[c.index] < 0.05) return mix(color("#f2e8d2"), color("#e3d1b0"), marrow(c.x * 30, c.y * 30, c.z * 30) * 0.5 + 0.5);
    // Cancellous bone: pale trabeculae around red marrow spaces.
    const t = trabecular(c.x * 26, c.y * 26, c.z * 26);
    const strut = 1 - smoothstep(0.0, 0.07, t.f2 - t.f1);
    return mix(mix(color("#cf8d74"), color("#b8644f"), marrow(c.x * 10, c.y * 10, c.z * 10) * 0.5 + 0.5), color("#f0e2c6"), strut * 0.85);
  };
  const columnGeometry = merge([...vertebrae, sacrum]);
  s.mesh("Lumbar vertebrae", columnGeometry, { place: PLACE, material: "bone", paint: boneSection(columnGeometry), shading });

  // Discs: concentric lamellae of the annulus fibrosus around the nucleus pulposus.
  const discs = DISCS.map(([id]) => {
    const g = load(id, 3000);
    const rim = g.userData.rim;
    let max = 0;
    for (let v = 0; v < rim.length; v += 1) if (g.userData.cap[v]) max = Math.max(max, rim[v]);
    g.userData.depth = Float32Array.from(rim, (r) => r / Math.max(max, 1e-6));
    return g;
  });
  const discGeometry = merge(discs);
  const jelly = fbm3(simplex3(254), 3);
  s.mesh("Intervertebral discs", discGeometry, {
    place: PLACE,
    material: "cartilage",
    paint: (c) => {
      if (!c.cap) return tissue({ base: "#dfe2d6", dark: "#b6bba8", light: "#f5f6ef", seed: 255, scale: 8 })(c);
      const depth = discGeometry.userData.depth[c.index];
      if (depth > 0.5) return mix(color("#e9eee6"), color("#cdd8d4"), jelly(c.x * 12, c.y * 12, c.z * 12) * 0.5 + 0.5);
      const lamella = 0.5 + 0.5 * Math.sin(depth * 70);
      return mix(color("#e8e3cf"), color("#c9c0a3"), lamella * 0.6);
    },
    shading: { ao: 0.8, cavity: 0.5 },
  });

  // Vertebral canal: the dural sac, opened by the section, containing the
  // cauda equina; one root pair leaves at each intervertebral foramen.
  const canal = profiles.map(({ body, arch }) => ({ y: (body.y0 + body.y1) / 2, z: (body.z0 + arch.z1) / 2, half: (body.z0 - arch.z1) / 2 }));
  const canalAt = (y) => {
    const sorted = [...canal].sort((a, b) => b.y - a.y);
    if (y >= sorted[0].y) return sorted[0];
    for (let i = 1; i < sorted.length; i += 1) if (y >= sorted[i].y) {
      const a = sorted[i - 1], b = sorted[i], t = (y - b.y) / (a.y - b.y);
      return { z: b.z + (a.z - b.z) * t, half: b.half + (a.half - b.half) * t };
    }
    return sorted[sorted.length - 1];
  };
  const top = 1.95, bottom = -1.7;
  const sacPath = [];
  for (let i = 0; i <= 24; i += 1) {
    const y = top + (bottom - top) * (i / 24);
    sacPath.push([0, y, canalAt(y).z]);
  }
  const sac = clipMesh(taperedTube(sacPath, (t) => 0.3 - 0.12 * smoothstep(0.7, 1, t), { radial: 36, up: [0, 0, 1], flatten: 0.5, caps: "end" }), [1, 0, 0], SAGITTAL);
  s.mesh("Dural sac", sac, { place: PLACE, material: "cartilage", paint: (c) => (c.cap ? color("#d6c9bf") : tissue({ base: "#e3d9d6", dark: "#bfb0ad", light: "#f6f1ef", capillary: "#c88a8c", seed: 256, scale: 6, capillaryAmount: 0.3 })(c)), shading: { ao: 0.6 } });

  const roots = [];
  const ganglia = [];
  for (let i = 0; i < 14; i += 1) {
    const x = -0.04 - (i % 4) * 0.045;
    const z0 = (i % 3 - 1) * 0.05;
    const points = [];
    for (let k = 0; k <= 12; k += 1) {
      const y = top + (bottom - 0.1 - top) * (k / 12);
      points.push([x - Math.sin(k * 0.6 + i) * 0.012, y, canalAt(y).z + z0 + Math.cos(k * 0.5 + i) * 0.01]);
    }
    roots.push(taperedTube(points, 0.016, { radial: 8 }));
  }
  for (const disc of discs) {
    disc.computeBoundingBox();
    const level = (disc.boundingBox.min.y + disc.boundingBox.max.y) / 2;
    const z = canalAt(level).z - 0.05;
    const exit = [[-0.08, level + 0.32, z], [-0.32, level + 0.2, z - 0.05], [-0.62, level - 0.02, z + 0.08], [-1.05, level - 0.3, z + 0.3]];
    roots.push(taperedTube(exit, (t) => 0.05 - 0.01 * t, { radial: 12 }));
    ganglia.push(ellipsoidGeometry([-0.68, level - 0.05, z + 0.12], [0.11, 0.075, 0.075], { rotation: [0, 0, 0.6] }));
  }
  const nervePaint = (c) => mix(color("#eed06d"), color("#c89a3c"), smoothstep(0.0, 0.8, c.curv + 0.3) * 0.5);
  s.mesh("Cauda equina and nerve roots", merge(roots), { place: PLACE, material: "nerve", paint: nervePaint, shading: { ao: 0.6, cavity: 0.2 } });
  s.mesh("Dorsal root ganglia", merge(ganglia), { place: PLACE, material: "nerve", paint: (c) => mix(color("#e6bb58"), color("#bf8633"), smoothstep(0, 0.6, c.curv + 0.2)) });

  // Ligaments of the column, from the measured midline profile.
  const ribbon = (points, radius, flatten, up = [0, 0, 1]) => clipMesh(taperedTube(points, radius, { radial: 20, up, flatten }), [1, 0, 0], SAGITTAL);
  const frontEdge = profiles.flatMap(({ body }) => [[0, body.y1 - 0.05, body.z1 + 0.03], [0, body.y0 + 0.05, body.z1 + 0.03]]);
  const backEdge = profiles.flatMap(({ body }) => [[0, body.y1 - 0.05, body.z0 - 0.025], [0, body.y0 + 0.05, body.z0 - 0.025]]);
  const anterior = ribbon([[0, top, frontEdge[0][2]], ...frontEdge, [0, bottom + 0.3, frontEdge[frontEdge.length - 1][2] - 0.2]], 0.32, 0.12);
  const posterior = ribbon([[0, top, backEdge[0][2]], ...backEdge, [0, bottom + 0.3, backEdge[backEdge.length - 1][2] - 0.12]], 0.16, 0.2);
  const flavum = [];
  const interspinous = [];
  for (let i = 0; i < profiles.length - 1; i += 1) {
    const upper = profiles[i].arch, lower = profiles[i + 1].arch;
    flavum.push(ribbon([[0, upper.y0 + 0.05, upper.z1 - 0.06], [0, (upper.y0 + lower.y1) / 2, (upper.z1 + lower.z1) / 2 - 0.08], [0, lower.y1 - 0.05, lower.z1 - 0.06]], 0.22, 0.38));
    interspinous.push(ribbon([[0, upper.y0 + 0.08, (upper.z0 + upper.z1) / 2], [0, lower.y1 - 0.08, (lower.z0 + lower.z1) / 2]], 0.2, 0.25, [1, 0, 0]));
  }
  const tips = profiles.map(({ arch }) => [0, arch.y0 + 0.12, arch.z0 - 0.03]);
  const supraspinous = ribbon(tips, 0.1, 0.5);
  const ligament = (hex) => {
    const fibres = simplex3(257);
    const base = color(hex);
    return (c) => mix(base, color("#cdbd9f"), (0.5 + 0.5 * fibres(c.x * 6, c.y * 40, c.z * 6)) * 0.4);
  };
  s.mesh("Longitudinal ligaments", merge([anterior, posterior]), { place: PLACE, material: "cartilage", paint: ligament("#efe6d4"), shading: { cavity: 0.3 } });
  s.mesh("Ligamenta flava", merge(flavum), { place: PLACE, material: "fat", paint: ligament("#e8c25f") });
  s.mesh("Interspinous and supraspinous ligaments", merge([...interspinous, supraspinous]), { place: PLACE, material: "cartilage", paint: ligament("#ece2cf") });

  const l3 = profiles[1];
  s.anchor("vertebral-body", "Lumbar vertebrae", [SAGITTAL, (l3.body.y0 + l3.body.y1) / 2, (l3.body.z0 + l3.body.z1) / 2]);
  s.anchor("spinous-process", "Lumbar vertebrae", [SAGITTAL, l3.arch.y0 + 0.1, l3.arch.z0 + 0.05]);
  s.anchor("annulus", "Intervertebral discs", [SAGITTAL, (discs[2].boundingBox.min.y + discs[2].boundingBox.max.y) / 2, profiles[2].body.z1 - 0.06]);
  s.anchor("nucleus", "Intervertebral discs", [SAGITTAL, (discs[1].boundingBox.min.y + discs[1].boundingBox.max.y) / 2, (profiles[1].body.z0 + profiles[1].body.z1) / 2 - 0.05]);
  s.anchor("cauda-equina", "Cauda equina and nerve roots", [-0.04, 0.0, canalAt(0).z]);
  s.anchor("nerve-root", "Cauda equina and nerve roots", [-0.9, (discs[1].boundingBox.min.y + discs[1].boundingBox.max.y) / 2 - 0.2, canalAt(0).z + 0.2]);
  s.anchor("anterior-ligament", "Longitudinal ligaments", [SAGITTAL, 0.5, frontEdge[2][2]]);
  s.anchor("ligamentum-flavum", "Ligamenta flava", [SAGITTAL, (profiles[1].arch.y0 + profiles[2].arch.y1) / 2, profiles[1].arch.z1 - 0.1]);
  s.anchor("sacrum", "Lumbar vertebrae", [SAGITTAL, -1.6, 0.4]);
  return s;
}
