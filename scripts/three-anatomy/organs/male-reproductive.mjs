import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { curveTube, displace, ellipsoid, intersect, plane, sampleCurve, smoothUnion, subtract, transform, tube, union } from "../kit/sdf.mjs";
import { fbm3, simplex3, worley3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { ellipsoidGeometry, merge, taperedTube } from "../kit/geometry.mjs";

// Anterior view of the internal male reproductive tract. The prostate and
// the patient's right testis (−x) are sectioned in the coronal plane.
const SECTION = { normal: new THREE.Vector3(0, 0, 1), offset: 0.02 };

export function build() {
  const noise = simplex3(171);
  const lumpy = fbm3(noise, 3);
  const glands = worley3(172);
  const lobules = worley3(173);
  const coil = simplex3(174);
  const s = new Specimen("male-reproductive", { cell: 0.011 });

  // ------------------------------------------------------------ bladder base (context)
  const bladder = intersect(displace(smoothUnion(0.2, ellipsoid([0, 1.42, -0.05], [0.62, 0.5, 0.46]), ellipsoid([0, 1.02, -0.02], [0.24, 0.2, 0.22])), (x, y, z) => lumpy(x * 2, y * 2, z * 2), 0.015), plane([0, 1, 0], 1.55));
  s.field("Urinary bladder (base)", bladder, {
    caps: [{ normal: new THREE.Vector3(0, 1, 0), offset: 1.55 }],
    simplify: { ratio: 0.36, error: 0.0012 },
    paint: (c) => (c.cap ? (-bladder.d(c.x, c.y, c.z) > 0.08 ? color("#d8858a") : color("#e9b7a3")) : tissue({ base: "#e2a28d", dark: "#bd6f62", light: "#f5cdb8", capillary: "#b0464a", seed: 175, scale: 2.6, capillaryAmount: 0.3 })(c)),
  });

  // ------------------------------------------------------------ prostate, sectioned
  const urethraPath = [[0, 0.98, 0.0], [0, 0.7, 0.04], [0, 0.42, 0.06], [0, 0.1, 0.06], [0, -0.12, 0.05]];
  const urethralLumen = curveTube(urethraPath, 0.04, 30);
  const prostateBody = displace(ellipsoid([0, 0.58, 0.04], [0.42, 0.32, 0.32]), (x, y, z) => lumpy(x * 3, y * 3, z * 3), 0.02);
  const prostate = subtract(intersect(prostateBody, plane([0, 0, 1], SECTION.offset)), urethralLumen);
  s.field("Prostate", prostate, {
    caps: [SECTION],
    simplify: { ratio: 0.4, error: 0.0012 },
    paint: (c) => {
      if (c.cap) {
        const depth = -prostateBody.d(c.x, c.y, c.z);
        if (depth < 0.012) return color("#f0d0bd");
        const g = glands(c.x * 22, c.y * 22, c.z * 22);
        const lumen = smoothstep(0.18, 0.06, g.f1);
        // Darker peripheral zone posterolaterally, paler transition zone around the urethra.
        const peripheral = smoothstep(0.12, 0.28, Math.hypot(c.x, (c.y - 0.58) * 1.2));
        const base = mix(color("#e7b29c"), color("#cf8a77"), peripheral);
        return mix(base, color("#f6dccb"), lumen * 0.7);
      }
      return tissue({ base: "#d9967f", dark: "#b06a5d", light: "#efbfa8", capillary: "#a9464a", seed: 176, scale: 4, capillaryAmount: 0.35 })(c);
    },
  });
  const urethra = intersect(subtract(curveTube(urethraPath, 0.075, 30), urethralLumen, prostateBody), plane([0, -1, 0], 0.08), plane([0, 1, 0], 1.08));
  s.field("Urethra", urethra, {
    material: "mucosa",
    caps: [{ normal: new THREE.Vector3(0, -1, 0), offset: 0.08 }],
    cell: 0.008,
    paint: (c) => (c.cap ? color("#c9707a") : tissue({ base: "#e7a59a", dark: "#c47878", light: "#f6cfc4", seed: 177, scale: 8 })(c)),
  });
  // Ejaculatory ducts converge on the seminal colliculus inside the prostate.
  const ducts = [-1, 1].map((side) => taperedTube([[side * 0.2, 0.82, -0.18], [side * 0.12, 0.68, -0.06], [side * 0.04, 0.5, 0.02], [side * 0.012, 0.42, 0.04]], 0.02, { radial: 10 }));

  // ------------------------------------------------------------ seminal vesicles
  const vesicles = [-1, 1].map((side) => {
    const axis = sampleCurve([[side * 0.16, 0.86, -0.26], [side * 0.42, 1.0, -0.36], [side * 0.68, 1.12, -0.38], [side * 0.86, 1.08, -0.32]], 50);
    const radii = axis.map((_, i) => 0.1 + 0.035 * Math.sin(i * 0.9) + 0.02 * Math.sin(i * 2.3));
    return displace(tube(axis, radii), (x, y, z) => -Math.abs(coil(x * 9, y * 9, z * 9)), 0.03);
  });
  s.field("Seminal vesicles", smoothUnion(0.03, ...vesicles), {
    simplify: { ratio: 0.4, error: 0.0012 },
    paint: tissue({ base: "#e3b48f", dark: "#bb8160", light: "#f5d6b8", capillary: "#b85c4e", seed: 178, scale: 7, capillaryAmount: 0.25, crestAmount: 0.5 }),
  });

  // ------------------------------------------------------------ testes and epididymides
  const testisCenter = (side) => [side * 0.46, -1.12, 0.02];
  const testisShape = (side) => transform(ellipsoid([0, 0, 0], [0.24, 0.34, 0.22]), { position: testisCenter(side), rotation: [0.1, 0, side * 0.2] });
  const testes = union(intersect(testisShape(-1), plane([0, 0, 1], SECTION.offset)), testisShape(1));
  s.field("Testes", testes, {
    cell: 0.009,
    caps: [SECTION],
    simplify: { ratio: 0.4, error: 0.001 },
    paint: (c) => {
      if (c.cap) {
        const local = new THREE.Vector3(c.x + 0.46, c.y + 1.12, 0);
        const depth = -testisShape(-1).d(c.x, c.y, c.z);
        if (depth < 0.016) return color("#f4ece4"); // tunica albuginea
        // Septa divide the testis into lobules of coiled seminiferous tubules
        // that drain toward the mediastinum and rete testis.
        if (Math.hypot(local.x + 0.1, local.y - 0.16) < 0.065) return color("#efdccb");
        const l = lobules(c.x * 8, c.y * 8, 0.5);
        if (l.f2 - l.f1 < 0.05) return color("#f1e6da");
        const tubules = Math.abs(coil(c.x * 38, c.y * 38, l.id * 10));
        return mix(mix(color("#e2ad94"), color("#d49379"), l.id), color("#b46a5a"), smoothstep(0.15, 0.02, tubules));
      }
      return tissue({ base: "#ecdcd0", dark: "#cbb2a4", light: "#faf2ec", capillary: "#c9848c", seed: 179, scale: 3, capillaryAmount: 0.3 })(c);
    },
  });
  const epididymides = [-1, 1].map((side) => {
    const [cx, cy, cz] = testisCenter(side);
    const axis = sampleCurve([[cx + side * 0.04, cy + 0.34, cz - 0.08], [cx + side * 0.2, cy + 0.2, cz - 0.14], [cx + side * 0.25, cy - 0.06, cz - 0.16], [cx + side * 0.18, cy - 0.3, cz - 0.12], [cx + side * 0.08, cy - 0.36, cz - 0.1]], 50);
    return displace(tube(axis, axis.map((_, i) => 0.1 - 0.055 * (i / axis.length) + 0.01 * Math.sin(i))), (x, y, z) => -Math.abs(coil(x * 14, y * 14, z * 14)), 0.022);
  });
  s.field("Epididymides", subtract(smoothUnion(0.03, ...epididymides), testes), {
    cell: 0.009,
    simplify: { ratio: 0.4, error: 0.001 },
    paint: tissue({ base: "#d99a84", dark: "#b06a5c", light: "#f0c4b0", capillary: "#a5404a", seed: 180, scale: 9, crestAmount: 0.5 }),
  });

  // ------------------------------------------------------------ ductus deferens and spermatic cord
  const deferent = [];
  const arteries = [];
  const plexus = [];
  for (const side of [-1, 1]) {
    const [cx, cy, cz] = testisCenter(side);
    const tail = [cx + side * 0.08, cy - 0.36, cz - 0.1];
    const path = [tail, [cx + side * 0.22, cy - 0.2, cz - 0.04], [cx + side * 0.2, cy + 0.4, 0.04], [side * 0.62, -0.25, 0.08], [side * 0.86, 0.5, 0.12], [side * 0.98, 1.0, 0.04], [side * 0.86, 1.3, -0.18], [side * 0.58, 1.22, -0.36], [side * 0.34, 1.0, -0.36], [side * 0.22, 0.86, -0.22]];
    deferent.push(taperedTube(path, (t) => 0.034 + (t > 0.85 ? 0.025 * smoothstep(0.85, 0.95, t) : 0), { radial: 12, segments: 160 }));
    const cord = path.slice(1, 6);
    const curve = new THREE.CatmullRomCurve3(cord.map((p) => new THREE.Vector3(...p)));
    const tortuous = [];
    for (let i = 0; i <= 40; i += 1) {
      const p = curve.getPointAt(i / 40);
      tortuous.push([p.x + Math.sin(i * 1.4) * 0.03, p.y, p.z + 0.06 + Math.cos(i * 1.4) * 0.03]);
    }
    arteries.push(taperedTube(tortuous, 0.016, { radial: 10 }));
    // Pampiniform plexus: several interlacing veins around the cord.
    for (let v = 0; v < 4; v += 1) {
      const strand = [];
      for (let i = 0; i <= 36; i += 1) {
        const p = curve.getPointAt(Math.min(1, i / 36));
        const a = i * 0.7 + v * 1.6;
        strand.push([p.x + Math.cos(a) * 0.05, p.y, p.z + Math.sin(a) * 0.05 - 0.02]);
      }
      plexus.push(taperedTube(strand, 0.018, { radial: 8 }));
    }
  }
  s.mesh("Ductus deferens", merge([...deferent, ...ducts]), { material: "cartilage", paint: tissue({ base: "#f0dcc8", dark: "#cfb19a", light: "#fcf2e6", seed: 181, scale: 8 }) });
  s.mesh("Testicular arteries", merge(arteries), { material: "vessel", paint: (c) => mix(color("#b8323a"), color("#e5675b"), smoothstep(0.1, 0.9, c.nz) * 0.5) });
  s.mesh("Pampiniform plexus", merge(plexus), { material: "vessel", paint: (c) => mix(color("#46549a"), color("#7a86c4"), smoothstep(0.1, 0.9, c.nz) * 0.5) });

  // Bulbourethral glands beside the membranous urethra.
  s.mesh("Bulbourethral glands", merge([-1, 1].map((side) => ellipsoidGeometry([side * 0.13, 0.14, -0.02], [0.05, 0.045, 0.045]))), {
    paint: tissue({ base: "#e8c39b", dark: "#c99a72", light: "#f6dfc2", seed: 182, scale: 12 }),
  });

  s.anchor("prostate", "Prostate", [0.24, 0.5, SECTION.offset]);
  s.anchor("urethra", "Urethra", [0, 0.2, 0.12]);
  s.anchor("vesicles", "Seminal vesicles", [0.62, 1.12, -0.26]);
  s.anchor("ductus", "Ductus deferens", [0.86, 0.5, 0.15]);
  s.anchor("testes", "Testes", [0.48, -1.0, 0.24]);
  s.anchor("seminiferous-tubules", "Testes", [-0.5, -1.2, SECTION.offset]);
  s.anchor("epididymis", "Epididymides", [0.7, -1.0, -0.06]);
  s.anchor("spermatic-cord", "Pampiniform plexus", [0.66, -0.2, 0.15]);
  s.anchor("bulbourethral", "Bulbourethral glands", [0.13, 0.14, 0.03]);
  return s;
}
