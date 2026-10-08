import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { box, capsule, curveTube, displace, ellipsoid, intersect, offset, plane, roundCone, sampleCurve, smoothSubtract, smoothUnion, sphere, stretch, subtract, transform, tube, union } from "../kit/sdf.mjs";
import { fbm3, simplex3, worley3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { merge, taperedTube } from "../kit/geometry.mjs";

// A coronal section through the right temporal bone seen from the front:
// lateral (outer ear) is −x, medial (toward the brainstem) is +x. The
// section face of the bone is the plane z = 0; delicate structures sit in
// carved cavities and stand proud of it. Middle and inner ear structures are
// enlarged relative to the auricle so they can be read.

const SECTION = 0.0;
const CANAL = sampleCurve([[-1.08, 0.04, -0.02], [-0.8, 0.1, -0.04], [-0.5, 0.06, -0.05], [-0.22, 0.0, -0.05], [-0.02, -0.02, -0.05]], 50);
const TM_CENTER = new THREE.Vector3(0.0, -0.02, -0.05);

function helixPoints({ base, axis, turns = 2.75, r0 = 0.24, r1 = 0.05, height = 0.24, samples = 160 }) {
  const a = new THREE.Vector3(...axis).normalize();
  const u = new THREE.Vector3(0, 1, 0).cross(a).normalize();
  const v = a.clone().cross(u);
  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const angle = t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    const p = new THREE.Vector3(...base)
      .addScaledVector(u, Math.cos(angle) * r)
      .addScaledVector(v, Math.sin(angle) * r)
      .addScaledVector(a, height * Math.pow(t, 0.9));
    points.push(p.toArray());
  }
  return points;
}

/** Points on a circle of `radius` around `center` in the plane spanned by e1, e2. */
function loop(center, e1, e2, radius, from, to, samples = 40) {
  const c = new THREE.Vector3(...center), a = new THREE.Vector3(...e1).normalize(), b = new THREE.Vector3(...e2).normalize();
  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = from + (to - from) * (i / samples);
    points.push(c.clone().addScaledVector(a, Math.cos(t) * radius).addScaledVector(b, Math.sin(t) * radius).toArray());
  }
  return points;
}

export function build() {
  const noise = simplex3(131);
  const lumpy = fbm3(noise, 3);
  const trabeculae = worley3(132);
  const airCells = worley3(133);

  // ------------------------------------------------------------ inner ear
  const vestibuleCenter = [0.62, 0.06, -0.06];
  const vestibule = ellipsoid(vestibuleCenter, [0.13, 0.11, 0.1]);
  const cochleaPoints = helixPoints({ base: [0.78, -0.18, -0.12], axis: [0.35, -0.45, 0.82], turns: 2.75, r0: 0.25, r1: 0.05, height: 0.26 });
  const cochleaTube = tube(cochleaPoints, cochleaPoints.map((_, i) => 0.075 - 0.045 * (i / (cochleaPoints.length - 1))));
  const cochlea = smoothUnion(0.05, cochleaTube, roundCone(vestibuleCenter, cochleaPoints[0], 0.07, 0.07));
  // Three mutually perpendicular canals, each with an ampulla near the vestibule.
  const canalRadius = 0.032;
  const anterior = loop([0.66, 0.4, -0.02], [1, 0, 0.2], [0, 1, 0], 0.22, -1.2, Math.PI + 0.9, 48);
  const posterior = loop([0.74, 0.32, -0.24], [0, 0, 1], [0, 1, 0], 0.21, -1.0, Math.PI + 1.1, 48);
  const lateral = loop([0.46, 0.2, -0.14], [1, 0, 0], [0, 0, 1], 0.18, 0.6, Math.PI * 2 - 0.4, 48);
  const canals = smoothUnion(0.03,
    tube(anterior, canalRadius), tube(posterior, canalRadius), tube(lateral, canalRadius),
    sphere(anterior[0], 0.058), sphere(posterior[0], 0.056), sphere(lateral[lateral.length - 1], 0.056),
  );
  const labyrinth = smoothUnion(0.06, vestibule, canals);

  // ------------------------------------------------------------ middle ear
  const malleus = smoothUnion(0.03,
    sphere([0.1, 0.34, -0.03], 0.065),
    roundCone([0.1, 0.34, -0.03], [0.07, 0.22, -0.04], 0.045, 0.03),
    roundCone([0.07, 0.22, -0.04], [0.03, -0.0, -0.05], 0.028, 0.016),
    roundCone([0.07, 0.18, -0.04], [0.0, 0.18, -0.03], 0.02, 0.012),
  );
  const incus = smoothUnion(0.03,
    ellipsoid([0.2, 0.34, -0.06], [0.07, 0.065, 0.06]),
    roundCone([0.2, 0.36, -0.06], [0.3, 0.42, -0.12], 0.04, 0.02),
    roundCone([0.22, 0.3, -0.06], [0.26, 0.08, -0.05], 0.03, 0.018),
    sphere([0.29, 0.07, -0.05], 0.022),
  );
  const stapesCrura = [-1, 1].map((side) => curveTube([[0.31, 0.06, -0.05], [0.36, 0.06 + side * 0.055, -0.05 + side * 0.01], [0.44, 0.06 + side * 0.06, -0.05]], 0.012, 20));
  const stapes = smoothUnion(0.012,
    sphere([0.31, 0.06, -0.05], 0.026),
    ...stapesCrura,
    stretch(ellipsoid([0.455, 0.06, -0.05], [0.07, 0.085, 0.05]), [0.22, 1, 1], [0.455, 0.06, -0.05]),
  );
  // Tympanic membrane: a shallow cone, drawn medially at the umbo.
  const tmNormal = new THREE.Vector3(-0.82, 0.3, 0.48).normalize();
  const tympanic = {
    d: (x, y, z) => {
      const p = new THREE.Vector3(x, y, z).sub(TM_CENTER);
      const h = p.dot(tmNormal);
      const r = Math.sqrt(Math.max(0, p.lengthSq() - h * h));
      const cone = h + 0.045 * (1 - Math.min(1, r / 0.17));
      return Math.max(Math.abs(cone) - 0.009, r - 0.17);
    },
    b: [-0.2, -0.22, -0.25, 0.2, 0.18, 0.15],
  };

  // ------------------------------------------------------------ outer ear
  const pinnaLocal = (() => {
    const plate = stretch(smoothUnion(0.18, ellipsoid([0.1, 0.2, 0], [0.42, 0.66, 0.2]), ellipsoid([0.1, -0.42, 0], [0.22, 0.24, 0.2])), [1, 1, 0.22]);
    const helix = curveTube([[-0.08, 0.02, 0.02], [-0.22, 0.36, 0.05], [-0.1, 0.78, 0.05], [0.22, 0.86, 0.05], [0.48, 0.55, 0.05], [0.5, 0.1, 0.05], [0.36, -0.3, 0.05], [0.18, -0.48, 0.04]], (t) => 0.065 - 0.02 * t, 60);
    const antihelix = smoothUnion(0.03,
      curveTube([[0.06, -0.3, 0.05], [0.26, -0.05, 0.06], [0.28, 0.3, 0.06], [0.16, 0.58, 0.05]], 0.042, 40),
      curveTube([[0.27, 0.28, 0.06], [0.08, 0.42, 0.05], [-0.06, 0.4, 0.04]], 0.034, 24),
    );
    const tragus = ellipsoid([-0.22, -0.08, 0.06], [0.08, 0.1, 0.07]);
    const antitragus = ellipsoid([0.2, -0.32, 0.06], [0.08, 0.06, 0.06]);
    const lobule = ellipsoid([0.12, -0.56, 0.01], [0.18, 0.16, 0.075]);
    const raw = smoothUnion(0.05, plate, helix, antihelix, tragus, antitragus, lobule);
    const concha = ellipsoid([0.02, -0.02, 0.14], [0.2, 0.25, 0.16]);
    return smoothSubtract(0.06, raw, concha);
  })();
  const pinna = displace(transform(pinnaLocal, { position: [-1.02, 0.06, 0.06], rotation: [0, -0.62, 0], scale: 1.05 }), (x, y, z) => lumpy(x * 4, y * 4, z * 4), 0.01);

  const canalLumen = tube(CANAL, CANAL.map((_, i) => 0.11 - 0.025 * (i / (CANAL.length - 1))));
  const canalWall = intersect(subtract(offset(canalLumen, 0.035), canalLumen, offset(tympanic, 0.004)), plane([0, 0, 1], SECTION), box([-0.55, 0.05, -0.05], [0.56, 0.3, 0.3]));

  // ------------------------------------------------------------ temporal bone
  const cavity = union(
    offset(canalLumen, 0.032),
    ellipsoid([0.2, 0.18, -0.08], [0.24, 0.32, 0.2]), // tympanic cavity and attic
    offset(labyrinth, 0.035), offset(cochlea, 0.035),
    capsule([0.66, 0.0, -0.08], [1.7, 0.0, -0.1], 0.1), // internal acoustic meatus
    capsule([0.28, -0.12, -0.08], [1.0, -0.9, -0.08], 0.075), // bony auditory tube
  );
  const slab = displace(box([0.42, -0.02, -0.22], [1.22, 1.05, 0.34], 0.06), (x, y, z) => lumpy(x * 2, y * 2, z * 2), 0.03);
  const temporal = intersect(subtract(slab, cavity), plane([0, 0, 1], SECTION));

  const s = new Specimen("ear", { cell: 0.012 });
  const boneSurface = tissue({ base: "#eadcc3", dark: "#c8b18e", light: "#fbf3e3", seed: 134, scale: 4, crestAmount: 0.4 });
  s.field("Temporal bone", temporal, {
    material: "bone",
    caps: [{ normal: new THREE.Vector3(0, 0, 1), offset: SECTION }],
    simplify: { ratio: 0.4, error: 0.0012 },
    paint: (c) => {
      // Lining of the canal and middle ear: thin pink mucoperiosteum and skin.
      if (!c.cap && cavity.d(c.x, c.y, c.z) > -0.02) {
        if (c.x < -0.02) return mix(color("#e6b19d"), color("#d39484"), lumpy(c.x * 8, c.y * 8, c.z * 8) * 0.5 + 0.5);
        return mix(color("#e9b7a8"), color("#c98d86"), lumpy(c.x * 8, c.y * 8, c.z * 8) * 0.5 + 0.5);
      }
      if (c.cap) {
        // Dense petrous bone medially; mastoid air cells below and lateral.
        const petrous = smoothstep(0.35, 0.75, c.x);
        const t = trabeculae(c.x * 40, c.y * 40, c.z * 40);
        const spongy = mix(color("#efdfc2"), color("#dcc5a0"), (1 - smoothstep(0.0, 0.1, t.f2 - t.f1)) * 0.5);
        let tone = mix(spongy, color("#f5ead6"), petrous * 0.85);
        if (c.y < -0.25 && c.x < 0.3) {
          const air = airCells(c.x * 9, c.y * 9, c.z * 9);
          if (air.f1 < 0.26 && c.y < -0.35) tone = mix(color("#b88f74"), color("#8e6550"), smoothstep(0.26, 0.08, air.f1));
        }
        return tone;
      }
      if (c.x < -0.68) return tissue({ base: "#e8b49c", dark: "#c9897a", light: "#f7d2bf", seed: 135, scale: 5 })(c);
      return boneSurface(c);
    },
  });

  const skin = tissue({ base: "#eeb59c", dark: "#cf8a77", light: "#fad6c4", capillary: "#d27a72", seed: 136, scale: 4, capillaryAmount: 0.25, crestAmount: 0.45 });
  s.field("Auricle", pinna, { cell: 0.01, simplify: { ratio: 0.4, error: 0.0012 }, paint: skin });
  s.field("Ear canal", canalWall, {
    material: "mucosa",
    caps: [{ normal: new THREE.Vector3(0, 0, 1), offset: SECTION }],
    cell: 0.008,
    simplify: { ratio: 0.4, error: 0.001 },
    paint: (c) => (c.cap ? (c.x < -0.68 ? color("#f0e3cf") : color("#e9c6b0")) : mix(skin(c), color("#c9925a"), c.x < -0.65 ? 0.25 : 0)),
  });
  s.field("Tympanic membrane", tympanic, { cell: 0.004, material: "mucosa", paint: (c) => mix(color("#d9d0cc"), color("#f2ece6"), smoothstep(-0.2, 0.6, -c.curv)) });

  const ossicle = tissue({ base: "#efe2c8", dark: "#cdb48e", light: "#fff6e6", seed: 137, scale: 18, crestAmount: 0.5 });
  s.field("Malleus", malleus, { cell: 0.004, material: "bone", paint: ossicle, simplify: { ratio: 0.5, error: 0.0008 } });
  s.field("Incus", incus, { cell: 0.004, material: "bone", paint: ossicle, simplify: { ratio: 0.5, error: 0.0008 } });
  s.field("Stapes", stapes, { cell: 0.0035, material: "bone", paint: ossicle, simplify: { ratio: 0.5, error: 0.0008 } });

  s.field("Cochlea", cochlea, {
    cell: 0.006,
    simplify: { ratio: 0.45, error: 0.001 },
    paint: tissue({ base: "#d6a3c0", dark: "#a8708f", light: "#f0d0e2", capillary: "#b0587c", seed: 138, scale: 9, capillaryAmount: 0.25, crestAmount: 0.5 }),
  });
  s.field("Vestibule and semicircular canals", labyrinth, {
    cell: 0.006,
    simplify: { ratio: 0.45, error: 0.001 },
    paint: tissue({ base: "#eab39a", dark: "#c67f6c", light: "#f9d9c8", capillary: "#c4625e", seed: 139, scale: 9, capillaryAmount: 0.2, crestAmount: 0.5 }),
  });

  // Auditory (Eustachian) tube: bony part in the temporal bone, then
  // cartilaginous toward the nasopharynx.
  const auditory = intersect(subtract(curveTube([[0.3, -0.14, -0.08], [0.62, -0.46, -0.08], [0.9, -0.8, -0.07], [1.08, -1.02, -0.04]], (t) => 0.05 + 0.03 * t, 40),
    curveTube([[0.3, -0.14, -0.08], [0.9, -0.8, -0.07], [1.1, -1.05, -0.04]], (t) => 0.025 + 0.02 * t, 40)), plane([0, 0, 1], SECTION));
  s.field("Auditory tube", auditory, {
    cell: 0.008, material: "mucosa", caps: [{ normal: new THREE.Vector3(0, 0, 1), offset: SECTION }],
    paint: (c) => (c.cap ? color("#e4c3b2") : tissue({ base: "#e09c8e", dark: "#bd6f66", light: "#f4c8b8", seed: 140, scale: 7 })(c)),
  });

  // Vestibulocochlear and facial nerves, with the chorda tympani crossing
  // between the malleus and incus.
  const nervePaint = (c) => mix(color("#ecd06f"), color("#c89a3c"), smoothstep(0.0, 0.8, c.curv + 0.3) * 0.5);
  const nerves = merge([
    taperedTube([[0.74, -0.06, -0.08], [1.1, -0.02, -0.08], [1.66, 0.0, -0.1]], 0.07, { radial: 14 }),
    taperedTube([[0.66, 0.1, -0.06], [0.9, 0.05, -0.06], [1.1, 0.0, -0.08]], 0.04, { radial: 12 }),
    taperedTube([[1.66, 0.14, -0.1], [1.2, 0.16, -0.1], [0.62, 0.3, -0.12], [0.46, 0.4, -0.14], [0.36, 0.34, -0.14], [0.36, -0.2, -0.12], [0.38, -0.95, -0.12]], 0.022, { radial: 10 }),
    taperedTube([[0.38, -0.05, -0.02], [0.2, 0.2, 0.01], [0.04, 0.25, 0.0], [-0.12, 0.3, -0.04]], 0.009, { radial: 8 }),
  ]);
  s.mesh("Cranial nerves VII and VIII", nerves, { material: "nerve", paint: nervePaint, shading: { cavity: 0.2 } });

  s.anchor("auricle", "Auricle", [-1.1, 0.62, 0.3]);
  s.anchor("ear-canal", "Ear canal", [-0.45, -0.06, 0.0]);
  s.anchor("tympanic-membrane", "Tympanic membrane", [0.0, -0.02, 0.05]);
  s.anchor("malleus", "Malleus", [0.1, 0.34, 0.04]);
  s.anchor("incus", "Incus", [0.22, 0.34, 0.0]);
  s.anchor("stapes", "Stapes", [0.37, 0.07, 0.0]);
  s.anchor("vestibule", "Vestibule and semicircular canals", [0.62, 0.06, 0.04]);
  s.anchor("semicircular-canals", "Vestibule and semicircular canals", [0.7, 0.62, 0.0]);
  s.anchor("cochlea", "Cochlea", [0.9, -0.2, 0.08]);
  s.anchor("auditory-tube", "Auditory tube", [0.9, -0.78, 0.04]);
  s.anchor("vestibulocochlear-nerve", "Cranial nerves VII and VIII", [1.3, -0.02, -0.02]);
  return s;
}
