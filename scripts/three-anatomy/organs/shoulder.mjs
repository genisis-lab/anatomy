import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { clipMesh, merge, taperedTube } from "../kit/geometry.mjs";
import { fbm3, simplex3 } from "../kit/noise.mjs";
import { axialCoordinate, bodyFrame, ensureScans, refine, scan, scanGroup } from "../kit/scans.mjs";

// The right shoulder from the front and side with the deltoid removed:
// registered BodyParts3D scapula, clavicle and humerus with the four rotator
// cuff muscles, biceps and coracobrachialis. The coracoacromial arch, the
// coracoclavicular and acromioclavicular ligaments and the subacromial bursa
// are authored in Three.js. The humerus is cut at mid-arm and the clavicle at
// its middle. Lateral is −x; the specimen is turned to face anterolaterally.

const PLACE = { rotation: [0, 0.6, 0] };
const ARM_CUT = -1.86;
const CLAVICLE_CUT = 1.3;
const BONES = { scapula: 13395, clavicle: 13322, humerus: 23130 };
const MUSCLES = {
  Supraspinatus: { entries: [[32544, "right supraspinatus"]], tendon: (c) => smoothstep(-0.5, -0.85, c.x) },
  Infraspinatus: { entries: [[32547, "right infraspinatus"]], tendon: (c) => smoothstep(-0.8, -1.1, c.x) },
  "Teres minor": { entries: [[32553, "right teres minor"]], tendon: (c) => smoothstep(-0.85, -1.15, c.x) },
  Subscapularis: { entries: [[13414, "right subscapularis"]], tendon: (c) => smoothstep(-0.05, -0.35, c.x) * smoothstep(0.3, 0.6, c.z) },
  "Teres major": { entries: [[32551, "right teres major"]], tendon: (c) => smoothstep(-0.6, -0.95, c.x) },
  "Biceps brachii": { entries: [[37686, "long head of right biceps brachii"], [37684, "short head of right biceps brachii"]], tendon: (c) => smoothstep(-0.7, -0.1, c.y) },
  Coracobrachialis: { entries: [[37665, "right coracobrachialis"]], tendon: (c) => smoothstep(0.75, 1.1, c.y) },
};

export async function build() {
  await ensureScans([...Object.values(BONES), ...Object.values(MUSCLES).flatMap(({ entries }) => entries.map(([id]) => id))]);
  const frame = bodyFrame({ center: [-135, 1273, 45], scale: 1 / 50 });
  const s = new Specimen("shoulder", { occlusion: { resolution: 200, reach: 0.08 } });

  const bone = tissue({ base: "#e4cfa6", dark: "#b28b5a", light: "#f8eedb", capillary: "#b98a5e", seed: 281, scale: 5, capillaryAmount: 0.22, mottleAmount: 0.6, crestAmount: 0.5 });
  const cartilage = tissue({ base: "#e6ecea", dark: "#b9c7c4", light: "#fbfdfc", capillary: "#c3b1b6", seed: 282, scale: 6, capillaryAmount: 0.1, crestAmount: 0.4 });
  const marrow = fbm3(simplex3(283), 3);
  const shading = { ao: 0.9, cavity: 0.7, saturate: 1 };
  const load = (id, target) => {
    const g = refine(scan(id, { target, smooth: 2 }), 1, 2);
    g.applyMatrix4(frame);
    g.computeVertexNormals();
    return g;
  };
  const section = (geometry, articular = () => 0) => (c) => {
    if (c.cap) {
      if (geometry.userData.rim[c.index] < 0.06) return mix(color("#f3ead6"), color("#e2d2b2"), marrow(c.x * 30, c.y * 30, c.z * 30) * 0.5 + 0.5);
      return mix(color("#e0b061"), color("#c9853f"), marrow(c.x * 12, c.y * 12, c.z * 12) * 0.5 + 0.5);
    }
    return mix(mix(bone(c), color("#ecebe0"), smoothstep(0.15, 0.6, c.curv) * 0.3), cartilage(c), articular(c));
  };
  const scapula = load(BONES.scapula, 16000);
  const clavicle = clipMesh(load(BONES.clavicle, 8000), [1, 0, 0], CLAVICLE_CUT);
  const humerus = clipMesh(load(BONES.humerus, 16000), [0, -1, 0], -ARM_CUT);
  // Hyaline cartilage on the humeral head and the glenoid; the head faces
  // medially, upward and back.
  const head = [-0.42, 1.0, 0.42];
  const humeralCartilage = (c) => {
    const d = Math.hypot(c.x - head[0], c.y - head[1], c.z - head[2]);
    return smoothstep(0.62, 0.48, d) * smoothstep(-0.1, 0.35, c.nx * 0.8 + c.ny * 0.45 - c.nz * 0.2) * 0.9;
  };
  s.mesh("Scapula", scapula, { place: PLACE, material: "bone", shading, paint: section(scapula, (c) => smoothstep(0.55, 0.35, Math.hypot(c.x + 0.3, c.y - 0.95, c.z - 0.45)) * smoothstep(0.2, 0.6, -c.nx) * 0.85) });
  s.mesh("Clavicle", clavicle, { place: PLACE, material: "bone", shading, paint: section(clavicle) });
  s.mesh("Humerus", humerus, { place: PLACE, material: "bone", shading, paint: section(humerus, humeralCartilage) });

  // Rotator cuff and arm muscles: red bellies giving way to pale tendons.
  const fibres = simplex3(284);
  const tendon = (c) => mix(color("#f0e8d8"), color("#cdbfa5"), (0.5 + 0.5 * fibres(c.x * 30, c.y * 30, c.z * 30)) * 0.4);
  const muscleCut = (c) => mix(color("#a8403e"), color("#c4625a"), 0.5 + 0.5 * fibres(c.x * 60, 0, c.z * 60));
  const tints = { Supraspinatus: "#b8463e", Infraspinatus: "#ad3d3a", "Teres minor": "#b34a40", Subscapularis: "#a9433f", "Teres major": "#9e3a37", "Biceps brachii": "#b5443d", Coracobrachialis: "#a63f3b" };
  for (const [name, { entries, tendon: isTendon }] of Object.entries(MUSCLES)) {
    const { geometries } = scanGroup(entries, { target: 9000, transform: frame, smooth: 2 });
    const geometry = merge(geometries.map((g) => {
      const clipped = clipMesh(refine(g, 1, 2), [0, -1, 0], -ARM_CUT);
      clipped.userData.around = axialCoordinate(clipped).around;
      return clipped;
    }));
    const belly = color(tints[name]);
    const muscle = (c) => mix(belly, color("#7f2629"), (0.5 + 0.5 * Math.sin(geometry.userData.around[c.index] * 40 + fibres(c.x * 3, c.y * 3, c.z * 3) * 3)) * 0.45);
    s.mesh(name, geometry, {
      place: PLACE,
      material: "muscle",
      shading: { ao: 0.8, cavity: 0.45 },
      simplify: { ratio: 0.5, error: 0.0006 },
      paint: (c) => (c.cap ? muscleCut(c) : mix(muscle(c), tendon(c), isTendon(c))),
    });
  }

  // Ligaments: dense, fibrous bands.
  const ligament = (hex) => {
    const base = color(hex);
    return (c) => mix(base, color("#cbbb9c"), (0.5 + 0.5 * fibres(c.x * 40, c.y * 10, c.z * 40)) * 0.4);
  };
  const p = (x, y, z) => [(x + 135) / 50, (y - 1273) / 50, (z - 45) / 50];
  // Coracoacromial ligament: the roof over the supraspinatus tendon.
  s.mesh("Coracoacromial ligament", taperedTube([p(-136, 1339, 88), p(-150, 1350, 80), p(-163, 1356, 64)], (t) => 0.2 - 0.1 * t, { radial: 20, up: [0, 1, 0], flatten: 0.18 }), { place: PLACE, material: "cartilage", paint: ligament("#efe4d0"), shading: { cavity: 0.3 } });
  s.mesh("Coracoclavicular ligament", merge([
    taperedTube([p(-118, 1331, 70), p(-114, 1338, 70), p(-110, 1346, 69)], (t) => 0.07 - 0.02 * t, { radial: 12 }), // conoid
    taperedTube([p(-128, 1335, 80), p(-130, 1342, 77), p(-132, 1350, 74)], 0.075, { radial: 12, up: [1, 0, 0], flatten: 0.4 }), // trapezoid
  ]), { place: PLACE, material: "cartilage", paint: ligament("#efe4d0"), shading: { cavity: 0.3 } });

  // Subacromial bursa: a thin synovial sac draped over the cuff tendons
  // beside and beneath the acromion (fitted to the humeral head: centre and
  // radius from the scan, cuff surface about 30 mm out).
  const centre = p(-162.9, 1326.1, 72.5);
  // A collapsed sac: thickest at its centre and thinning to nothing at the rim.
  const lateral = new THREE.Vector3(-0.72, 0.68, 0.14).normalize();
  const R = 0.625, spread = 0.5, thickness = 0.05;
  const bursa = {
    d: (x, y, z) => {
      const qx = x - centre[0], qy = y - centre[1], qz = z - centre[2];
      const r = Math.hypot(qx, qy, qz) || 1e-6;
      const angle = Math.acos(Math.min(1, Math.max(-1, (qx * lateral.x + qy * lateral.y + qz * lateral.z) / r)));
      const t = thickness * (0.4 + 0.6 * Math.max(0, 1 - (angle / spread) ** 2));
      return Math.max(Math.abs(r - R) - t / 2, (angle - spread) * R - t / 2);
    },
    b: [centre[0] - R - 0.1, centre[1] - R - 0.1, centre[2] - R - 0.1, centre[0] + R + 0.1, centre[1] + R + 0.1, centre[2] + R + 0.1],
  };
  s.field("Subacromial bursa", bursa, {
    place: PLACE,
    cell: 0.008,
    material: "mucosa",
    paint: (c) => mix(color("#a98fb0"), color("#d8c8d8"), smoothstep(-0.3, 0.9, c.ny) * 0.5),
    shading: { ao: 0.5, cavity: 0.2 },
  });

  s.anchor("clavicle", "Clavicle", p(-110, 1360, 90));
  s.anchor("acromion", "Scapula", p(-165, 1358, 55));
  s.anchor("coracoid", "Scapula", p(-131, 1334, 99));
  s.anchor("scapula", "Scapula", p(-100, 1260, 30));
  s.anchor("humeral-head", "Humerus", p(-185, 1300, 85));
  s.anchor("supraspinatus", "Supraspinatus", p(-120, 1345, 40));
  s.anchor("infraspinatus", "Infraspinatus", p(-130, 1290, 0));
  s.anchor("teres-minor", "Teres minor", p(-160, 1270, 10));
  s.anchor("subscapularis", "Subscapularis", p(-120, 1280, 90));
  s.anchor("biceps", "Biceps brachii", p(-190, 1270, 95));
  s.anchor("coracoacromial-ligament", "Coracoacromial ligament", p(-150, 1350, 82));
  s.anchor("subacromial-bursa", "Subacromial bursa", p(-190, 1345, 78));
  return s;
}
