import { Specimen } from "../kit/bake.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { clipMesh, merge, taperedTube } from "../kit/geometry.mjs";
import { simplex3, fbm3 } from "../kit/noise.mjs";
import { bodyFrame, ensureScans, refine, scan, scanGroup, SCAN_IDS } from "../kit/scans.mjs";

// The right hand in anatomical position, palmar view: 27 registered
// BodyParts3D bones with the distal radius and ulna sectioned, plus the
// flexor retinaculum roofing the carpal tunnel and the median nerve within it.
// The thumb is toward −x.

const FOREARM_CUT = 2.0;

export async function build() {
  const right = SCAN_IDS.skeleton.hand.filter(([, name]) => /right/.test(name));
  const forearm = SCAN_IDS.skeleton.arm.filter(([, name]) => /right (radius|ulna)/.test(name));
  await ensureScans([...right, ...forearm].map(([id]) => id));
  const frame = bodyFrame({ center: [-268, 760, 140], scale: 1 / 60 });
  const s = new Specimen("hand", { occlusion: { resolution: 200, reach: 0.07 } });

  const bone = tissue({ base: "#e4cfa6", dark: "#b28b5a", light: "#f8eedb", capillary: "#b98a5e", seed: 241, scale: 6, capillaryAmount: 0.22, mottleAmount: 0.6, crestAmount: 0.5 });
  const cartilage = color("#ecebe0");
  const shading = { ao: 0.9, cavity: 0.7, saturate: 1 };
  const group = (name, pattern, target, tint) => {
    const { geometries } = scanGroup(right.filter(([, bone]) => pattern.test(bone)), { target, transform: frame, smooth: 2 });
    const refined = geometries.map((g) => {
      const r = refine(g, 1, 2);
      r.userData.axial = new Float32Array(r.attributes.position.count);
      return r;
    });
    const geometry = merge(refined);
    s.mesh(name, geometry, {
      material: "bone",
      shading,
      paint: (c) => {
        let tone = bone(c);
        if (tint) tone = mix(tone, color(tint), 0.18);
        // Articular surfaces read as smooth, pale cartilage in crevices between bones.
        return mix(tone, cartilage, smoothstep(0.15, 0.6, c.curv) * 0.35);
      },
    });
  };
  group("Scaphoid", /scaphoid/, 900, "#f0c98f");
  group("Carpal bones", /lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate/, 700);
  group("Metacarpals", /metacarpal/, 900);
  group("Phalanges", /phalanx/, 500);

  const marrow = fbm3(simplex3(242), 3);
  for (const [id, name] of forearm) {
    const shaft = clipMesh(refine((() => { const g = scan(id, { target: 9000, smooth: 2 }); g.applyMatrix4(frame); return g; })(), 1, 2), [0, 1, 0], FOREARM_CUT);
    s.mesh(name.includes("radius") ? "Distal radius" : "Distal ulna", shaft, {
      material: "bone",
      shading,
      paint: (c) => {
        if (c.cap) return shaft.userData.rim[c.index] < 0.06 ? color("#f1e6cf") : mix(color("#e3b56a"), color("#c78a45"), marrow(c.x * 14, c.y * 14, c.z * 14) * 0.5 + 0.5);
        return bone(c);
      },
    });
  }

  // Flexor retinaculum: from scaphoid tubercle and trapezium to pisiform and hook of hamate.
  const fibres = simplex3(243);
  s.mesh("Flexor retinaculum", taperedTube([[-0.16, 0.74, -0.1], [0.02, 0.76, 0.1], [0.24, 0.76, 0.14], [0.52, 0.78, -0.06]], 0.16, { radial: 24, up: [0, 0, 1], flatten: 0.2 }), {
    material: "cartilage",
    paint: (c) => mix(color("#efe6d4"), color("#d6c6ab"), (0.5 + 0.5 * fibres(c.x * 4, c.y * 40, c.z * 4)) * 0.45),
    shading: { cavity: 0.3 },
  });
  const nerve = (c) => mix(color("#eed06d"), color("#c89a3c"), smoothstep(0.0, 0.8, c.curv + 0.3) * 0.5);
  const trunk = [[0.1, FOREARM_CUT - 0.02, -0.18], [0.14, 1.3, -0.14], [0.17, 0.76, -0.04], [0.16, 0.42, 0.06]];
  const branches = [
    [[0.16, 0.42, 0.06], [-0.12, 0.2, 0.14], [-0.38, 0.05, 0.22], [-0.56, -0.3, 0.3]],
    [[0.16, 0.42, 0.06], [0.0, 0.0, 0.16], [-0.16, -0.45, 0.22], [-0.24, -1.0, 0.4]],
    [[0.16, 0.42, 0.06], [0.12, -0.05, 0.16], [0.06, -0.55, 0.22], [0.03, -1.1, 0.42]],
    [[0.16, 0.42, 0.06], [0.24, -0.02, 0.15], [0.26, -0.48, 0.2], [0.28, -0.95, 0.36]],
  ];
  s.mesh("Median nerve", merge([taperedTube(trunk, 0.06, { radial: 14 }), ...branches.map((b) => taperedTube(b, (t) => 0.03 - 0.015 * t, { radial: 10 }))]), { material: "nerve", paint: nerve });

  s.anchor("scaphoid", "Scaphoid", [-0.1, 0.9, -0.3]);
  s.anchor("carpals", "Carpal bones", [0.35, 0.68, -0.2]);
  s.anchor("metacarpals", "Metacarpals", [0.1, 0.0, 0.0]);
  s.anchor("phalanges", "Phalanges", [0.0, -1.3, 0.6]);
  s.anchor("thumb", "Metacarpals", [-0.42, 0.45, 0.0]);
  s.anchor("radius", "Distal radius", [-0.2, 1.4, 0.0]);
  s.anchor("ulna", "Distal ulna", [0.6, 1.4, -0.3]);
  s.anchor("flexor-retinaculum", "Flexor retinaculum", [0.18, 0.76, 0.18]);
  s.anchor("median-nerve", "Median nerve", [0.14, 1.3, -0.08]);
  return s;
}
