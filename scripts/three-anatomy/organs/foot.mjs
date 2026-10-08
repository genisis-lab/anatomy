import { Specimen } from "../kit/bake.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { clipMesh, merge, taperedTube } from "../kit/geometry.mjs";
import { fbm3, simplex3 } from "../kit/noise.mjs";
import { bodyFrame, ensureScans, refine, scan, scanGroup, SCAN_IDS } from "../kit/scans.mjs";

// The right foot and ankle, medial view: 26 registered BodyParts3D bones,
// the distal tibia and fibula sectioned above the ankle, and the tendons that
// cross the ankle (including the calcaneal tendon). The plantar aponeurosis
// and the medial (deltoid) and lateral ankle ligaments are authored in
// Three.js. The specimen is turned so its medial side, and the arch, face the
// viewer; the toes point left.

const CUT = 1.4;
const PLACE = { rotation: [0, -Math.PI / 2, 0] };
const LEG = { tibia: 24477, fibula: 24480 };
const TENDONS = {
  "Tibialis anterior": [[22544, "right tibialis anterior"]],
  "Extensor tendons": [[22546, "right extensor hallucis longus"], [22548, "right extensor digitorum longus"]],
  "Fibular tendons": [[22552, "right fibularis longus"], [22554, "right fibularis brevis"]],
  "Tibialis posterior": [[65018, "right tibialis posterior"]],
  "Long flexor tendons": [[65016, "right flexor digitorum longus"], [65014, "right flexor hallucis longus"]],
  "Calcaneal tendon": [[258847, "right calcaneal tendon"]],
  "Flexor digitorum brevis": [[37461, "right flexor digitorum brevis"]],
};

export async function build() {
  const foot = SCAN_IDS.skeleton.foot.filter(([, name]) => /right/.test(name));
  if (!foot.some(([id]) => id === 32656)) foot.push([32656, "distal phalanx of right fourth toe"]);
  const tendons = Object.values(TENDONS).flat();
  await ensureScans([...foot, ...tendons].map(([id]) => id).concat(Object.values(LEG)));
  const frame = bodyFrame({ center: [-100, 73, 120], scale: 1 / 55 });
  const s = new Specimen("foot", { occlusion: { resolution: 200, reach: 0.08 } });

  const bone = tissue({ base: "#e4cfa6", dark: "#b28b5a", light: "#f8eedb", capillary: "#b98a5e", seed: 271, scale: 5, capillaryAmount: 0.22, mottleAmount: 0.6, crestAmount: 0.5 });
  const cartilage = tissue({ base: "#e6ecea", dark: "#b9c7c4", light: "#fbfdfc", capillary: "#c3b1b6", seed: 272, scale: 6, capillaryAmount: 0.1, crestAmount: 0.4 });
  const marrow = fbm3(simplex3(273), 3);
  const shading = { ao: 0.9, cavity: 0.7, saturate: 1 };
  // Joint surfaces show as smooth cartilage where neighbouring bones meet.
  const jointed = (articular) => (c) => mix(mix(bone(c), color("#ecebe0"), smoothstep(0.15, 0.6, c.curv) * 0.35), cartilage(c), articular ? articular(c) : 0);
  const bones = (name, pattern, target, articular) => {
    const { geometries } = scanGroup(foot.filter(([, b]) => pattern.test(b)), { target, transform: frame, smooth: 2 });
    s.mesh(name, merge(geometries.map((g) => refine(g, 1, 2))), { place: PLACE, material: "bone", shading, paint: jointed(articular) });
  };
  // The trochlea (dome) of the talus carries the ankle joint's cartilage; its
  // head articulates with the navicular.
  bones("Talus", /talus/, 2400, (c) => Math.min(1, smoothstep(-0.32, -0.12, c.y) * smoothstep(0.35, 0.7, c.ny) + smoothstep(-0.75, -0.6, c.z) * smoothstep(0.4, 0.75, c.nz) * smoothstep(-0.2, -0.4, c.y)) * 0.85);
  bones("Calcaneus", /calcaneus/, 2400);
  bones("Midfoot bones", /navicular|cuneiform|cuboid/, 1000);
  bones("Metatarsals", /metatarsal/, 1000);
  bones("Phalanges", /phalanx/, 500);

  // Distal tibia and fibula, cut above the ankle to show compact bone and marrow.
  const section = (geometry, articular) => (c) => {
    if (c.cap) {
      if (geometry.userData.rim[c.index] < 0.06) return mix(color("#f3ead6"), color("#e2d2b2"), marrow(c.x * 30, c.y * 30, c.z * 30) * 0.5 + 0.5);
      return mix(color("#e0b061"), color("#c9853f"), marrow(c.x * 12, c.y * 12, c.z * 12) * 0.5 + 0.5);
    }
    return mix(bone(c), cartilage(c), articular(c));
  };
  const leg = (id, target) => {
    const g = refine(scan(id, { target, smooth: 2 }), 1, 2);
    g.applyMatrix4(frame);
    g.computeVertexNormals();
    return clipMesh(g, [0, 1, 0], CUT);
  };
  const tibia = leg(LEG.tibia, 16000);
  const fibula = leg(LEG.fibula, 6000);
  s.mesh("Distal tibia", tibia, { place: PLACE, material: "bone", shading, paint: section(tibia, (c) => smoothstep(-0.05, -0.16, c.y) * smoothstep(-0.4, -0.75, c.ny) * 0.9) });
  s.mesh("Distal fibula", fibula, { place: PLACE, material: "bone", shading, paint: section(fibula, (c) => smoothstep(-0.2, -0.4, c.y) * smoothstep(0.3, 0.7, c.nx) * 0.8) });

  // Tendons crossing the ankle: muscle bellies above, glistening tendon below.
  const fibres = simplex3(274);
  const tendon = (c) => mix(color("#f0e8d8"), color("#cdbfa5"), (0.5 + 0.5 * fibres(c.x * 30, c.y * 4, c.z * 30)) * 0.4);
  const muscle = (c) => mix(color("#b9443d"), color("#86282b"), (0.5 + 0.5 * Math.sin(c.y * 80 + fibres(c.x * 3, c.y * 3, c.z * 3) * 2)) * 0.5);
  const muscleCut = (c) => mix(color("#a8403e"), color("#c4625a"), 0.5 + 0.5 * fibres(c.x * 60, 0, c.z * 60));
  for (const [name, entries] of Object.entries(TENDONS)) {
    const { geometries } = scanGroup(entries, { target: name === "Calcaneal tendon" ? 5000 : 14000, transform: frame, smooth: 2 });
    const geometry = merge(geometries.map((g) => clipMesh(refine(g, 1, 2), [0, 1, 0], CUT)));
    // The short flexor is a muscle of the sole: belly behind, tendons toward the toes.
    const belly = name === "Calcaneal tendon" ? () => 0 : name === "Flexor digitorum brevis" ? (c) => smoothstep(0.3, -0.2, c.z) : (c) => smoothstep(0.45, 0.9, c.y);
    s.mesh(name, geometry, {
      place: PLACE,
      material: "muscle",
      shading: { ao: 0.75, cavity: 0.35 },
      simplify: { ratio: 0.55, error: 0.0006 },
      paint: (c) => {
        const m = belly(c);
        if (c.cap) return mix(mix(color("#efe3cc"), color("#d9c7a6"), fibres(c.x * 50, 0, c.z * 50) * 0.5 + 0.5), muscleCut(c), m);
        return mix(tendon(c), muscle(c), m);
      },
    });
  }

  // Plantar aponeurosis: from the medial calcaneal tubercle, a tie-beam under
  // the arch that splits into five slips toward the toes.
  const band = (hex) => {
    const base = color(hex);
    return (c) => mix(base, color("#cbbb9c"), (0.5 + 0.5 * fibres(c.x * 8, c.y * 8, c.z * 40)) * 0.4);
  };
  const split = [0.1, -1.44, -0.2];
  const heads = [[0.44, -1.37, 1.02], [0.2, -1.39, 0.96], [-0.04, -1.41, 0.87], [-0.27, -1.43, 0.74], [-0.5, -1.44, 0.6]];
  const aponeurosis = merge([
    taperedTube([[0.5, -1.39, -1.66], [0.38, -1.44, -1.3], [0.22, -1.46, -0.75], split], (t) => 0.1 + 0.08 * t, { radial: 24, up: [0, 1, 0], flatten: 0.2 }),
    ...heads.map((h) => taperedTube([split, [(split[0] + h[0]) / 2, -1.45, (split[2] + h[2]) / 2], h], (t) => 0.05 - 0.015 * t, { radial: 12, up: [0, 1, 0], flatten: 0.45 })),
  ]);
  s.mesh("Plantar aponeurosis", aponeurosis, { place: PLACE, material: "cartilage", paint: band("#f1e8d6"), shading: { cavity: 0.3 } });

  // Ankle ligaments: the fan-shaped deltoid on the medial side; the anterior
  // talofibular and calcaneofibular ligaments laterally.
  const fan = (from, to, width) => taperedTube([from, [(from[0] + to[0]) / 2 + 0.03, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], to], (t) => width * (0.6 + 0.7 * t), { radial: 14, up: [1, 0, 0], flatten: 0.22 });
  const malleolus = [0.8, -0.24, -0.95];
  s.mesh("Deltoid ligament", merge([
    fan(malleolus, [0.86, -0.52, -0.52], 0.055), // tibionavicular
    fan(malleolus, [0.79, -0.6, -0.68], 0.06), // anterior tibiotalar
    fan(malleolus, [0.78, -0.74, -1.12], 0.065), // tibiocalcaneal, to the sustentaculum tali
    fan(malleolus, [0.6, -0.6, -1.4], 0.06), // posterior tibiotalar
  ]), { place: PLACE, material: "cartilage", paint: band("#efe4d0"), shading: { cavity: 0.3 } });
  const lateral = (from, to, width) => taperedTube([from, [(from[0] + to[0]) / 2 - 0.03, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], to], width, { radial: 14, up: [1, 0, 0], flatten: 0.35 });
  s.mesh("Lateral ankle ligaments", merge([
    lateral([-0.13, -0.45, -1.15], [0.0, -0.42, -0.8], 0.045), // anterior talofibular
    lateral([-0.15, -0.62, -1.3], [-0.08, -0.95, -1.45], 0.035), // calcaneofibular
  ]), { place: PLACE, material: "cartilage", paint: band("#efe4d0"), shading: { cavity: 0.3 } });

  s.anchor("talus", "Talus", [0.62, -0.1, -1.0]);
  s.anchor("calcaneus", "Calcaneus", [0.5, -1.0, -1.7]);
  s.anchor("navicular", "Midfoot bones", [0.82, -0.55, -0.55]);
  s.anchor("metatarsals", "Metatarsals", [0.42, -0.9, 0.35]);
  s.anchor("hallux", "Phalanges", [0.4, -1.2, 1.45]);
  s.anchor("medial-malleolus", "Distal tibia", [0.78, -0.1, -0.95]);
  s.anchor("lateral-malleolus", "Distal fibula", [-0.14, -0.5, -1.3]);
  s.anchor("calcaneal-tendon", "Calcaneal tendon", [0.3, 0.2, -1.9]);
  s.anchor("plantar-aponeurosis", "Plantar aponeurosis", [0.3, -1.5, -0.6]);
  s.anchor("deltoid-ligament", "Deltoid ligament", [0.85, -0.5, -0.85]);
  s.anchor("lateral-ligaments", "Lateral ankle ligaments", [-0.1, -0.45, -0.95]);
  s.anchor("tibialis-anterior", "Tibialis anterior", [0.6, -0.2, -0.4]);
  s.anchor("flexor-tendons", "Long flexor tendons", [0.7, -0.45, -1.3]);
  s.anchor("flexor-digitorum-brevis", "Flexor digitorum brevis", [0.1, -1.3, -0.6]);
  return s;
}
