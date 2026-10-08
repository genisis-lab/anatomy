import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { capsule, curveTube, displace, ellipsoid, intersect, plane, project, smoothSubtract, smoothUnion, sphere, torus, transform, union } from "../kit/sdf.mjs";
import { fbm3, mulberry32, simplex3, worley3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { merge, taperedTube } from "../kit/geometry.mjs";

// The tongue seen from above: the dorsum faces the viewer, the apex points
// down (−y) and the root and epiglottis are at the top (+y). Papillae are
// slightly enlarged so their distribution reads. The extrinsic muscles,
// hypoglossal nerve and lingual artery are on the underside.

export function build() {
  const noise = simplex3(281);
  const lumpy = fbm3(noise, 3);
  const velvet = simplex3(282);
  const tonsil = worley3(283);
  const random = mulberry32(284);

  const base = smoothUnion(0.42,
    ellipsoid([0, -0.42, 0.0], [0.76, 1.08, 0.3]),
    ellipsoid([0, 0.62, -0.08], [0.86, 0.86, 0.38]),
  );
  // Surface points on the dorsum, found by projecting down onto the body.
  const onDorsum = (x, y, lift = 0) => {
    const p = project(base, new THREE.Vector3(x, y, 0.8), 0, 12);
    return [p.x, p.y, p.z + lift];
  };

  const median = curveTube([onDorsum(0, -1.3, 0.02), onDorsum(0, -0.4, 0.02), onDorsum(0, 0.38, 0.02)], 0.035, 30);
  const terminal = union(
    capsule(onDorsum(-0.66, 0.26, 0.01), onDorsum(0, 0.58, 0.01), 0.03),
    capsule(onDorsum(0.66, 0.26, 0.01), onDorsum(0, 0.58, 0.01), 0.03),
  );
  const foramen = sphere(onDorsum(0, 0.6, 0.0), 0.045);

  // Circumvallate papillae: a V of large papillae, each in its own moat.
  const vallate = [];
  const moats = [];
  const vallateCenters = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i += 1) {
      if (side > 0 && i === 0) continue;
      const t = i / 4;
      const p = onDorsum(side * (0.06 + 0.5 * t), 0.44 - 0.27 * t, 0);
      vallateCenters.push(p);
      vallate.push(sphere([p[0], p[1], p[2] - 0.035], 0.07));
      moats.push(transform(torus([0, 0, 0], 0.085, 0.022), { position: [p[0], p[1], p[2] - 0.005], rotation: [Math.PI / 2, 0, 0] }));
    }
  }
  // Fungiform papillae: scattered over the anterior two-thirds, denser at the tip and margins.
  const fungiform = [];
  for (let tries = 0; tries < 4000 && fungiform.length < 170; tries += 1) {
    const x = (random() * 2 - 1) * 0.7, y = -1.45 + random() * 1.6;
    const margin = Math.abs(x) / 0.7, tip = smoothstep(-0.4, -1.4, y);
    if (random() > 0.25 + 0.6 * Math.max(margin, tip)) continue;
    const p = onDorsum(x, y, 0);
    if (base.d(p[0], p[1], p[2] - 0.05) > 0) continue;
    if (fungiform.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.07)) continue;
    fungiform.push(p);
  }
  const papillae = union(fungiform.map((p) => sphere([p[0], p[1], p[2] - 0.004], 0.022)));

  // Filiform papillae give the velvety texture; the lingual tonsil makes the
  // posterior third nodular; foliate papillae are folds on the margins.
  const surface = (x, y, z) => {
    const filiform = velvet(x * 60, y * 60, z * 60) * 0.25 * smoothstep(0.45, 0.2, y);
    const t = tonsil(x * 9, y * 9, z * 9);
    const nodules = smoothstep(0.5, 0.75, y) * (t.f1 - 0.35) * 1.2;
    const foliate = smoothstep(0.62, 0.78, Math.abs(x)) * smoothstep(0.0, 0.15, y) * smoothstep(0.5, 0.35, y) * Math.sin(y * 70) * 0.6;
    return lumpy(x * 2.5, y * 2.5, z * 2.5) * 0.4 + filiform + nodules - foliate;
  };
  const dorsum = displace(base, surface, 0.018);
  const tongue = smoothSubtract(0.02, smoothUnion(0.02, smoothSubtract(0.025, dorsum, median, terminal, foramen, ...moats), union(vallate), papillae), ...moats);

  const s = new Specimen("tongue", { cell: 0.01 });
  const fungiformRed = color("#d2445a");
  const mucosa = tissue({ base: "#e09292", dark: "#bc6470", light: "#f3c6c2", capillary: "#b8404f", seed: 285, scale: 4, capillaryAmount: 0.25, crestAmount: 0.35 });
  s.field("Tongue", tongue, {
    simplify: { ratio: 0.36, error: 0.001 },
    paint: (c) => {
      let tone = mucosa(c);
      if (c.nz > 0.1 && c.y < 0.45) {
        // A pale, velvety coat of filiform papillae on the oral part.
        tone = mix(tone, color("#f1d2cc"), (0.5 + 0.5 * velvet(c.x * 60, c.y * 60, c.z * 60)) * 0.45);
      }
      if (c.y > 0.55) tone = mix(tone, color("#c97a7c"), 0.3);
      for (const p of fungiform) if (Math.hypot(c.x - p[0], c.y - p[1]) < 0.028 && c.z > p[2] - 0.03) return fungiformRed;
      for (const p of vallateCenters) if (Math.hypot(c.x - p[0], c.y - p[1]) < 0.075 && c.z > p[2] - 0.06) return mix(color("#e6a3a3"), color("#c46c76"), smoothstep(0.03, 0.075, Math.hypot(c.x - p[0], c.y - p[1])));
      return tone;
    },
  });

  // Epiglottis behind the root, joined by the glossoepiglottic folds.
  const epiglottisLeaf = intersect(
    { d: (x, y, z) => Math.abs(ellipsoid([0, 1.52, -0.6], [0.42, 0.5, 0.62]).d(x, y, z)) - 0.03, b: [-0.5, 1.0, -1.3, 0.5, 2.1, 0.1] },
    plane([0, 0, -1], 0.05), plane([0, -1, 0], -1.12),
  );
  const folds = union(
    capsule(onDorsum(0, 1.15, -0.02), [0, 1.4, -0.02], 0.035),
    capsule(onDorsum(-0.45, 1.05, -0.02), [-0.3, 1.32, -0.06], 0.03),
    capsule(onDorsum(0.45, 1.05, -0.02), [0.3, 1.32, -0.06], 0.03),
  );
  s.field("Epiglottis", smoothUnion(0.04, epiglottisLeaf, folds), {
    cell: 0.009, material: "cartilage", simplify: { ratio: 0.4, error: 0.001 },
    paint: tissue({ base: "#e8b0a6", dark: "#c47f7a", light: "#f8d6cc", capillary: "#c0566a", seed: 286, scale: 6, capillaryAmount: 0.35 }),
  });
  const crypts = worley3(287);
  const tonsils = union([-1, 1].map((side) => ellipsoid([side * 0.98, 0.95, -0.12], [0.13, 0.22, 0.12])));
  s.field("Palatine tonsils", displace(tonsils, (x, y, z) => smoothstep(0.25, 0.05, crypts(x * 16, y * 16, z * 16).f1), 0.02), {
    cell: 0.008,
    paint: (c) => mix(color("#dc8c8a"), color("#9c4c58"), smoothstep(0.25, 0.08, crypts(c.x * 16, c.y * 16, c.z * 16).f1)),
  });
  s.field("Hyoid bone", smoothUnion(0.04,
    curveTube([[-0.3, 1.18, -0.58], [0, 1.12, -0.5], [0.3, 1.18, -0.58]], 0.06, 20),
    ...[-1, 1].map((side) => curveTube([[side * 0.28, 1.18, -0.58], [side * 0.6, 1.36, -0.72], [side * 0.78, 1.55, -0.82]], (t) => 0.045 - 0.015 * t, 20)),
  ), { cell: 0.01, material: "bone", paint: tissue({ base: "#e4cfa6", dark: "#b28b5a", light: "#f8eedb", seed: 288, scale: 6 }) });

  // Extrinsic muscles, cut where they leave the specimen.
  const muscle = (c) => (c.cap ? color("#a8403e") : mix(color("#b9443d"), color("#86282b"), (0.5 + 0.5 * Math.sin((c.x + c.y * 0.3) * 80 + velvet(c.x * 3, c.y * 3, c.z * 3) * 2)) * 0.55));
  const bundles = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k += 1) {
      bundles.push(taperedTube([[side * 0.07, -1.18, -0.62], [side * 0.08, -0.9 + k * 0.38, -0.5], [side * 0.08, -0.85 + k * 0.48, -0.26]], (t) => 0.06 - 0.015 * t, { radial: 12, up: [1, 0, 0], flatten: 0.5 })); // genioglossus fan
    }
    bundles.push(taperedTube([[side * 0.42, 1.12, -0.6], [side * 0.6, 0.7, -0.4], [side * 0.66, 0.3, -0.22]], 0.1, { radial: 14, up: [1, 0, 0], flatten: 0.4 })); // hyoglossus
    bundles.push(taperedTube([[side * 1.2, 1.5, -0.5], [side * 0.9, 0.6, -0.28], [side * 0.72, -0.2, -0.12]], (t) => 0.06 - 0.02 * t, { radial: 12 })); // styloglossus
  }
  s.mesh("Extrinsic muscles", merge(bundles), { material: "muscle", paint: muscle, shading: { cavity: 0.3 } });
  const nervePaint = (c) => mix(color("#eed06d"), color("#c89a3c"), smoothstep(0.0, 0.8, c.curv + 0.3) * 0.5);
  s.mesh("Hypoglossal nerves", merge([-1, 1].map((side) => taperedTube([[side * 1.1, 1.6, -0.75], [side * 0.82, 0.9, -0.62], [side * 0.62, 0.2, -0.42], [side * 0.4, -0.6, -0.3]], 0.032, { radial: 12 }))), { material: "nerve", paint: nervePaint });
  s.mesh("Lingual arteries", merge([-1, 1].map((side) => taperedTube([[side * 1.05, 1.3, -0.82], [side * 0.55, 1.0, -0.66], [side * 0.36, 0.2, -0.38], [side * 0.22, -1.0, -0.26]], (t) => 0.035 - 0.012 * t, { radial: 12 }))), { material: "vessel", paint: (c) => mix(color("#b8323a"), color("#e5675b"), smoothstep(0.1, 0.9, c.nz) * 0.5) });

  s.anchor("apex", "Tongue", onDorsum(0, -1.4, 0));
  s.anchor("median-sulcus", "Tongue", onDorsum(0, -0.6, 0));
  s.anchor("fungiform", "Tongue", fungiform[0]);
  s.anchor("filiform", "Tongue", onDorsum(0.3, -0.2, 0));
  s.anchor("circumvallate", "Tongue", vallateCenters[2]);
  s.anchor("terminal-sulcus", "Tongue", onDorsum(-0.35, 0.44, 0));
  s.anchor("foliate", "Tongue", onDorsum(0.78, 0.25, -0.1));
  s.anchor("lingual-tonsil", "Tongue", onDorsum(0.25, 0.85, 0));
  s.anchor("epiglottis", "Epiglottis", [0, 1.85, -0.05]);
  s.anchor("genioglossus", "Extrinsic muscles", [0.08, -0.6, -0.55]);
  return s;
}
