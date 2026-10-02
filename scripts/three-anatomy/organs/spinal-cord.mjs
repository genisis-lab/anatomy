import * as THREE from "three";
import { Specimen } from "../kit/bake.mjs";
import { box, capsule, ellipsoid, roundCone, smoothSubtract, smoothUnion, subtract, union } from "../kit/sdf.mjs";
import { fbm3, simplex3 } from "../kit/noise.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { ellipsoidGeometry, growVessels, merge, taperedTube } from "../kit/geometry.mjs";

// Left: the whole cord at true proportions with all 31 nerve pairs.
// Right: one segment enlarged and opened to show its internal anatomy.
const CORD_X = -0.95;
const CORD_TOP = 1.86, CONUS = -0.66, CANAL_BOTTOM = -1.9;
// The enlarged segment is authored around its own centre, then tilted so
// its sectioned top faces the viewer.
const SEG_X = 0, SEG_TOP = 0.66, SEG_BOTTOM = -0.66;
const SEG_PLACE = { position: [0.52, 0.5, 0.0], rotation: [0.62, -0.32, 0.0] };

const nervePaint = (c) => mix(color("#eed06d"), color("#c79a3a"), smoothstep(0.0, 0.8, c.curv + 0.3) * 0.5);

function cordRadius(y) {
  const t = (CORD_TOP - y) / (CORD_TOP - CONUS);
  const cervical = 0.016 * Math.exp(-(((t - 0.17) / 0.08) ** 2));
  const lumbar = 0.013 * Math.exp(-(((t - 0.86) / 0.06) ** 2));
  const conus = t > 0.9 ? (t - 0.9) / 0.1 : 0;
  return Math.max(0.006, (0.048 + cervical + lumbar) * (1 - conus * 0.85));
}

/** Butterfly-shaped grey matter in the transverse plane (x, z), extruded in y. */
function greyMatter(cx, y0, y1) {
  const horns = smoothUnion(0.035,
    capsule([cx - 0.07, 0, 0.0], [cx + 0.07, 0, 0.0], 0.03),
    capsule([cx - 0.07, 0, 0.0], [cx - 0.11, 0, 0.1], 0.06),
    capsule([cx + 0.07, 0, 0.0], [cx + 0.11, 0, 0.1], 0.06),
    capsule([cx - 0.05, 0, -0.02], [cx - 0.15, 0, -0.17], 0.026),
    capsule([cx + 0.05, 0, -0.02], [cx + 0.15, 0, -0.17], 0.026),
  );
  return {
    d: (x, y, z) => Math.max(horns.d(x, 0, z), y - y1, y0 - y),
    b: [cx - 0.25, y0 - 0.01, -0.25, cx + 0.25, y1 + 0.01, 0.25],
  };
}

export function build() {
  const noise = simplex3(141);
  const lumpy = fbm3(noise, 3);
  const s = new Specimen("spinal-cord", { cell: 0.009 });

  // ------------------------------------------------------------ whole cord
  const axis = [];
  for (let i = 0; i <= 120; i += 1) {
    const y = CORD_TOP + (CONUS - 0.1 - CORD_TOP) * (i / 120);
    axis.push([CORD_X + Math.sin(y * 1.3) * 0.015, y, 0]);
  }
  const cord = taperedTube(axis, (t) => cordRadius(axis[Math.round(t * (axis.length - 1))][1]), { radial: 28, segments: 240, caps: "start" });
  s.mesh("Spinal cord", cord, {
    paint: tissue({ base: "#f2ddcf", dark: "#d6b0a0", light: "#fdf1e8", capillary: "#d0707a", seed: 142, scale: 12, capillaryScale: 22, capillaryAmount: 0.45 }),
  });

  // 31 pairs: roots leave their cord segment and descend to their foramen;
  // below the conus they form the cauda equina.
  const roots = [];
  const ganglia = [];
  for (let k = 0; k < 31; k += 1) {
    const t = k / 30;
    const yc = CORD_TOP - 0.04 - (CORD_TOP - 0.04 - (CONUS + 0.02)) * Math.pow(t, 1.05);
    const yv = CORD_TOP - 0.06 - (CORD_TOP - 0.06 - (CANAL_BOTTOM + 0.04)) * t;
    for (const side of [-1, 1]) {
      const r = cordRadius(yc);
      const exitX = CORD_X + side * (0.12 + 0.03 * Math.sin(t * Math.PI));
      const start = [CORD_X + side * r * 0.9, yc, 0];
      const drop = yc - yv;
      const path = drop > 0.2
        ? [start, [CORD_X + side * (r + 0.012 + 0.012 * (k % 3)), yc - drop * 0.25, -0.005], [CORD_X + side * (0.03 + 0.003 * k), yv + 0.08, -0.01], [exitX, yv, 0]]
        : [start, [CORD_X + side * (r + 0.04), yc - drop * 0.5, 0], [exitX, yv, 0]];
      roots.push(taperedTube(path, 0.0095 - 0.002 * t, { radial: 7, segments: Math.max(10, Math.round(drop * 18)) }));
      ganglia.push(ellipsoidGeometry([exitX + side * 0.025, yv - 0.005, 0], [0.026, 0.018, 0.02], { width: 14, height: 10 }));
      roots.push(taperedTube([[exitX + side * 0.04, yv - 0.01, 0], [exitX + side * 0.11, yv - 0.05, 0.02], [exitX + side * 0.17, yv - 0.1, 0.03]], (u) => 0.013 - 0.004 * u, { radial: 8, segments: 10 }));
    }
  }
  // Filum terminale anchors the conus to the coccyx.
  roots.push(taperedTube([[CORD_X, CONUS - 0.08, 0], [CORD_X, -1.3, 0], [CORD_X, CANAL_BOTTOM, 0]], 0.005, { radial: 8 }));
  s.mesh("Spinal nerve roots", merge(roots), { material: "nerve", paint: nervePaint, shading: { cavity: 0.2, ao: 0.6 } });
  s.mesh("Spinal ganglia", merge(ganglia), { material: "nerve", paint: (c) => mix(color("#e7bf5c"), color("#c18a33"), lumpy(c.x * 30, c.y * 30, c.z * 30) * 0.5 + 0.5) });

  // ------------------------------------------------------------ enlarged segment
  const R = { x: 0.3, z: 0.22 };
  const segmentOuter = {
    d: (x, y, z) => {
      const px = (x - SEG_X) / R.x, pz = z / R.z;
      const k0 = Math.hypot(px, pz);
      const k1 = Math.hypot(px / R.x, pz / R.z);
      const ell = k0 < 1e-9 ? -Math.min(R.x, R.z) : (k0 * (k0 - 1)) / k1;
      return Math.max(ell, y - SEG_TOP, SEG_BOTTOM - y);
    },
    b: [SEG_X - R.x - 0.02, SEG_BOTTOM - 0.02, -R.z - 0.02, SEG_X + R.x + 0.02, SEG_TOP + 0.02, R.z + 0.02],
  };
  const fissure = box([SEG_X, (SEG_TOP + SEG_BOTTOM) / 2, R.z], [0.012, 1, 0.08], 0.006);
  const sulcus = box([SEG_X, (SEG_TOP + SEG_BOTTOM) / 2, -R.z], [0.006, 1, 0.07], 0.004);
  const grey = greyMatter(SEG_X, SEG_BOTTOM + 0.02, SEG_TOP + 0.012);
  const white = subtract(smoothSubtract(0.01, segmentOuter, fissure, sulcus), grey);
  s.field("White matter", white, {
    place: SEG_PLACE,
    cell: 0.008,
    caps: [{ normal: new THREE.Vector3(0, 1, 0), offset: SEG_TOP }, { normal: new THREE.Vector3(0, -1, 0), offset: -SEG_BOTTOM }],
    simplify: { ratio: 0.4, error: 0.0008 },
    paint: (c) => (c.cap ? mix(color("#f7efe4"), color("#ecdcc8"), lumpy(c.x * 20, c.y * 20, c.z * 20) * 0.5 + 0.5)
      : tissue({ base: "#f1d8c8", dark: "#d4a898", light: "#fcefe6", capillary: "#cf6a74", seed: 143, scale: 8, capillaryScale: 12, capillaryAmount: 0.5 })(c)),
  });
  s.field("Grey matter", subtract(grey, capsule([SEG_X, SEG_BOTTOM, 0], [SEG_X, SEG_TOP + 0.1, 0], 0.012)), {
    place: SEG_PLACE,
    simplify: { ratio: 0.25, error: 0.0008 },
    cell: 0.005,
    caps: [{ normal: new THREE.Vector3(0, 1, 0), offset: SEG_TOP + 0.012 }],
    paint: (c) => (c.cap ? mix(color("#bf8f8c"), color("#a8727a"), lumpy(c.x * 30, c.y * 30, c.z * 30) * 0.5 + 0.5) : color("#b98583")),
  });

  // Rootlets fan from the dorsolateral and ventrolateral sulci into roots,
  // which meet beyond the dorsal root ganglion as the spinal nerve.
  const levels = [0.3, -0.3];
  const segRoots = [];
  const segGanglia = [];
  const rami = [];
  for (const y of levels) {
    for (const side of [-1, 1]) {
      const dorsalJoin = [SEG_X + side * 0.52, y - 0.04, -0.1];
      const ventralJoin = [SEG_X + side * 0.52, y - 0.08, 0.08];
      for (let i = 0; i < 6; i += 1) {
        const yy = y + 0.13 - i * 0.05;
        segRoots.push(taperedTube([[SEG_X + side * 0.2, yy, -0.14], [SEG_X + side * 0.34, yy - 0.01 - i * 0.004, -0.13], dorsalJoin], 0.011, { radial: 8 }));
        segRoots.push(taperedTube([[SEG_X + side * 0.22, yy - 0.03, 0.12], [SEG_X + side * 0.36, yy - 0.05, 0.11], ventralJoin], 0.0095, { radial: 8 }));
      }
      const ganglion = [SEG_X + side * 0.66, y - 0.06, -0.08];
      segRoots.push(taperedTube([dorsalJoin, ganglion], 0.032, { radial: 12 }));
      segGanglia.push(ellipsoid(ganglion, [0.1, 0.065, 0.065]));
      const nerveStart = [SEG_X + side * 0.78, y - 0.1, 0.0];
      segRoots.push(taperedTube([ventralJoin, [SEG_X + side * 0.66, y - 0.1, 0.06], nerveStart], 0.03, { radial: 12 }));
      rami.push(taperedTube([[SEG_X + side * 0.74, y - 0.08, -0.04], nerveStart, [SEG_X + side * 0.9, y - 0.14, 0.02], [SEG_X + side * 1.0, y - 0.2, 0.06]], (u) => 0.05 - 0.008 * u, { radial: 14 }));
      rami.push(taperedTube([[SEG_X + side * 0.9, y - 0.14, 0.02], [SEG_X + side * 0.96, y - 0.12, -0.12], [SEG_X + side * 0.98, y - 0.1, -0.24]], 0.022, { radial: 10 }));
    }
  }
  s.mesh("Dorsal and ventral roots", merge(segRoots), { place: SEG_PLACE, material: "nerve", paint: nervePaint, shading: { cavity: 0.25 } });
  s.field("Dorsal root ganglia", union(segGanglia), { place: SEG_PLACE, cell: 0.007, material: "nerve", paint: (c) => mix(color("#e6bb58"), color("#bf8633"), lumpy(c.x * 18, c.y * 18, c.z * 18) * 0.5 + 0.5) });
  s.mesh("Spinal nerves", merge(rami), { place: SEG_PLACE, material: "nerve", paint: nervePaint });

  // Dura mater, opened in front and folded back, with its root sleeves.
  const duraTube = {
    d: (x, y, z) => Math.max(Math.abs(Math.hypot((x - SEG_X) / 1.15, z) - 0.36) - 0.016, y - (SEG_TOP - 0.1), SEG_BOTTOM + 0.04 - y),
    b: [SEG_X - 0.48, SEG_BOTTOM, -0.42, SEG_X + 0.48, SEG_TOP, 0.42],
  };
  const sleeves = union(levels.flatMap((y) => [-1, 1].map((side) => {
    const a = new THREE.Vector3(SEG_X + side * 0.4, y - 0.06, -0.02), b = new THREE.Vector3(SEG_X + side * 0.62, y - 0.07, -0.04);
    return roundCone(a, b, 0.13, 0.1);
  })));
  const sleeveHollow = union(levels.flatMap((y) => [-1, 1].map((side) => roundCone([SEG_X + side * 0.3, y - 0.06, -0.02], [SEG_X + side * 0.66, y - 0.07, -0.04], 0.11, 0.085))));
  const dura = subtract(union(duraTube, subtract(sleeves, sleeveHollow, { d: (x, y, z) => Math.hypot((x - SEG_X) / 1.15, z) - 0.35, b: duraTube.b })), box([SEG_X, 0.0, 0.42], [0.36, 0.62, 0.3], 0.02), box([SEG_X, 0.0, 0.42], [0.5, 0.62, 0.15], 0.02));
  s.field("Dura mater", dura, {
    place: SEG_PLACE,
    cell: 0.007,
    simplify: { ratio: 0.3, error: 0.0008 },
    material: "cartilage",
    paint: tissue({ base: "#e4dde0", dark: "#bdb0b8", light: "#f7f3f2", capillary: "#c47a80", seed: 144, scale: 6, capillaryAmount: 0.3 }),
    shading: { ao: 0.7 },
  });

  // Spinal arteries: anterior in the median fissure, paired posterior, and
  // radicular branches along the roots.
  const arteries = [taperedTube([[SEG_X, SEG_BOTTOM + 0.02, R.z - 0.005], [SEG_X, SEG_TOP - 0.02, R.z - 0.005]], 0.016, { radial: 10 })];
  for (const side of [-1, 1]) arteries.push(taperedTube([[SEG_X + side * 0.2, SEG_BOTTOM + 0.02, -0.16], [SEG_X + side * 0.21, SEG_TOP - 0.02, -0.16]], 0.011, { radial: 8 }));
  for (const y of levels) for (const side of [-1, 1]) arteries.push(taperedTube([[SEG_X + side * 0.7, y - 0.14, 0.08], [SEG_X + side * 0.4, y - 0.11, 0.12], [SEG_X + side * 0.04, y - 0.08, R.z]], 0.01, { radial: 8 }));
  const surface = segmentOuter;
  const keep = (p) => p.y < SEG_TOP - 0.03 && p.y > SEG_BOTTOM + 0.03;
  const venous = growVessels(surface, {
    seed: 145,
    roots: [{ at: [SEG_X + 0.05, SEG_TOP - 0.06, -0.21], dir: [0.1, -1, 0], radius: 0.012, length: 1.2, generations: 3 }],
    step: 0.016, hug: 0.5, keep, branchEvery: 0.12, wander: 0.5, minRadius: 0.004,
  });
  s.mesh("Spinal arteries", merge(arteries), { place: SEG_PLACE, material: "vessel", paint: (c) => mix(color("#b8323a"), color("#e5675b"), smoothstep(0.1, 0.9, c.ny * 0.3 + c.nz * 0.7) * 0.5) });
  if (venous.length) s.mesh("Spinal veins", merge(venous.map(({ points, radii }) => taperedTube(points, radii[0] * 0.9, { radial: 8 }))), { place: SEG_PLACE, material: "vessel", paint: () => color("#5a64a8") });

  s.anchor("cervical", "Spinal cord", [CORD_X + 0.06, 1.5, 0.04]);
  s.anchor("thoracic", "Spinal cord", [CORD_X + 0.05, 0.6, 0.04]);
  s.anchor("lumbar", "Spinal cord", [CORD_X + 0.06, -0.45, 0.04]);
  s.anchor("cauda", "Spinal nerve roots", [CORD_X + 0.03, -1.3, 0.01]);
  s.anchor("grey-matter", "Grey matter", [SEG_X + 0.1, SEG_TOP + 0.012, 0.1]);
  s.anchor("white-matter", "White matter", [SEG_X - 0.2, SEG_TOP, -0.05]);
  s.anchor("dorsal-root", "Dorsal and ventral roots", [SEG_X + 0.34, 0.3, -0.13]);
  s.anchor("ventral-root", "Dorsal and ventral roots", [SEG_X - 0.36, -0.34, 0.12]);
  s.anchor("ganglion", "Dorsal root ganglia", [SEG_X + 0.66, 0.24, 0.0]);
  s.anchor("dura", "Dura mater", [SEG_X - 0.42, 0.0, 0.2]);
  s.anchor("spinal-artery", "Spinal arteries", [SEG_X, 0.0, R.z]);
  return s;
}

