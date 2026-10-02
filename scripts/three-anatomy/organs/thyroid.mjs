import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { displace, ellipsoid, intersect, offset, plane, roundCone, smoothSubtract, smoothUnion, stretch, subtract, union } from "../kit/sdf.mjs";
import { fbm3, simplex3, worley3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { growVessels, merge, taperedTube, vesselGeometry } from "../kit/geometry.mjs";
import { cricoid, hyoid, oesophagus, thyroidCartilage, trachea } from "./parts/neck.mjs";

// Anterior view of the neck. The patient's left is +x; the left lobe is
// sectioned to show (enlarged) follicles.
const SECTION = { normal: new THREE.Vector3(0, 0, 1), offset: 0.2 };

export function build() {
  const noise = simplex3(121);
  const lumpy = fbm3(noise, 3);
  const lobules = worley3(122);
  const follicles = worley3(123);

  const airway = trachea({ top: 0.46, bottom: -1.75 });
  const lobe = (side) => smoothUnion(0.12,
    roundCone([side * 0.4, 0.78, 0.16], [side * 0.5, 0.12, 0.2], 0.07, 0.25),
    roundCone([side * 0.5, 0.12, 0.2], [side * 0.48, -0.66, 0.12], 0.25, 0.2),
  );
  const isthmus = stretch(roundCone([-0.4, -0.24, 0.36], [0.4, -0.24, 0.36], 0.18, 0.18), [1, 1, 0.48], [0, -0.24, 0.42]);
  const pyramidal = roundCone([-0.07, -0.12, 0.42], [-0.12, 0.4, 0.4], 0.05, 0.026);
  const raw = smoothUnion(0.1, lobe(1), lobe(-1), isthmus, pyramidal);
  // The gland wraps the airway, so its medial surface follows the trachea.
  const wrapped = smoothSubtract(0.08, raw, offset(airway.outer, 0.04));
  const gland = displace(wrapped, (x, y, z) => {
    const l = lobules(x * 8, y * 8, z * 8);
    return lumpy(x * 3, y * 3, z * 3) * 0.8 + (1 - smoothstep(0.0, 0.08, l.f2 - l.f1)) * 0.08;
  }, 0.018);
  const sectioned = subtract(gland, intersect(plane(SECTION.normal.clone().negate(), -SECTION.offset), plane([-1, 0, 0], -0.4)));

  const s = new Specimen("thyroid", { cell: 0.011 });
  const surface = tissue({ base: "#b8564b", dark: "#8a3636", light: "#e3937e", capillary: "#74242e", seed: 124, scale: 3.2, capillaryAmount: 0.38, crestAmount: 0.4 });
  s.field("Thyroid gland", sectioned, {
    simplify: { ratio: 0.36, error: 0.0012 },
    caps: [SECTION],
    paint: (c) => {
      if (c.cap) {
        const depth = -gland.d(c.x, c.y, c.z);
        if (depth < 0.01) return color("#e1b9aa");
        const f = follicles(c.x * 12, c.y * 12, c.z * 12);
        const wall = smoothstep(0.02, 0.16, f.f2 - f.f1);
        const colloid = mix(color("#d9785c"), color("#eea27a"), f.id);
        return mix(color("#7a2a2d"), colloid, wall);
      }
      const l = lobules(c.x * 8, c.y * 8, c.z * 8);
      return mix(surface(c), color("#9a4440"), (1 - smoothstep(0.0, 0.05, l.f2 - l.f1)) * 0.1);
    },
  });

  // Parathyroid glands on the posterior surface of each lobe.
  const parathyroids = [];
  for (const side of [1, -1]) {
    parathyroids.push(ellipsoid([side * 0.5, 0.42, -0.08], [0.07, 0.09, 0.05]), ellipsoid([side * 0.5, -0.5, -0.06], [0.075, 0.09, 0.055]));
  }
  s.field("Parathyroid glands", smoothSubtract(0.02, union(parathyroids), wrapped), {
    cell: 0.008,
    paint: tissue({ base: "#d59a5c", dark: "#b37440", light: "#efc68f", seed: 125, scale: 10 }),
  });

  s.field("Trachea", airway.field, { material: "cartilage", caps: [{ normal: new THREE.Vector3(0, -1, 0), offset: 1.75 }], simplify: { ratio: 0.38, error: 0.0012 }, paint: airway.paint });
  const shield = thyroidCartilage({ y0: 0.78, y1: 1.46 });
  s.field("Thyroid cartilage", shield.field, { material: "cartilage", simplify: { ratio: 0.4, error: 0.0012 }, paint: shield.paint });
  const ring = cricoid({ y0: 0.48 });
  s.field("Cricoid cartilage", ring.field, { material: "cartilage", simplify: { ratio: 0.4, error: 0.0012 }, paint: ring.paint });
  const bone = hyoid({ y: 1.78 });
  s.field("Hyoid bone", bone.field, { material: "bone", simplify: { ratio: 0.4, error: 0.0012 }, paint: bone.paint });
  const gullet = oesophagus({ top: 0.5, bottom: -1.72, z: -0.48 });
  s.field("Oesophagus", gullet.field, { material: "muscle", simplify: { ratio: 0.4, error: 0.0015 }, paint: gullet.paint });

  // Carotid arteries with superior and inferior thyroid branches.
  const arteries = [];
  const veins = [];
  for (const side of [1, -1]) {
    arteries.push(taperedTube([[side * 0.84, -1.8, -0.24], [side * 0.82, -0.4, -0.2], [side * 0.78, 1.1, -0.16]], 0.09, { radial: 18, caps: "start" }));
    arteries.push(taperedTube([[side * 0.78, 1.1, -0.16], [side * 0.7, 1.5, -0.04], [side * 0.66, 1.92, -0.02]], 0.065, { radial: 16 }));
    arteries.push(taperedTube([[side * 0.78, 1.1, -0.16], [side * 0.92, 1.5, -0.28], [side * 0.96, 1.92, -0.32]], 0.075, { radial: 16 }));
    // Superior thyroid artery descends to the upper pole.
    arteries.push(taperedTube([[side * 0.72, 1.38, -0.02], [side * 0.62, 1.22, 0.16], [side * 0.48, 0.95, 0.24], [side * 0.42, 0.72, 0.24]], 0.032, { radial: 12 }));
    // Inferior thyroid artery loops medially behind the carotid.
    arteries.push(taperedTube([[side * 1.02, -1.25, -0.42], [side * 0.94, -0.72, -0.36], [side * 0.7, -0.62, -0.2], [side * 0.56, -0.5, -0.04]], 0.035, { radial: 12 }));
    veins.push(taperedTube([[side * 1.08, -1.8, -0.28], [side * 1.12, 0.0, -0.26], [side * 1.06, 1.92, -0.3]], 0.12, { radial: 18 }));
  }
  // Inferior thyroid veins descend over the trachea from the isthmus.
  veins.push(taperedTube([[0.14, -0.38, 0.44], [0.1, -0.8, 0.37], [0.16, -1.25, 0.35], [0.12, -1.75, 0.33]], 0.032, { radial: 12 }));
  veins.push(taperedTube([[-0.16, -0.38, 0.44], [-0.12, -0.85, 0.37], [-0.18, -1.3, 0.35], [-0.14, -1.75, 0.34]], 0.03, { radial: 12 }));
  const keep = (p) => !(p.x > 0.4 && p.z > SECTION.offset - 0.02);
  arteries.push(vesselGeometry(growVessels(gland, {
    seed: 126,
    roots: [
      { at: [0.42, 0.72, 0.24], dir: [0.1, -1, 0.1], radius: 0.018, length: 0.8, generations: 3 },
      { at: [-0.42, 0.72, 0.24], dir: [-0.1, -1, 0.1], radius: 0.018, length: 0.9, generations: 3 },
      { at: [-0.56, -0.5, 0.0], dir: [0.2, 1, 0.4], radius: 0.016, length: 0.7, generations: 2 },
    ],
    step: 0.02, hug: 0.4, keep, branchEvery: 0.14, minRadius: 0.004,
  }), { radial: 8 }));
  const vessel = (base, lightHex) => {
    const b = color(base), l = color(lightHex);
    return (c) => mix(b, l, smoothstep(0.1, 0.95, c.ny * 0.45 + c.nz * 0.65) * 0.55);
  };
  s.mesh("Thyroid arteries", merge(arteries), { material: "vessel", paint: vessel("#b8323a", "#e5675b"), shading: { cavity: 0.2 } });
  s.mesh("Thyroid veins", merge(veins), { material: "vessel", paint: vessel("#46549a", "#7a86c4"), shading: { cavity: 0.2 } });

  // Recurrent laryngeal nerves climb in the tracheo-oesophageal groove.
  const nerves = [1, -1].map((side) => taperedTube([[side * 0.3, -1.8, -0.36], [side * 0.3, -0.6, -0.34], [side * 0.26, 0.4, -0.3], [side * 0.22, 0.62, -0.24]], 0.022, { radial: 10 }));
  s.mesh("Recurrent laryngeal nerves", merge(nerves), { material: "nerve", paint: (c) => mix(color("#e9cb6c"), color("#c49a3d"), smoothstep(0, 0.8, c.curv + 0.3) * 0.5) });

  s.anchor("right-lobe", "Thyroid gland", [-0.62, 0.0, 0.38]);
  s.anchor("left-lobe", "Thyroid gland", [0.7, 0.2, 0.2]);
  s.anchor("follicles", "Thyroid gland", [0.56, -0.1, SECTION.offset]);
  s.anchor("isthmus", "Thyroid gland", [0.0, -0.24, 0.5]);
  s.anchor("pyramidal-lobe", "Thyroid gland", [-0.11, 0.3, 0.46]);
  s.anchor("parathyroid", "Parathyroid glands", [-0.5, 0.42, -0.16]);
  s.anchor("superior-thyroid-artery", "Thyroid arteries", [-0.55, 1.12, 0.22]);
  s.anchor("trachea", "Trachea", [0.0, -1.2, 0.33]);
  s.anchor("thyroid-cartilage", "Thyroid cartilage", [0.0, 1.25, 0.45]);
  return s;
}
