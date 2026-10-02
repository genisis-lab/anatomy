import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { curveTube, displace, ellipsoid, intersect, plane, sampleCurve, smoothSubtract, smoothUnion, subtract, tube } from "../kit/sdf.mjs";
import { fbm3, simplex3, worley3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { growVessels, merge, taperedTube, vesselGeometry } from "../kit/geometry.mjs";

const WALL = 0.06;

/** Hollow organ: a wall grown inward from `outer`, optionally thickened by
 *  `ridges(x, y, z)` (mucosal folds) on the luminal side. */
function hollow(outer, wall, ridges) {
  return {
    d: (x, y, z) => {
      const d = outer.d(x, y, z);
      if (d > wall) return d;
      return Math.max(d, -d - wall - (ridges ? ridges(x, y, z) : 0));
    },
    b: outer.b,
  };
}

export function build() {
  const noise = simplex3(51);
  const lumpy = fbm3(noise, 3);
  const honey = worley3(52);

  // --- gallbladder sac: fundus (bottom) → body → neck with Hartmann pouch
  const sacAxis = sampleCurve([[0.78, -1.28, 0.0], [0.6, -0.72, 0.03], [0.38, -0.16, 0.04], [0.16, 0.3, 0.03], [0.02, 0.6, 0.0]], 70);
  const sacRadii = sacAxis.map((_, i) => {
    const t = i / (sacAxis.length - 1);
    return 0.52 - 0.1 * t - 0.3 * smoothstep(0.5, 1, t);
  });
  const pouch = ellipsoid([0.2, 0.4, 0.06], [0.2, 0.16, 0.17]);
  const sacOuter = displace(smoothUnion(0.08, tube(sacAxis, sacRadii), pouch), (x, y, z) => lumpy(x * 2.2, y * 2.2, z * 2.2) + noise(x * 9, y * 9, z * 9) * 0.15, 0.025);
  const honeycomb = (x, y, z) => {
    const r = honey(x * 11, y * 11, z * 11);
    return (1 - smoothstep(0.0, 0.12, r.f2 - r.f1)) * 0.03;
  };
  const sacWindow = ellipsoid([0.58, -0.55, 0.52], [0.36, 0.56, 0.36]);
  const sac = smoothSubtract(0.015, hollow(sacOuter, WALL, honeycomb), sacWindow);

  // --- biliary tree
  const cysticPoints = sampleCurve([[0.0, 0.62, 0.0], [-0.12, 0.8, 0.02], [-0.28, 0.82, 0.02], [-0.4, 0.72, 0.0]], 50);
  // The spiral valve of Heister gives the cystic duct its beaded outline.
  const cysticDuct = tube(cysticPoints, cysticPoints.map((_, i) => 0.055 + 0.012 * Math.sin(i * 1.3)));
  const hepaticRight = curveTube([[0.1, 1.62, -0.02], [-0.16, 1.48, 0.0], [-0.42, 1.34, 0.0]], 0.055, 30);
  const hepaticLeft = curveTube([[-0.98, 1.62, -0.02], [-0.72, 1.5, 0.0], [-0.48, 1.36, 0.0]], 0.052, 30);
  const commonHepatic = curveTube([[-0.45, 1.36, 0.0], [-0.44, 1.04, 0.0], [-0.42, 0.72, 0.0]], 0.066, 30);
  const bileDuctPath = [[-0.42, 0.72, 0.0], [-0.44, 0.2, -0.02], [-0.5, -0.45, -0.05], [-0.62, -1.05, -0.06], [-0.82, -1.36, -0.05]];
  const commonBile = curveTube(bileDuctPath, (t) => 0.07 - 0.02 * t, 50);
  const pancreaticDuct = curveTube([[0.05, -1.52, -0.06], [-0.3, -1.46, -0.05], [-0.6, -1.4, -0.05], [-0.82, -1.38, -0.05]], (t) => 0.026 + 0.012 * t, 40);
  const bileFields = [cysticDuct, hepaticRight, hepaticLeft, commonHepatic, commonBile];

  // --- descending duodenum, opened anteriorly to show the major papilla
  const duoAxis = sampleCurve([[-0.72, 0.1, -0.12], [-1.08, -0.18, 0.0], [-1.18, -0.9, 0.02], [-1.08, -1.66, 0.0], [-0.66, -1.98, -0.06], [-0.3, -2.02, -0.1]], 70);
  const duoOuter = displace(tube(duoAxis, 0.3), (x, y, z) => lumpy(x * 2, y * 2, z * 2), 0.02);
  const plicae = (x, y, z) => Math.max(0, Math.sin(y * 26 + noise(x * 3, y * 2, z * 3) * 2.2)) ** 3 * 0.05 * (0.6 + 0.4 * noise(x * 5, y * 9, z * 5));
  const papilla = ellipsoid([-0.9, -1.36, -0.03], [0.07, 0.085, 0.07]);
  const duoWindow = ellipsoid([-1.02, -1.2, 0.4], [0.32, 0.5, 0.4]);
  const duodenumWall = smoothUnion(0.03, hollow(duoOuter, 0.05, plicae), intersect(papilla, duoOuter));
  const duodenum = smoothSubtract(0.015, duodenumWall, duoWindow);

  // --- head of pancreas, sectioned in the coronal plane to expose the ducts
  const lobes = worley3(53);
  const pancreasCut = plane([0, 0, 1], -0.03);
  const pancreasHead = displace(smoothUnion(0.18,
    ellipsoid([-0.56, -1.2, -0.14], [0.36, 0.42, 0.3]),
    ellipsoid([-0.1, -1.48, -0.16], [0.42, 0.22, 0.24]),
  ), (x, y, z) => smoothstep(0.0, 0.2, lobes(x * 9, y * 9, z * 9).f2 - lobes(x * 9, y * 9, z * 9).f1) * -0.9, 0.03);
  const pancreas = subtract(intersect(pancreasHead, pancreasCut), duoOuter);

  const s = new Specimen("gallbladder", { cell: 0.012 });
  const serosa = tissue({ base: "#8ea463", dark: "#5c7642", light: "#cad89e", capillary: "#8a5b3d", seed: 5, scale: 3, capillaryAmount: 0.25 });
  const mucosa = (c) => {
    const r = honey(c.x * 11, c.y * 11, c.z * 11);
    const ridge = 1 - smoothstep(0.0, 0.12, r.f2 - r.f1);
    return mix(mix(color("#9aa53e"), color("#7b8a30"), r.id), color("#efe7a4"), ridge * 0.9);
  };
  const layers = [[0.012, color("#f1e5c2")], [0.03, color("#b7a35f")], [1, color("#d4cf74")]];
  s.field("Gallbladder", sac, {
    simplify: { ratio: 0.4, error: 0.0015 },
    paint: (c) => {
      const depth = -sacOuter.d(c.x, c.y, c.z);
      if (depth > WALL * 0.5) return mucosa(c);
      if (sacWindow.d(c.x, c.y, c.z) < 0.03 && depth > 0.004) return layers.find(([limit]) => depth <= limit)[1];
      return serosa(c);
    },
  });

  const bile = tissue({ base: "#a6b54a", dark: "#6f7f2a", light: "#dfe39a", seed: 6, scale: 6, crestAmount: 0.45 });
  const lumen = color("#4f5a20");
  const ductPaint = (c) => (c.cap ? lumen : bile(c));
  s.field("Cystic duct", cysticDuct, { material: "mucosa", paint: ductPaint, simplify: { ratio: 0.5, error: 0.001 } });
  s.field("Hepatic ducts", intersect(smoothUnion(0.03, hepaticRight, hepaticLeft, commonHepatic), plane([0, 1, 0], 1.58)), {
    material: "mucosa", paint: ductPaint, caps: [{ normal: new THREE.Vector3(0, 1, 0), offset: 1.58 }], simplify: { ratio: 0.5, error: 0.001 },
  });
  s.field("Common bile duct", smoothUnion(0.03, commonBile, cysticDuct), { material: "mucosa", paint: ductPaint, simplify: { ratio: 0.5, error: 0.001 } });
  s.field("Pancreatic duct", pancreaticDuct, { material: "mucosa", paint: (c) => mix(color("#e6d29a"), color("#c9a86a"), smoothstep(0, 0.6, c.curv)), simplify: { ratio: 0.5, error: 0.001 } });

  const duoSerosa = tissue({ base: "#e4a28c", dark: "#c06f62", light: "#f6cdb9", capillary: "#b44a48", seed: 7, scale: 3, capillaryAmount: 0.35 });
  const duoMucosa = tissue({ base: "#d77c74", dark: "#a84a4f", light: "#f2b0a0", seed: 9, scale: 6, crestAmount: 0.65 });
  s.field("Duodenum", duodenum, {
    simplify: { ratio: 0.36, error: 0.0015 },
    paint: (c) => {
      const depth = -duoOuter.d(c.x, c.y, c.z);
      if (papilla.d(c.x, c.y, c.z) < 0.02 && depth > 0.03) return mix(color("#c95a5e"), color("#7d3b2c"), smoothstep(0.03, -0.02, papilla.d(c.x, c.y, c.z) + 0.05));
      if (depth > 0.025) return duoMucosa(c);
      if (duoWindow.d(c.x, c.y, c.z) < 0.03 && depth > 0.004) return depth < 0.012 ? color("#efcdb8") : color("#b9504c");
      return duoSerosa(c);
    },
  });

  const parenchyma = tissue({ base: "#e8bf7c", dark: "#c48a4f", light: "#f6deaa", capillary: "#c76b4c", seed: 10, scale: 7, capillaryAmount: 0.2 });
  s.field("Head of pancreas", pancreas, {
    simplify: { ratio: 0.4, error: 0.0015 },
    caps: [{ normal: new THREE.Vector3(0, 0, 1), offset: -0.03 }],
    paint: (c) => {
      const l = lobes(c.x * 9, c.y * 9, c.z * 9);
      const septa = 1 - smoothstep(0.0, 0.12, l.f2 - l.f1);
      if (c.cap) return mix(mix(color("#f2d29a"), color("#d9a05f"), l.id * 0.9), color("#a8744a"), septa);
      return mix(parenchyma(c), color("#c9945b"), septa * 0.35);
    },
  });

  // --- arteries and portal vein
  const arteryPaint = (c) => mix(color("#b8313a"), color("#e86a5c"), smoothstep(0.1, 0.95, c.ny * 0.4 + c.nz * 0.7) * 0.55);
  const arteries = [
    taperedTube([[-0.12, -0.55, 0.28], [-0.18, 0.2, 0.22], [-0.22, 0.95, 0.18], [-0.24, 1.18, 0.16]], 0.042, { radial: 14 }),
    taperedTube([[-0.24, 1.18, 0.16], [-0.06, 1.34, 0.12], [0.16, 1.5, 0.06], [0.28, 1.62, 0.0]], (t) => 0.036 - 0.01 * t, { radial: 14 }),
    taperedTube([[-0.24, 1.18, 0.16], [-0.5, 1.36, 0.16], [-0.8, 1.52, 0.1], [-1.0, 1.62, 0.04]], (t) => 0.034 - 0.01 * t, { radial: 14 }),
  ];
  const cysticArtery = [[-0.1, 1.36, 0.14], [0.06, 1.02, 0.16], [0.12, 0.72, 0.2], [0.16, 0.5, 0.2]];
  arteries.push(taperedTube(cysticArtery, (t) => 0.024 - 0.006 * t, { radial: 12 }));
  const keep = (p) => sacWindow.d(p.x, p.y, p.z) > 0.04;
  arteries.push(vesselGeometry(growVessels(sacOuter, {
    seed: 61,
    roots: [
      { at: [0.22, 0.42, 0.3], dir: [0.4, -1, 0.1], radius: 0.017, length: 1.6, generations: 3 },
      { at: [0.3, 0.38, -0.25], dir: [0.3, -1, -0.2], radius: 0.016, length: 1.5, generations: 3 },
    ],
    step: 0.022, hug: 0.4, keep, branchEvery: 0.16, minRadius: 0.004,
  }), { radial: 8 }));
  s.mesh("Cystic and hepatic arteries", merge(arteries), { material: "vessel", paint: arteryPaint, shading: { cavity: 0.2 } });
  const portal = merge([
    taperedTube([[-0.2, -0.9, -0.46], [-0.3, -0.2, -0.42], [-0.34, 0.7, -0.36], [-0.36, 1.18, -0.34]], 0.12, { radial: 20 }),
    taperedTube([[-0.36, 1.18, -0.34], [-0.06, 1.42, -0.34], [0.3, 1.62, -0.3]], 0.09, { radial: 18 }),
    taperedTube([[-0.36, 1.18, -0.34], [-0.7, 1.42, -0.34], [-1.04, 1.62, -0.3]], 0.085, { radial: 18 }),
  ]);
  s.mesh("Portal vein", portal, { material: "vessel", paint: (c) => mix(color("#4a4f93"), color("#7f86c6"), smoothstep(0.1, 0.95, c.ny * 0.4 + c.nz * 0.7) * 0.5), shading: { cavity: 0.2 } });

  s.anchor("fundus", "Gallbladder", [0.85, -1.7, 0.15]);
  s.anchor("body", "Gallbladder", [0.1, -0.3, 0.38]);
  s.anchor("mucosa", "Gallbladder", [0.58, -0.55, -0.3]);
  s.anchor("neck", "Gallbladder", [0.2, 0.48, 0.24]);
  s.anchor("cystic-duct", "Cystic duct", [-0.2, 0.86, 0.06]);
  s.anchor("common-hepatic-duct", "Hepatic ducts", [-0.44, 1.05, 0.06]);
  s.anchor("common-bile-duct", "Common bile duct", [-0.46, 0.0, 0.06]);
  s.anchor("papilla", "Duodenum", [-0.92, -1.36, 0.06]);
  s.anchor("cystic-artery", "Cystic and hepatic arteries", [0.08, 0.95, 0.22]);
  return s;
}
