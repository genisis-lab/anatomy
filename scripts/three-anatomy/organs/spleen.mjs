import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { curveTube, displace, ellipsoid, intersect, plane, smoothSubtract, smoothUnion, sphere, subtract, transform, union } from "../kit/sdf.mjs";
import { fbm3, mulberry32, ridged3, simplex3, worley3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { merge, taperedTube } from "../kit/geometry.mjs";

// The visceral (hilar) surface faces the viewer; the convex diaphragmatic
// surface is behind. Medial is −x, toward the pancreas tail.
const TILT = -0.42;

export function build() {
  const noise = simplex3(111);
  const lumpy = fbm3(noise, 3);
  const pulp = fbm3(simplex3(112), 4);
  const trabecular = ridged3(simplex3(113), 14);
  const follicles = worley3(114);

  const core = smoothUnion(0.3, ellipsoid([0, 0.1, 0], [0.62, 1.2, 0.5]), ellipsoid([0.12, -0.55, -0.02], [0.55, 0.62, 0.46]));
  // Concave visceral surface with gastric (upper) and renal (lower) impressions.
  const visceral = smoothSubtract(0.3, core,
    ellipsoid([-0.32, 0.4, 1.22], [0.8, 0.85, 0.82]),
    ellipsoid([-0.45, -0.6, 1.1], [0.66, 0.66, 0.72]),
  );
  // Notches along the superior (anterior) border.
  const notched = smoothSubtract(0.04, visceral,
    ellipsoid([0.5, 0.9, 0.2], [0.08, 0.06, 0.32]),
    ellipsoid([0.6, 0.38, 0.2], [0.07, 0.055, 0.32]),
    ellipsoid([0.62, -0.18, 0.18], [0.06, 0.045, 0.32]),
  );
  const hilumGroove = curveTube([[-0.3, 0.55, 0.36], [-0.24, 0.05, 0.38], [-0.3, -0.42, 0.34]], 0.06, 30);
  const shaped = smoothSubtract(0.06, notched, hilumGroove);
  const spleenBody = transform(displace(shaped, (x, y, z) => lumpy(x * 2, y * 2, z * 2) + noise(x * 8, y * 8, z * 8) * 0.12, 0.018), { rotation: [0, 0, TILT] });

  // An oblique section through the lower pole, facing the viewer, exposes
  // the pulp. Everything in front of the plane is removed.
  const cut = { normal: new THREE.Vector3(0.18, -0.5, 0.85).normalize(), offset: 0.3 };
  const wedge = plane(cut.normal.clone().negate(), -cut.offset);
  const cutA = cut;
  const spleen = subtract(spleenBody, wedge);

  const s = new Specimen("spleen", { cell: 0.011 });
  const capsule = tissue({ base: "#8a3c55", dark: "#5e2340", light: "#c48298", capillary: "#4e2a52", seed: 115, scale: 3, capillaryAmount: 0.25, crestAmount: 0.45 });
  const inWedge = (c) => c.cap > 0;
  s.field("Spleen", spleen, {
    simplify: { ratio: 0.38, error: 0.0012 },
    caps: [{ normal: cut.normal.clone(), offset: cut.offset }],
    paint: (c) => {
      if (inWedge(c)) {
        const depth = -spleenBody.d(c.x, c.y, c.z);
        if (depth < 0.012) return color("#d9c0c8");
        const f = follicles(c.x * 11, c.y * 11, c.z * 11);
        const sinus = pulp(c.x * 14, c.y * 14, c.z * 14) * 0.5 + 0.5;
        let tone = mix(color("#7d1f2e"), color("#a83847"), sinus);
        tone = mix(tone, color("#e9d6c8"), smoothstep(0.62, 0.95, trabecular(c.x * 3, c.y * 3, c.z * 3)) * 0.8);
        if (f.f1 < 0.2) tone = mix(tone, color("#efe6d6"), smoothstep(0.2, 0.12, f.f1));
        return tone;
      }
      return capsule(c);
    },
  });

  // Enlarged white-pulp follicles stand slightly proud of the section.
  const random = mulberry32(116);
  const nodules = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < 900 && nodules.length < 28; i += 1) {
    v.set(random() * 1.6 - 0.8, random() * 2.4 - 1.4, random() * 1.0 - 0.5);
    v.addScaledVector(cut.normal, cut.offset - v.dot(cut.normal));
    if (spleenBody.d(v.x, v.y, v.z) > -0.06) continue;
    if (nodules.some((p) => p.distanceTo(v) < 0.12)) continue;
    nodules.push(v.clone());
  }
  s.field("White pulp", intersect(union(nodules.map((p) => sphere(p, 0.034 + random() * 0.012))), spleenBody), {
    cell: 0.006,
    paint: (c) => mix(color("#f3ecdf"), color("#cdbfb4"), smoothstep(0.0, 0.7, c.curv + 0.2)),
    shading: { ao: 0.5 },
  });

  // Hilar vessels: the splenic artery and vein divide into segmental
  // branches that enter along the hilum.
  const axisDir = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), TILT);
  const hilumCenter = new THREE.Vector3(-0.24, 0.05, 0.38).applyAxisAngle(new THREE.Vector3(0, 0, 1), TILT);
  const arteryEnd = new THREE.Vector3(-0.95, 0.02, 0.62);
  const veinEnd = new THREE.Vector3(-0.95, -0.3, 0.5);
  // The splenic artery is characteristically tortuous; the vein runs straighter below it.
  const tortuous = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    tortuous.push([-1.65 + t * (arteryEnd.x + 1.65), -0.12 + t * (arteryEnd.y + 0.12) + Math.sin(t * Math.PI * 3.2) * 0.09 * (1 - t * 0.6), 0.44 + t * 0.18 + Math.cos(t * Math.PI * 2.6) * 0.06]);
  }
  const arteries = [taperedTube(tortuous, 0.06, { radial: 16 })];
  const veins = [taperedTube([[-1.65, -0.52, 0.3], [-1.4, -0.46, 0.4], [-1.15, -0.36, 0.47], veinEnd], 0.085, { radial: 18 })];
  for (let i = 0; i < 4; i += 1) {
    const along = 0.42 - i * 0.28;
    const target = hilumCenter.clone().addScaledVector(axisDir, along);
    const aTarget = target.clone().add(new THREE.Vector3(-0.02, 0.05, 0.05));
    const vTarget = target.clone().add(new THREE.Vector3(0.02, -0.06, -0.02));
    const sway = (i - 1.5) * 0.05;
    const aMid1 = arteryEnd.clone().lerp(aTarget, 0.3).add(new THREE.Vector3(0, sway + 0.04, 0.09));
    const aMid2 = arteryEnd.clone().lerp(aTarget, 0.7).add(new THREE.Vector3(0, -sway * 0.5, 0.07));
    const vMid1 = veinEnd.clone().lerp(vTarget, 0.35).add(new THREE.Vector3(0, sway - 0.03, 0.06));
    const vMid2 = veinEnd.clone().lerp(vTarget, 0.72).add(new THREE.Vector3(0, -sway * 0.4, 0.04));
    arteries.push(taperedTube([arteryEnd, aMid1, aMid2, aTarget], (t) => 0.042 - 0.02 * t, { radial: 12 }));
    veins.push(taperedTube([veinEnd, vMid1, vMid2, vTarget], (t) => 0.056 - 0.024 * t, { radial: 14 }));
  }
  const vesselPaint = (base, lightHex) => {
    const b = color(base), l = color(lightHex);
    return (c) => mix(b, l, smoothstep(0.1, 0.95, c.ny * 0.45 + c.nz * 0.65) * 0.55);
  };
  s.mesh("Splenic artery", merge(arteries), { material: "vessel", paint: vesselPaint("#b8323a", "#e86c5e"), shading: { cavity: 0.2 } });
  s.mesh("Splenic vein", merge(veins), { material: "vessel", paint: vesselPaint("#4b4f96", "#8087c8"), shading: { cavity: 0.2 } });

  // Tail of the pancreas reaching the hilum.
  const lobes = worley3(117);
  const tail = intersect(
    displace(curveTube([[-1.75, -0.78, 0.05], [-1.2, -0.66, 0.14], [-0.72, -0.56, 0.2], [-0.48, -0.5, 0.22]], (t) => 0.2 - 0.07 * t, 30),
      (x, y, z) => lobes(x * 9, y * 9, z * 9).f1 - 0.45, 0.05),
    plane([-1, 0, 0], 1.62),
  );
  s.field("Tail of pancreas", tail, {
    cell: 0.012,
    simplify: { ratio: 0.4, error: 0.0015 },
    caps: [{ normal: new THREE.Vector3(-1, 0, 0), offset: 1.62 }],
    paint: (c) => {
      const l = lobes(c.x * 9, c.y * 9, c.z * 9);
      const septa = 1 - smoothstep(0.0, 0.07, l.f2 - l.f1);
      if (c.cap) return mix(mix(color("#f0cf98"), color("#dcab70"), l.id * 0.8), color("#b58552"), septa * 0.8);
      return mix(mix(color("#ecc48c"), color("#d8a66a"), l.id * 0.7), color("#c08e5a"), septa * 0.45);
    },
  });

  const rotated = (p) => new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 0, 1), TILT).toArray();
  s.anchor("capsule", "Spleen", rotated([0.3, 0.75, 0.35]));
  s.anchor("hilum", "Spleen", hilumCenter.toArray());
  s.anchor("notches", "Spleen", rotated([0.58, 0.62, 0.2]));
  s.anchor("red-pulp", "Spleen", rotated([0.15, -0.95, 0.3]));
  s.anchor("white-pulp", "White pulp", rotated([0.3, -0.85, 0.3]));
  s.anchor("splenic-artery", "Splenic artery", tortuous[4]);
  s.anchor("splenic-vein", "Splenic vein", [-1.4, -0.46, 0.48]);
  s.anchor("pancreas-tail", "Tail of pancreas", [-1.2, -0.66, 0.34]);
  return s;
}
