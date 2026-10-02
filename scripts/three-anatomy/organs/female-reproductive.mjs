import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { curveTube, displace, ellipsoid, intersect, offset, plane, sampleCurve, smoothUnion, stretch, subtract, transform, tube, union } from "../kit/sdf.mjs";
import { fbm3, mulberry32, ridged3, simplex3, worley3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { growVessels, merge, taperedTube, vesselGeometry } from "../kit/geometry.mjs";

// Anterior view. The patient's right half (−x) of the uterus, cervix and
// vagina is removed in front of the coronal plane, and the right ovary is
// bisected, so internal layers sit beside intact surface anatomy.
const SECTION = 0.0;

/** Removes material in front of the coronal plane on the patient's right. */
const rightFront = intersect(plane([0, 0, -1], -SECTION), plane([1, 0, 0], 0.0));

function triangleField(a, b, c, halfDepth, round) {
  // Inigo Quilez's 2D triangle distance in the coronal plane, extruded in z.
  const tri = (px, py) => {
    const e0 = [b[0] - a[0], b[1] - a[1]], e1 = [c[0] - b[0], c[1] - b[1]], e2 = [a[0] - c[0], a[1] - c[1]];
    const v0 = [px - a[0], py - a[1]], v1 = [px - b[0], py - b[1]], v2 = [px - c[0], py - c[1]];
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const proj = (v, e) => {
      const h = clamp((v[0] * e[0] + v[1] * e[1]) / (e[0] * e[0] + e[1] * e[1]));
      return [v[0] - e[0] * h, v[1] - e[1] * h];
    };
    const pq0 = proj(v0, e0), pq1 = proj(v1, e1), pq2 = proj(v2, e2);
    const s = Math.sign(e0[0] * e2[1] - e0[1] * e2[0]);
    const d0 = [pq0[0] ** 2 + pq0[1] ** 2, s * (v0[0] * e0[1] - v0[1] * e0[0])];
    const d1 = [pq1[0] ** 2 + pq1[1] ** 2, s * (v1[0] * e1[1] - v1[1] * e1[0])];
    const d2 = [pq2[0] ** 2 + pq2[1] ** 2, s * (v2[0] * e2[1] - v2[1] * e2[0])];
    const dist = Math.min(d0[0], d1[0], d2[0]);
    const sign = Math.min(d0[1], d1[1], d2[1]);
    return -Math.sqrt(dist) * Math.sign(sign);
  };
  return {
    d: (x, y, z) => {
      const dxy = tri(x, y) - round;
      const dz = Math.abs(z) - halfDepth;
      return Math.min(Math.max(dxy, dz), 0) + Math.hypot(Math.max(dxy, 0), Math.max(dz, 0));
    },
    b: [Math.min(a[0], b[0], c[0]) - round, Math.min(a[1], b[1], c[1]) - round, -halfDepth, Math.max(a[0], b[0], c[0]) + round, Math.max(a[1], b[1], c[1]) + round, halfDepth],
  };
}

export function build() {
  const noise = simplex3(151);
  const lumpy = fbm3(noise, 3);
  const swirl = simplex3(152);
  const follicleCells = worley3(153);
  const rugaeNoise = ridged3(simplex3(154), 5);

  // ------------------------------------------------------------ uterus
  const body = smoothUnion(0.28,
    ellipsoid([0, 0.42, 0], [0.56, 0.58, 0.36]),
    ellipsoid([0, -0.12, 0], [0.36, 0.4, 0.3]),
  );
  const cervix = smoothUnion(0.12, body, curveTube([[0, -0.25, 0.0], [0, -0.55, 0.02], [0, -0.82, 0.05]], (t) => 0.24 - 0.04 * t, 20));
  const uterusOuter = displace(cervix, (x, y, z) => lumpy(x * 2.4, y * 2.4, z * 2.4), 0.012);
  const cavity = smoothUnion(0.03,
    triangleField([-0.3, 0.74], [0.3, 0.74], [0, -0.16], 0.03, 0.03),
    curveTube([[0, -0.12, 0], [0, -0.5, 0.02], [0, -0.86, 0.05]], 0.032, 20),
  );
  const endometriumOuter = offset(cavity, 0.09);
  const vaginaAxis = sampleCurve([[0, -0.62, 0.06], [0.0, -1.0, 0.1], [0.0, -1.55, 0.12]], 20);
  const vaginaOuter = intersect(stretch(tube(vaginaAxis, 0.3), [1, 1, 0.7], [0, -1.0, 0.1]), plane([0, -1, 0], 1.5));
  const vaginaLumen = intersect(stretch(tube(vaginaAxis.slice(2), 0.24), [1, 1, 0.45], [0, -1.0, 0.1]), plane([0, 1, 0], -0.66));

  const myometrium = subtract(uterusOuter, endometriumOuter, rightFront, vaginaLumen);
  const endometrium = subtract(intersect(endometriumOuter, uterusOuter), cavity, rightFront);

  const s = new Specimen("female-reproductive", { cell: 0.011 });
  const perimetrium = tissue({ base: "#e4a294", dark: "#bf6f68", light: "#f6cbbd", capillary: "#b44c56", seed: 155, scale: 2.8, capillaryAmount: 0.3, crestAmount: 0.4 });
  const sectionCaps = [{ normal: new THREE.Vector3(0, 0, 1), offset: SECTION }, { normal: new THREE.Vector3(-1, 0, 0), offset: 0 }];
  s.field("Myometrium", myometrium, {
    caps: sectionCaps,
    simplify: { ratio: 0.36, error: 0.0012 },
    paint: (c) => {
      if (c.cap) {
        const depth = -uterusOuter.d(c.x, c.y, c.z);
        if (depth < 0.012) return color("#f3d0c4");
        const fibres = 0.5 + 0.5 * Math.sin(Math.atan2(c.y - 0.2, c.x) * 18 + swirl(c.x * 4, c.y * 4, c.z * 4) * 3 + depth * 40);
        return c.y < -0.25 ? mix(color("#efc2b4"), color("#e3a99c"), fibres * 0.5) : mix(color("#d98a80"), color("#c06c67"), fibres * 0.55);
      }
      if (c.y < -0.3) return mix(perimetrium(c), color("#f0b9ab"), 0.4);
      return perimetrium(c);
    },
  });
  s.field("Endometrium", endometrium, {
    caps: sectionCaps,
    cell: 0.008,
    simplify: { ratio: 0.4, error: 0.001 },
    paint: (c) => {
      const glands = rugaeNoise(c.x * 6, c.y * 6, c.z * 6);
      // The cervical canal's palmate folds are paler than the uterine lining.
      if (c.y < -0.22) return mix(color("#f1bfb4"), color("#d58e88"), glands * 0.7);
      return mix(color("#b8404c"), color("#8f2a3a"), glands * 0.6 + lumpy(c.x * 9, c.y * 9, c.z * 9) * 0.2);
    },
  });
  const rugae = (x, y, z) => smoothstep(0.4, 0.95, rugaeNoise(x * 2.2, y * 6, z * 2.2)) * 0.04;
  const vagina = subtract({ d: (x, y, z) => Math.max(vaginaOuter.d(x, y, z), -(vaginaLumen.d(x, y, z) + rugae(x, y, z))), b: vaginaOuter.b }, uterusOuter, rightFront);
  s.field("Vagina", vagina, {
    caps: [...sectionCaps, { normal: new THREE.Vector3(0, -1, 0), offset: 1.5 }],
    simplify: { ratio: 0.4, error: 0.0012 },
    paint: (c) => {
      if (c.cap) return -vaginaOuter.d(c.x, c.y, c.z) < 0.012 ? color("#f1cfc1") : color("#e7aa9c");
      if (vaginaLumen.d(c.x, c.y, c.z) > -0.02 && vaginaOuter.d(c.x, c.y, c.z) < -0.03) return mix(color("#e49a92"), color("#c46e70"), smoothstep(0, 0.6, c.curv));
      return tissue({ base: "#e6ab9a", dark: "#c47c70", light: "#f6d0c2", seed: 156, scale: 3 })(c);
    },
  });

  // ------------------------------------------------------------ tubes and ovaries
  const tubes = [];
  const fimbriae = [];
  for (const side of [-1, 1]) {
    const path = [[side * 0.42, 0.78, 0.0], [side * 0.72, 0.86, 0.02], [side * 1.02, 0.9, 0.04], [side * 1.34, 0.86, 0.08], [side * 1.58, 0.66, 0.08], [side * 1.66, 0.42, 0.06], [side * 1.58, 0.3, 0.06]];
    tubes.push(curveTube(path, (t) => 0.045 + 0.06 * smoothstep(0.35, 0.8, t) + 0.05 * smoothstep(0.85, 1, t), 70));
    // Fimbriae fringe the funnel-shaped infundibulum over the ovary.
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2;
      const base = [side * 1.56 + Math.cos(angle) * 0.09, 0.27 + Math.sin(angle) * 0.04, 0.06 + Math.sin(angle) * 0.09];
      fimbriae.push(curveTube([base, [base[0] + side * 0.02 * Math.cos(angle), base[1] - 0.12, base[2] + 0.03 * Math.sin(angle)], [base[0] - side * 0.06, base[1] - 0.2 - (i % 3) * 0.03, base[2] + 0.04 * Math.sin(angle)]], (t) => 0.024 - 0.012 * t, 10));
    }
  }
  const tubeField = subtract(smoothUnion(0.04, ...tubes, ...fimbriae), uterusOuter, ...[-1, 1].map((side) => ellipsoid([side * 1.58, 0.24, 0.07], [0.07, 0.07, 0.07])));
  s.field("Uterine tubes", tubeField, {
    cell: 0.008,
    simplify: { ratio: 0.4, error: 0.001 },
    paint: (c) => {
      const tone = tissue({ base: "#e5998c", dark: "#c16a66", light: "#f6c4b6", capillary: "#b24452", seed: 157, scale: 6, capillaryAmount: 0.35 })(c);
      return Math.abs(c.x) > 1.45 && c.y < 0.36 ? mix(tone, color("#c45563"), 0.45) : tone;
    },
  });

  const ovaryCenter = (side) => [side * 1.2, 0.16, -0.02];
  const ovaryShape = (side) => displace(transform(ellipsoid([0, 0, 0], [0.3, 0.17, 0.15]), { position: ovaryCenter(side), rotation: [0, 0, side * -0.35] }),
    (x, y, z) => lumpy(x * 6, y * 6, z * 6) * 0.6 + follicleCells(x * 7, y * 7, z * 7).f1 * -0.4, 0.02);
  const follicles = [];
  const random = mulberry32(158);
  for (let i = 0; i < 10; i += 1) {
    const angle = random() * Math.PI * 2;
    const r = 0.11 + random() * 0.08;
    follicles.push({ c: [-1.2 + Math.cos(angle) * r, 0.16 + Math.sin(angle) * r * 0.5, 0.0], r: 0.025 + random() * 0.035 });
  }
  const ovaries = union(subtract(ovaryShape(-1), plane([0, 0, -1], -SECTION)), ovaryShape(1));
  s.field("Ovaries", ovaries, {
    cell: 0.008,
    caps: sectionCaps,
    simplify: { ratio: 0.4, error: 0.001 },
    paint: (c) => {
      if (c.cap) {
        // Cortex with antral follicles and a corpus luteum around a vascular medulla.
        const depth = -ovaryShape(-1).d(c.x, c.y, c.z);
        if (Math.hypot(c.x + 1.08, c.y - 0.08) < 0.07) return mix(color("#f2c35a"), color("#d89a35"), swirl(c.x * 40, c.y * 40, 0) * 0.5 + 0.5);
        for (const f of follicles) {
          const d = Math.hypot(c.x - f.c[0], c.y - f.c[1]);
          if (d < f.r) return d > f.r - 0.008 ? color("#e7b783") : color("#c98a5b");
        }
        return depth < 0.06 ? color("#f1ded0") : mix(color("#e1aaa0"), color("#cd8b86"), swirl(c.x * 20, c.y * 20, 0) * 0.5 + 0.5);
      }
      return tissue({ base: "#ead0c3", dark: "#c9a597", light: "#faeee6", capillary: "#cf8a88", seed: 159, scale: 8, capillaryAmount: 0.2 })(c);
    },
  });

  // ------------------------------------------------------------ ligaments
  const ligaments = [];
  for (const side of [-1, 1]) {
    ligaments.push(curveTube([[side * 0.4, 0.45, -0.04], [side * 0.7, 0.32, -0.04], [side * 0.95, 0.2, -0.03]], 0.035, 20)); // ovarian ligament
    ligaments.push(curveTube([[side * 0.46, 0.62, 0.18], [side * 0.86, 0.42, 0.34], [side * 1.28, 0.1, 0.44], [side * 1.6, -0.2, 0.46]], 0.04, 30)); // round ligament
    ligaments.push(curveTube([[side * 1.48, 0.22, -0.04], [side * 1.75, 0.38, -0.06], [side * 1.98, 0.5, -0.08]], 0.05, 20)); // suspensory ligament
  }
  s.field("Supporting ligaments", union(ligaments), {
    cell: 0.009,
    material: "fat",
    simplify: { ratio: 0.4, error: 0.0012 },
    paint: tissue({ base: "#efd4c6", dark: "#cfa898", light: "#fbeee6", capillary: "#d08486", seed: 160, scale: 5, capillaryAmount: 0.25 }),
    shading: { ao: 0.7 },
  });

  // ------------------------------------------------------------ vessels
  const arteries = [];
  const veins = [];
  for (const side of [-1, 1]) {
    const climb = [];
    for (let i = 0; i <= 14; i += 1) {
      const t = i / 14;
      climb.push([side * (0.5 + 0.06 * Math.sin(t * 18)), -0.62 + t * 1.3, 0.1 + 0.05 * Math.cos(t * 18)]);
    }
    arteries.push(taperedTube([[side * 1.0, -0.9, 0.02], [side * 0.7, -0.66, 0.06], ...climb], (t) => 0.034 - 0.012 * t, { radial: 12 }));
    veins.push(taperedTube([[side * 1.02, -0.98, -0.06], [side * 0.72, -0.72, -0.04], [side * 0.56, -0.2, -0.06], [side * 0.54, 0.6, -0.08]], 0.034, { radial: 12 }));
    arteries.push(taperedTube([[side * 1.98, 0.52, -0.06], [side * 1.6, 0.36, -0.02], [side * 1.2, 0.5, 0.0], [side * 0.6, 0.72, 0.04]], 0.022, { radial: 10 }));
    veins.push(taperedTube([[side * 1.98, 0.46, -0.1], [side * 1.55, 0.28, -0.08], [side * 1.25, 0.42, -0.06]], 0.03, { radial: 10 }));
  }
  const keep = (p) => !(p.x < 0.02 && p.z > SECTION - 0.02);
  arteries.push(vesselGeometry(growVessels(uterusOuter, {
    seed: 161,
    roots: [-1, 1].flatMap((side) => [0.0, 0.3, 0.6].map((y) => ({ at: [side * 0.52, y, 0.12], dir: [-side, 0.1, 0.4], radius: 0.016, length: 0.55, generations: 2 }))),
    step: 0.02, hug: 0.45, keep, branchEvery: 0.15, minRadius: 0.004,
  }), { radial: 8 }));
  const vessel = (base, lightHex) => {
    const b = color(base), l = color(lightHex);
    return (c) => mix(b, l, smoothstep(0.1, 0.95, c.ny * 0.45 + c.nz * 0.65) * 0.55);
  };
  s.mesh("Uterine and ovarian arteries", merge(arteries), { material: "vessel", paint: vessel("#b8323a", "#e5675b"), shading: { cavity: 0.2 } });
  s.mesh("Uterine and ovarian veins", merge(veins), { material: "vessel", paint: vessel("#46549a", "#7a86c4"), shading: { cavity: 0.2 } });

  s.anchor("uterus", "Myometrium", [0.3, 0.75, 0.3]);
  s.anchor("myometrium", "Myometrium", [-0.4, 0.3, SECTION]);
  s.anchor("endometrium", "Endometrium", [-0.18, 0.5, SECTION]);
  s.anchor("cervix", "Myometrium", [-0.12, -0.62, SECTION]);
  s.anchor("vagina", "Vagina", [0.2, -1.2, 0.25]);
  s.anchor("tubes", "Uterine tubes", [1.0, 0.92, 0.1]);
  s.anchor("fimbriae", "Uterine tubes", [1.56, 0.12, 0.14]);
  s.anchor("ovaries", "Ovaries", [1.2, 0.22, 0.14]);
  s.anchor("follicles", "Ovaries", [-1.2, 0.1, SECTION]);
  s.anchor("uterine-artery", "Uterine and ovarian arteries", [0.52, -0.1, 0.16]);
  s.anchor("round-ligament", "Supporting ligaments", [0.86, 0.42, 0.38]);
  return s;
}

