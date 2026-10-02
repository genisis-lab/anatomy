import { Specimen } from "../kit/bake.mjs";
import { color, mix, smoothstep, tissue } from "../kit/paint.mjs";
import { merge } from "../kit/geometry.mjs";
import { bodyFrame, ensureScans, scanGroup, SCAN_IDS } from "../kit/scans.mjs";

// The complete adult skeleton from registered BodyParts3D scans: 265 bones,
// cartilages and discs, smoothed, simplified and painted in Three.js.

export const boneTissue = (seed) => {
  const base = tissue({ base: "#e2cca2", dark: "#b28a58", light: "#f8eedb", capillary: "#b98a5e", seed, scale: 7, capillaryScale: 9, capillaryAmount: 0.22, mottleAmount: 0.6, crestAmount: 0.55 });
  const cartilage = color("#eeeadb");
  // Articular ends of long bones are capped with smooth, paler cartilage.
  return (axial) => (c) => {
    const t = axial ? Math.abs(axial[c.index]) : 0;
    return mix(base(c), cartilage, smoothstep(0.86, 0.97, t) * 0.55);
  };
};

export const cartilageTissue = tissue({ base: "#d6dfd8", dark: "#a5b4aa", light: "#f1f5f0", capillary: "#c9a6a4", seed: 211, scale: 6, capillaryAmount: 0.12, crestAmount: 0.5 });

export async function build() {
  const groups = SCAN_IDS.skeleton;
  await ensureScans(Object.values(groups).flat().map(([id]) => id));
  const frame = bodyFrame();
  const s = new Specimen("skeleton", { occlusion: { resolution: 200, reach: 0.06 } });
  const bone = boneTissue(212);
  const part = (name, entries, target, paint, material = "bone") => {
    const { geometries } = scanGroup(entries, { target, transform: frame });
    const geometry = merge(geometries);
    s.mesh(name, geometry, { material, paint: paint(geometry.userData.axial), shading: { ao: 0.92, cavity: 0.75, saturate: 1 } });
  };
  const byName = (entries, pattern) => entries.filter(([, name]) => pattern.test(name));
  const big = /frontal|parietal|occipital|temporal|sphenoid/;

  part("Skull", groups.skull, (name) => (big.test(name) ? 5200 : 1800), () => bone(null));
  part("Mandible", groups.mandible, 5000, () => bone(null));
  part("Teeth", groups.teeth, 450, () => tissue({ base: "#f6f1e4", dark: "#d8c9a8", light: "#fffbf2", seed: 213, scale: 20 }), "enamel");
  part("Hyoid bone", groups.hyoid, 800, () => bone(null));
  part("Vertebral column", groups.vertebrae, (name) => (name === "sacrum" ? 4200 : 1800), () => bone(null));
  part("Intervertebral discs", groups.discs, 600, () => cartilageTissue, "cartilage");
  part("Ribs", groups.ribs, 1500, bone);
  part("Costal cartilages", groups.costal, 700, () => cartilageTissue, "cartilage");
  part("Sternum", groups.sternum, 1500, () => bone(null));
  part("Clavicles", byName(groups.girdle, /clavicle/), 2200, bone);
  part("Scapulae", byName(groups.girdle, /scapula/), 3600, () => bone(null));
  part("Humeri", byName(groups.arm, /humerus/), 3600, bone);
  part("Radius and ulna", byName(groups.arm, /radius|ulna/), 2600, bone);
  part("Hand bones", groups.hand, 380, bone);
  part("Pelvis", groups.pelvis, 7000, () => bone(null));
  part("Femora", byName(groups.leg, /femur/), 4200, bone);
  part("Patellae", byName(groups.leg, /patella/), 1200, () => bone(null));
  part("Tibia and fibula", byName(groups.leg, /tibia|fibula/), 3200, bone);
  part("Foot bones", groups.foot, 420, bone);

  s.anchor("skull", "Skull", [0.0, 1.95, 0.25]);
  s.anchor("spine", "Vertebral column", [0.0, 0.4, -0.12]);
  s.anchor("ribcage", "Ribs", [0.3, 0.92, 0.28]);
  s.anchor("sternum", "Sternum", [0.0, 0.95, 0.4]);
  s.anchor("clavicle", "Clavicles", [0.2, 1.28, 0.2]);
  s.anchor("humerus", "Humeri", [0.48, 0.85, 0.0]);
  s.anchor("pelvis", "Pelvis", [0.25, 0.03, 0.2]);
  s.anchor("hand", "Hand bones", [0.66, -0.2, 0.1]);
  s.anchor("femur", "Femora", [0.22, -0.48, 0.05]);
  s.anchor("patella", "Patellae", [0.21, -1.0, 0.1]);
  s.anchor("foot", "Foot bones", [0.22, -2.0, 0.25]);
  return s;
}
