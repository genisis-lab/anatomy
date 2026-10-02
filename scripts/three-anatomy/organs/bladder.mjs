import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { curveTube, displace, ellipsoid, intersect, plane, smoothSubtract, smoothUnion, subtract } from "../kit/sdf.mjs";
import { fbm3, ridged3, simplex3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { growVessels, merge, taperedTube, vesselGeometry } from "../kit/geometry.mjs";

const WALL = 0.11;
// Trigone corners on the posterior inner wall: ureteric orifices and the
// internal urethral orifice.
const LEFT_ORIFICE = [0.36, -0.42], RIGHT_ORIFICE = [-0.36, -0.42], NECK = [0, -0.86];

function inTrigone(x, y, margin = 0) {
  const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const p = [x, y];
  const d1 = sign(p, LEFT_ORIFICE, RIGHT_ORIFICE), d2 = sign(p, RIGHT_ORIFICE, NECK), d3 = sign(p, NECK, LEFT_ORIFICE);
  const negative = d1 < -margin || d2 < -margin || d3 < -margin;
  const positive = d1 > margin || d2 > margin || d3 > margin;
  return !(negative && positive);
}

export function build() {
  const noise = simplex3(71);
  const lumpy = fbm3(noise, 3);
  const warp = simplex3(72);
  // Detrusor bundles: an outer meridional sheet crossed by circular fibres.
  const meridional = (x, y, z) => {
    const w = warp(x * 1.4, y * 1.4, z * 1.4) * 1.6;
    return Math.pow(0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 13 + w + y * 0.8), 1.6);
  };
  const circular = (x, y, z) => {
    const w = warp(x * 1.7 + 5, y * 1.7, z * 1.7) * 1.4;
    return Math.pow(0.5 + 0.5 * Math.sin(y * 11 + w), 2.2);
  };
  const bundles = (x, y, z) => Math.max(meridional(x, y, z), circular(x, y, z) * 0.7);
  const folds = ridged3(simplex3(74), 3.2);

  // A moderately filled bladder: domed apex, broad posterior base, funnel neck.
  const body = smoothUnion(0.35,
    ellipsoid([0, 0.05, 0], [0.98, 0.9, 0.84]),
    ellipsoid([0, -0.55, -0.12], [0.62, 0.42, 0.6]),
    ellipsoid([0, -0.92, 0.0], [0.24, 0.22, 0.24]),
  );
  // Interlacing detrusor bundles stand out on the surface.
  const outer = displace(body, (x, y, z) =>
    lumpy(x * 1.8, y * 1.8, z * 1.8) * 0.4 - bundles(x, y, z) * 0.75, 0.04);
  const rugae = (x, y, z) => (inTrigone(x, y, 0.02) && z < 0 ? 0 : smoothstep(0.35, 0.95, folds(x * 2.6, y * 2.6, z * 2.6)) * 0.055);
  const wall = {
    d: (x, y, z) => {
      const d = outer.d(x, y, z);
      if (d > WALL) return d;
      return Math.max(d, -d - WALL - rugae(x, y, z));
    },
    b: outer.b,
  };
  // Ureteric orifices are slits on the trigone; the neck opens into the urethra.
  const orifices = [
    ellipsoid([LEFT_ORIFICE[0], LEFT_ORIFICE[1], -0.62], [0.05, 0.02, 0.09]),
    ellipsoid([RIGHT_ORIFICE[0], RIGHT_ORIFICE[1], -0.62], [0.05, 0.02, 0.09]),
  ];
  const urethraPath = [[0, -0.9, 0.0], [0, -1.3, 0.05], [0.0, -1.7, 0.1]];
  // The lumen stops short of the cut end so the orifice reads as a dark
  // opening rather than a window through the specimen.
  const urethralLumen = curveTube([[0, -0.84, 0.0], [0, -1.2, 0.04], [0.0, -1.46, 0.08]], 0.035, 20);
  const windowCut = ellipsoid([0, -0.12, 0.92], [0.72, 0.78, 0.56]);
  const bladderWall = smoothSubtract(0.02, subtract(wall, ...orifices, urethralLumen), windowCut);

  const s = new Specimen("bladder", { cell: 0.013 });
  const detrusor = tissue({ base: "#e2a088", dark: "#bd6c5e", light: "#f6cdb6", capillary: "#b0464a", seed: 11, scale: 2.4, capillaryAmount: 0.3 });
  const urothelium = tissue({ base: "#e49b93", dark: "#b8606a", light: "#f8c8bc", capillary: "#b44e5a", seed: 12, scale: 4, crestAmount: 0.6, capillaryAmount: 0.25 });
  const trigone = color("#f0b5a6");
  s.field("Detrusor wall", bladderWall, {
    simplify: { ratio: 0.32, error: 0.0015 },
    paint: (c) => {
      const depth = -outer.d(c.x, c.y, c.z);
      if (depth > WALL * 0.55) {
        if (c.z < -0.2 && inTrigone(c.x, c.y)) {
          const nearOrifice = Math.min(...orifices.map((o) => o.d(c.x, c.y, c.z)));
          return nearOrifice < 0.02 ? color("#7f3b40") : mix(trigone, color("#f7cdbf"), smoothstep(0, 0.5, -c.curv));
        }
        return urothelium(c);
      }
      if (windowCut.d(c.x, c.y, c.z) < 0.03 && depth > 0.004) {
        if (depth < 0.012) return color("#f3d3c2");
        if (depth < WALL * 0.82) return mix(color("#c4655c"), color("#a8494a"), circular(c.x * 3, c.y * 3, c.z * 3));
        return color("#efc8b2");
      }
      // Bundles catch the light on their crests.
      return mix(detrusor(c), color("#f4c6ae"), bundles(c.x, c.y, c.z) * 0.4);
    },
  });

  // Ureters approach from above and behind, then run obliquely through the wall.
  const ureterPaint = tissue({ base: "#ecc4a2", dark: "#c98d6e", light: "#fbe2cb", capillary: "#c25a52", seed: 13, scale: 5, capillaryAmount: 0.3 });
  const ureters = [];
  for (const side of [1, -1]) {
    ureters.push(curveTube([[side * 0.95, 1.85, -0.7], [side * 0.92, 1.1, -0.82], [side * 0.72, 0.15, -0.88], [side * 0.5, -0.32, -0.74], [side * 0.38, -0.42, -0.62]], 0.06, 50));
  }
  s.field("Ureters", intersect(smoothUnion(0.0, ...ureters), plane([0, 1, 0], 1.8)), {
    material: "mucosa",
    caps: [{ normal: new THREE.Vector3(0, 1, 0), offset: 1.8 }],
    simplify: { ratio: 0.45, error: 0.001 },
    paint: (c) => (c.cap ? (Math.hypot(c.x - Math.sign(c.x) * 0.95, c.z + 0.7) < 0.025 ? color("#6b3233") : color("#e8b796")) : ureterPaint(c)),
  });

  const urethra = subtract(intersect(curveTube(urethraPath, (t) => 0.13 - 0.03 * t, 24), plane([0, -1, 0], 1.66)), urethralLumen);
  s.field("Urethra", urethra, {
    material: "mucosa",
    caps: [{ normal: new THREE.Vector3(0, -1, 0), offset: 1.66 }],
    paint: (c) => (c.cap ? color("#d98f86") : mix(color("#e6aa92"), color("#c9786a"), lumpy(c.x * 6, c.y * 6, c.z * 6) * 0.5 + 0.5)),
  });

  // The median umbilical ligament (urachal remnant) rises from the apex.
  const urachus = intersect(curveTube([[0, 0.78, 0.35], [0, 1.25, 0.4], [0.02, 1.7, 0.36]], (t) => 0.05 - 0.02 * t, 24), plane([0, 1, 0], 1.66));
  s.field("Median umbilical ligament", urachus, {
    material: "cartilage",
    caps: [{ normal: new THREE.Vector3(0, 1, 0), offset: 1.66 }],
    paint: (c) => mix(color("#efe0c8"), color("#d8c0a2"), lumpy(c.x * 9, c.y * 9, c.z * 9) * 0.5 + 0.5),
  });

  const keep = (p) => windowCut.d(p.x, p.y, p.z) > 0.04;
  const arteries = [];
  const veins = [];
  for (const side of [1, -1]) {
    arteries.push(taperedTube([[side * 1.25, 1.4, -0.2], [side * 1.0, 0.7, 0.05], [side * 0.86, 0.42, 0.25]], 0.032, { radial: 12 }));
    arteries.push(vesselGeometry(growVessels(outer, {
      seed: side > 0 ? 81 : 82,
      roots: [
        { at: [side * 0.86, 0.42, 0.25], dir: [-side * 0.6, 0.5, 0.4], radius: 0.022, length: 1.1, generations: 3 },
        { at: [side * 0.9, 0.2, 0.0], dir: [-side * 0.3, -0.8, 0.3], radius: 0.02, length: 1.0, generations: 3 },
      ],
      step: 0.022, hug: 0.4, keep, branchEvery: 0.15, minRadius: 0.0045,
    }), { radial: 8 }));
    // Inferior vesical artery and the vesical venous plexus at the base.
    arteries.push(vesselGeometry(growVessels(outer, {
      seed: side > 0 ? 83 : 84,
      roots: [{ at: [side * 0.62, -0.55, -0.4], dir: [-side * 0.3, -0.4, 0.8], radius: 0.02, length: 0.9, generations: 2 }],
      step: 0.022, hug: 0.4, keep, branchEvery: 0.16, minRadius: 0.0045,
    }), { radial: 8 }));
    veins.push(vesselGeometry(growVessels(outer, {
      seed: side > 0 ? 85 : 86,
      roots: [
        { at: [side * 0.72, -0.6, 0.1], dir: [-side * 0.5, 0.6, 0.4], radius: 0.028, length: 1.0, generations: 3 },
        { at: [side * 0.5, -0.82, 0.25], dir: [-side * 0.8, 0.2, 0.3], radius: 0.026, length: 0.7, generations: 2 },
      ],
      step: 0.022, hug: 0.4, keep, branchEvery: 0.14, minRadius: 0.005, wander: 0.5,
    }), { radial: 8 }));
  }
  const vessel = (base, lightHex) => {
    const b = color(base), l = color(lightHex);
    return (c) => mix(b, l, smoothstep(0.1, 0.95, c.ny * 0.45 + c.nz * 0.65) * 0.55);
  };
  s.mesh("Vesical arteries", merge(arteries), { material: "vessel", paint: vessel("#b8323a", "#e5675b"), shading: { cavity: 0.2 } });
  s.mesh("Vesical veins", merge(veins), { material: "vessel", paint: vessel("#46549a", "#7a86c4"), shading: { cavity: 0.2 } });

  s.anchor("detrusor", "Detrusor wall", [0.7, 0.45, 0.5]);
  s.anchor("urothelium", "Detrusor wall", [-0.25, 0.25, -0.55]);
  s.anchor("trigone", "Detrusor wall", [0, -0.6, -0.55]);
  s.anchor("ureteric-orifice", "Detrusor wall", [LEFT_ORIFICE[0], LEFT_ORIFICE[1], -0.55]);
  s.anchor("ureters", "Ureters", [0.93, 1.2, -0.7]);
  s.anchor("urethra", "Urethra", [0, -1.35, 0.2]);
  s.anchor("apex", "Median umbilical ligament", [0, 1.2, 0.45]);
  return s;
}
