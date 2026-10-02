import { Specimen } from "../kit/bake.mjs";
import { color, mix, smoothstep } from "../kit/paint.mjs";
import { simplex3 } from "../kit/noise.mjs";
import { merge } from "../kit/geometry.mjs";
import { bodyFrame, ensureScans, scanGroup, SCAN_IDS } from "../kit/scans.mjs";
import { boneTissue, cartilageTissue } from "./skeleton.mjs";

// The superficial muscular system from registered BodyParts3D scans, over a
// lighter skeletal scaffold. Deep muscles hidden beneath others are left out.

const DEEP = /internal oblique|transversus abdominis|vastus intermedius|iliacus|psoas major|obturator internus|piriformis|quadratus femoris|quadratus lumborum|subscapularis|popliteus|plantaris|tibialis posterior|flexor digitorum longus|pectoralis minor|adductor brevis|rhomboid|platysma/;
const LARGE = /gluteus maximus|latissimus|trapezius|pectoralis major|external oblique|rectus abdominis|vastus|rectus femoris|sartorius|gastrocnemius|soleus|deltoid|biceps femoris|adductor magnus|serratus/;

const GROUPS = [
  ["Muscles of the head and neck", /temporalis|masseter|frontalis|occipitofrontalis|sternocleidomastoid|splenius|levator scapulae/],
  ["Deltoid", /deltoid/],
  ["Trapezius", /trapezius/],
  ["Pectoralis major", /pectoralis major/],
  ["Latissimus dorsi and teres", /latissimus|teres|infraspinatus|supraspinatus/],
  ["Serratus anterior", /serratus/],
  ["Abdominal wall", /rectus abdominis|external oblique/],
  ["Arm muscles", /biceps brachii|triceps|brachialis$|coracobrachialis|anconeus/],
  ["Forearm muscles", /brachioradialis|pronator|carpi|digitorum superficialis|extensor digitorum$|palmaris|abductor pollicis/],
  ["Gluteal muscles", /gluteus|tensor fasciae latae/],
  ["Quadriceps femoris", /vastus|rectus femoris/],
  ["Medial and anterior thigh", /sartorius|gracilis|adductor|pectineus/],
  ["Hamstrings", /biceps femoris|semitendinosus|semimembranosus/],
  ["Calf muscles", /gastrocnemius|soleus/],
  ["Anterior and lateral leg", /tibialis anterior|fibularis|peroneus|extensor digitorum longus|extensor hallucis/],
];

export async function build() {
  const muscles = SCAN_IDS.muscles.filter(([, name]) => !DEEP.test(name));
  const bones = SCAN_IDS.skeleton;
  await ensureScans([...muscles, ...Object.values(bones).flat()].map(([id]) => id));
  const frame = bodyFrame();
  const s = new Specimen("muscles", { occlusion: { resolution: 210, reach: 0.05 } });

  // Skeletal scaffold, lighter than the standalone skeleton.
  const bone = boneTissue(221);
  const scaffold = [];
  for (const [key, target] of [["skull", 1100], ["mandible", 1500], ["vertebrae", 450], ["ribs", 450], ["sternum", 400], ["girdle", 900], ["arm", 1000], ["hand", 120], ["pelvis", 2000], ["leg", 1200], ["foot", 120]]) {
    scaffold.push(...scanGroup(bones[key], { target, transform: frame }).geometries);
  }
  const skeleton = merge(scaffold);
  s.mesh("Skeleton", skeleton, { material: "bone", paint: bone(skeleton.userData.axial), shading: { ao: 0.9, cavity: 0.7 } });
  const costal = merge(scanGroup(bones.costal, { target: 400, transform: frame }).geometries);
  s.mesh("Costal cartilages", costal, { material: "cartilage", paint: cartilageTissue });

  // Muscle painter: fascicles run along each muscle's principal axis and
  // give way to pale tendon at its ends.
  const fibreNoise = simplex3(222);
  const belly = color("#b7423c"), deep = color("#7c2328"), sheen = color("#e1806e"), tendon = color("#efe6d5");
  const musclePaint = (geometry) => {
    const { axial, around, member } = geometry.userData;
    return (c) => {
      const t = axial[c.index];
      const stripe = 0.5 + 0.5 * Math.sin(around[c.index] * 26 + member[c.index] * 1.7 + fibreNoise(c.x * 3, c.y * 3, c.z * 3) * 2.2);
      let tone = mix(mix(belly, deep, stripe * 0.55), sheen, smoothstep(0.1, 0.7, -c.curv) * 0.35);
      tone = mix(tone, tendon, smoothstep(0.78, 0.95, Math.abs(t)) * 0.85);
      return tone;
    };
  };
  const used = new Set();
  for (const [name, pattern] of GROUPS) {
    const entries = muscles.filter(([, muscle]) => pattern.test(muscle) && !used.has(muscle));
    entries.forEach(([, muscle]) => used.add(muscle));
    if (!entries.length) continue;
    const { geometries } = scanGroup(entries, { target: (muscle) => (LARGE.test(muscle) ? 3000 : 1600), transform: frame });
    const geometry = merge(geometries);
    s.mesh(name, geometry, { material: "muscle", paint: musclePaint(geometry), shading: { ao: 0.85, cavity: 0.6, saturate: 1 } });
  }

  s.anchor("deltoid", "Deltoid", [0.5, 1.15, 0.15]);
  s.anchor("pectoralis", "Pectoralis major", [0.25, 0.95, 0.42]);
  s.anchor("biceps", "Arm muscles", [0.52, 0.78, 0.2]);
  s.anchor("rectus", "Abdominal wall", [0.08, 0.35, 0.45]);
  s.anchor("sternocleidomastoid", "Muscles of the head and neck", [0.12, 1.45, 0.25]);
  s.anchor("quadriceps", "Quadriceps femoris", [0.22, -0.5, 0.35]);
  s.anchor("sartorius", "Medial and anterior thigh", [0.12, -0.35, 0.3]);
  s.anchor("tibialis", "Anterior and lateral leg", [0.2, -1.45, 0.2]);
  s.anchor("gastrocnemius", "Calf muscles", [-0.2, -1.25, -0.1]);
  s.anchor("gluteus", "Gluteal muscles", [-0.22, -0.05, -0.25]);
  s.anchor("trapezius", "Trapezius", [-0.15, 1.2, -0.2]);
  return s;
}
