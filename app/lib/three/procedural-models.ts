import * as THREE from "three";

type MaterialSet = {
  primary: THREE.MeshStandardMaterial;
  secondary: THREE.MeshStandardMaterial;
  pale: THREE.MeshStandardMaterial;
  vessel: THREE.MeshStandardMaterial;
};

function material(color: number, roughness = 0.56) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function materials(accent: number): MaterialSet {
  const base = new THREE.Color(accent);
  const secondary = base.clone().lerp(new THREE.Color(0xffd8c9), 0.32);
  return {
    primary: material(base.getHex(), 0.52),
    secondary: material(secondary.getHex(), 0.58),
    pale: material(0xe9d7bb, 0.68),
    vessel: material(0x7f8fb2, 0.48),
  };
}

function add(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  surface: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  group.add(mesh);
  return mesh;
}

function tube(group: THREE.Group, points: Array<[number, number, number]>, radius: number, surface: THREE.Material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), closed, "catmullrom", 0.42);
  return add(group, new THREE.TubeGeometry(curve, Math.max(28, points.length * 10), radius, 12, closed), surface, [0, 0, 0]);
}

function bone(group: THREE.Group, from: [number, number, number], to: [number, number, number], radius: number, surface: THREE.Material) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const length = start.distanceTo(end);
  const mesh = add(group, new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 6, 12), surface, [midpoint.x, midpoint.y, midpoint.z]);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  return mesh;
}

function stomach() {
  const group = new THREE.Group();
  const m = materials(0xc96f61);
  add(group, new THREE.SphereGeometry(1, 48, 32), m.primary, [0.25, -0.2, 0], [0.82, 1.25, 0.62], [0, 0, -0.22]);
  add(group, new THREE.SphereGeometry(0.72, 40, 28), m.secondary, [0.55, 0.72, -0.02], [0.9, 0.75, 0.72]);
  tube(group, [[-0.35, 1.75, 0], [-0.35, 1.25, 0], [-0.18, 0.85, 0]], 0.18, m.secondary);
  tube(group, [[-0.12, -0.9, 0], [-0.55, -1.25, 0], [-0.95, -1.18, 0]], 0.2, m.secondary);
  tube(group, [[-0.12, 0.9, 0.5], [0.85, 0.45, 0.6], [0.88, -0.55, 0.45], [0.2, -1.05, 0.38]], 0.035, m.pale);
  return group;
}

function skeleton() {
  const group = new THREE.Group();
  const m = materials(0xc8ad83);
  add(group, new THREE.SphereGeometry(0.38, 28, 20), m.pale, [0, 1.62, 0], [0.88, 1.05, 0.82]);
  add(group, new THREE.BoxGeometry(0.34, 0.22, 0.3), m.pale, [0, 1.27, 0.02], [1, 1, 1]);
  bone(group, [0, 1.15, 0], [0, -0.65, 0], 0.075, m.pale);
  for (let i = 0; i < 6; i += 1) {
    const y = 0.98 - i * 0.23;
    const width = 0.62 + i * 0.055;
    const rib = add(group, new THREE.TorusGeometry(width, 0.035, 8, 36, Math.PI * 1.55), m.pale, [0, y, -0.03], [1, 0.62, 1], [Math.PI / 2, 0, -Math.PI * 0.77]);
    rib.rotation.y = 0.02;
  }
  bone(group, [-0.05, 1.12, 0], [-0.9, 0.9, 0], 0.06, m.pale);
  bone(group, [0.05, 1.12, 0], [0.9, 0.9, 0], 0.06, m.pale);
  bone(group, [-0.9, 0.9, 0], [-1.08, 0.1, 0], 0.055, m.pale);
  bone(group, [0.9, 0.9, 0], [1.08, 0.1, 0], 0.055, m.pale);
  bone(group, [-1.08, 0.1, 0], [-1.02, -0.55, 0], 0.045, m.pale);
  bone(group, [1.08, 0.1, 0], [1.02, -0.55, 0], 0.045, m.pale);
  add(group, new THREE.TorusGeometry(0.45, 0.11, 12, 32), m.pale, [0, -0.63, 0], [1, 0.6, 1], [Math.PI / 2, 0, 0]);
  bone(group, [-0.3, -0.72, 0], [-0.45, -1.55, 0], 0.075, m.pale);
  bone(group, [0.3, -0.72, 0], [0.45, -1.55, 0], 0.075, m.pale);
  bone(group, [-0.45, -1.55, 0], [-0.4, -2.25, 0.03], 0.055, m.pale);
  bone(group, [0.45, -1.55, 0], [0.4, -2.25, 0.03], 0.055, m.pale);
  return group;
}

function muscles() {
  const group = new THREE.Group();
  const m = materials(0xa94f48);
  add(group, new THREE.SphereGeometry(0.32, 28, 20), m.secondary, [0, 1.65, 0], [0.9, 1.08, 0.82]);
  add(group, new THREE.CapsuleGeometry(0.5, 1.15, 10, 28), m.primary, [0, 0.65, 0], [1, 1, 0.72]);
  add(group, new THREE.SphereGeometry(0.36, 24, 18), m.secondary, [-0.58, 1.06, 0], [0.8, 0.7, 0.82]);
  add(group, new THREE.SphereGeometry(0.36, 24, 18), m.secondary, [0.58, 1.06, 0], [0.8, 0.7, 0.82]);
  bone(group, [-0.68, 0.95, 0], [-0.94, -0.2, 0], 0.18, m.primary);
  bone(group, [0.68, 0.95, 0], [0.94, -0.2, 0], 0.18, m.primary);
  add(group, new THREE.SphereGeometry(0.46, 26, 20), m.secondary, [-0.34, -0.62, 0], [0.72, 0.75, 0.68]);
  add(group, new THREE.SphereGeometry(0.46, 26, 20), m.secondary, [0.34, -0.62, 0], [0.72, 0.75, 0.68]);
  bone(group, [-0.34, -0.62, 0], [-0.42, -1.62, 0], 0.22, m.primary);
  bone(group, [0.34, -0.62, 0], [0.42, -1.62, 0], 0.22, m.primary);
  bone(group, [-0.42, -1.62, 0], [-0.4, -2.25, 0.05], 0.15, m.secondary);
  bone(group, [0.42, -1.62, 0], [0.4, -2.25, 0.05], 0.15, m.secondary);
  tube(group, [[0, 1.25, 0.5], [0, 0.65, 0.55], [0, 0.05, 0.5]], 0.025, m.pale);
  return group;
}

function ear() {
  const group = new THREE.Group();
  const m = materials(0xc68170);
  add(group, new THREE.TorusGeometry(1.05, 0.28, 24, 60), m.primary, [-0.55, 0.1, 0], [0.8, 1.12, 0.55], [0, 0.18, 0]);
  add(group, new THREE.TorusGeometry(0.54, 0.16, 20, 48), m.secondary, [-0.55, 0.05, 0.28], [0.8, 1.08, 0.65], [0, 0.2, 0]);
  tube(group, [[-0.05, 0.05, 0.15], [0.45, 0.03, 0.1], [0.8, 0.05, 0]], 0.12, m.pale);
  add(group, new THREE.TorusGeometry(0.42, 0.12, 18, 48, Math.PI * 1.75), m.secondary, [1.05, -0.15, 0.05], [1, 1, 0.7], [0.15, 0, 0.2]);
  add(group, new THREE.TorusGeometry(0.52, 0.07, 12, 40, Math.PI * 1.35), m.vessel, [0.95, 0.72, 0], [0.65, 1, 0.7], [0.1, 0, -0.55]);
  add(group, new THREE.TorusGeometry(0.48, 0.07, 12, 40, Math.PI * 1.35), m.vessel, [1.24, 0.62, -0.02], [0.65, 1, 0.7], [0.1, 0, 0.52]);
  return group;
}

function spinalCord() {
  const group = new THREE.Group();
  const m = materials(0xcf9864);
  tube(group, [[0, 1.75, 0], [0.02, 0.9, 0], [-0.03, 0, 0], [0.02, -0.9, 0], [0, -1.65, 0]], 0.18, m.pale);
  for (let i = 0; i < 9; i += 1) {
    const y = 1.45 - i * 0.34;
    tube(group, [[0, y, 0], [-0.42, y - 0.06, 0.02], [-0.84, y - 0.15, 0.08]], 0.045, i % 2 ? m.secondary : m.vessel);
    tube(group, [[0, y, 0], [0.42, y - 0.06, 0.02], [0.84, y - 0.15, 0.08]], 0.045, i % 2 ? m.secondary : m.vessel);
  }
  for (let i = -2; i <= 2; i += 1) tube(group, [[0, -1.55, 0], [i * 0.1, -1.85, 0], [i * 0.22, -2.2, 0.03]], 0.035, m.secondary);
  return group;
}

function bladder() {
  const group = new THREE.Group();
  const m = materials(0xc9915e);
  add(group, new THREE.SphereGeometry(0.95, 44, 30), m.primary, [0, -0.15, 0], [0.85, 1.05, 0.72]);
  tube(group, [[-0.8, 1.55, 0], [-0.65, 0.8, 0], [-0.48, 0.45, 0.05]], 0.075, m.secondary);
  tube(group, [[0.8, 1.55, 0], [0.65, 0.8, 0], [0.48, 0.45, 0.05]], 0.075, m.secondary);
  tube(group, [[0, -0.95, 0], [0, -1.65, 0]], 0.11, m.secondary);
  add(group, new THREE.TorusGeometry(0.48, 0.035, 10, 36), m.pale, [0, -0.35, 0.7], [1, 0.55, 1], [Math.PI / 2, 0, 0]);
  return group;
}

function thyroid() {
  const group = new THREE.Group();
  const m = materials(0xb55f59);
  add(group, new THREE.CylinderGeometry(0.28, 0.28, 2.8, 28), m.pale, [0, 0, -0.32]);
  for (let i = -4; i <= 4; i += 1) add(group, new THREE.TorusGeometry(0.31, 0.025, 8, 28), m.vessel, [0, i * 0.25, -0.32], [1, 1, 1], [Math.PI / 2, 0, 0]);
  add(group, new THREE.CapsuleGeometry(0.38, 1.25, 12, 28), m.primary, [-0.52, 0, 0.05], [0.8, 1, 0.75], [0, 0, -0.12]);
  add(group, new THREE.CapsuleGeometry(0.38, 1.25, 12, 28), m.secondary, [0.52, 0, 0.05], [0.8, 1, 0.75], [0, 0, 0.12]);
  bone(group, [-0.3, -0.18, 0.05], [0.3, -0.18, 0.05], 0.15, m.primary);
  return group;
}

function lymphatic() {
  const group = new THREE.Group();
  const m = materials(0x9f5367);
  tube(group, [[0, 1.55, 0], [0, 0.65, 0], [0.05, -0.3, 0], [0, -1.55, 0]], 0.055, m.vessel);
  tube(group, [[0, 0.9, 0], [-0.72, 0.45, 0.05], [-1.02, -0.1, 0.03]], 0.038, m.vessel);
  tube(group, [[0, 0.72, 0], [0.72, 0.35, 0.05], [1.02, -0.2, 0.03]], 0.038, m.vessel);
  tube(group, [[0, -0.4, 0], [-0.52, -0.92, 0], [-0.62, -1.65, 0.03]], 0.04, m.vessel);
  tube(group, [[0, -0.4, 0], [0.52, -0.92, 0], [0.62, -1.65, 0.03]], 0.04, m.vessel);
  const nodes: Array<[number, number, number]> = [[0,1.35,0.04],[-.45,.75,.05],[.45,.72,.05],[-.85,.16,.05],[.82,.08,.05],[0,-.28,.08],[-.48,-.92,.06],[.5,-.94,.06],[-.6,-1.48,.04],[.62,-1.5,.04]];
  nodes.forEach((point, index) => add(group, new THREE.SphereGeometry(0.12, 20, 14), index % 2 ? m.secondary : m.primary, point));
  add(group, new THREE.SphereGeometry(0.62, 36, 24), m.primary, [1.02, 0.58, -0.08], [0.58, 1.12, 0.42], [0, 0, -0.35]);
  return group;
}

function femaleReproductive() {
  const group = new THREE.Group();
  const m = materials(0xb9617e);
  add(group, new THREE.SphereGeometry(0.72, 40, 28), m.primary, [0, 0.05, 0], [0.82, 1.02, 0.62]);
  add(group, new THREE.CapsuleGeometry(0.2, 0.55, 8, 20), m.secondary, [0, -0.92, 0], [0.75, 1, 0.7]);
  tube(group, [[-0.42, 0.55, 0], [-0.9, 0.92, 0], [-1.35, 0.75, 0.02]], 0.085, m.secondary);
  tube(group, [[0.42, 0.55, 0], [0.9, 0.92, 0], [1.35, 0.75, 0.02]], 0.085, m.secondary);
  add(group, new THREE.SphereGeometry(0.28, 28, 20), m.secondary, [-1.48, 0.67, 0], [1, 0.72, 0.8]);
  add(group, new THREE.SphereGeometry(0.28, 28, 20), m.secondary, [1.48, 0.67, 0], [1, 0.72, 0.8]);
  tube(group, [[0, 0.55, 0.58], [0, 0.1, 0.68], [0, -0.38, 0.58]], 0.035, m.pale);
  return group;
}

function maleReproductive() {
  const group = new THREE.Group();
  const m = materials(0xa56f61);
  add(group, new THREE.SphereGeometry(0.62, 36, 24), m.pale, [0, 1.05, -0.12], [1, 0.72, 0.75]);
  add(group, new THREE.SphereGeometry(0.46, 34, 24), m.primary, [0, 0.36, 0.15], [1, 0.72, 0.78]);
  add(group, new THREE.SphereGeometry(0.4, 32, 22), m.secondary, [-0.48, -1.1, 0], [0.78, 1.12, 0.72]);
  add(group, new THREE.SphereGeometry(0.4, 32, 22), m.secondary, [0.48, -1.1, 0], [0.78, 1.12, 0.72]);
  tube(group, [[-0.48, -0.75, 0], [-0.75, 0.15, 0], [-0.42, 0.95, 0]], 0.06, m.vessel);
  tube(group, [[0.48, -0.75, 0], [0.75, 0.15, 0], [0.42, 0.95, 0]], 0.06, m.vessel);
  add(group, new THREE.SphereGeometry(0.23, 24, 18), m.secondary, [-0.42, 0.8, 0.4], [0.72, 1.1, 0.7]);
  add(group, new THREE.SphereGeometry(0.23, 24, 18), m.secondary, [0.42, 0.8, 0.4], [0.72, 1.1, 0.7]);
  tube(group, [[0, 0.18, 0.35], [0, -0.55, 0.25], [0, -1.75, 0.05]], 0.085, m.pale);
  return group;
}

function gallbladder() {
  const group = new THREE.Group();
  const m = materials(0x85964d);
  add(group, new THREE.SphereGeometry(0.72, 40, 28), m.primary, [0, -0.35, 0], [0.72, 1.35, 0.62]);
  add(group, new THREE.CapsuleGeometry(0.22, 0.55, 8, 20), m.secondary, [0.12, 0.88, 0], [0.75, 1, 0.72], [0, 0, -0.18]);
  tube(group, [[0.12, 1.2, 0], [0.55, 1.45, 0], [1.05, 1.2, 0]], 0.07, m.secondary);
  tube(group, [[1.05, 1.2, 0], [1.0, 0.45, 0], [1.12, -0.25, 0]], 0.075, m.vessel);
  return group;
}

function airwayDiaphragm() {
  const group = new THREE.Group();
  const m = materials(0x708ba5);
  add(group, new THREE.CylinderGeometry(0.22, 0.25, 1.85, 28), m.pale, [-0.28, 0.92, 0]);
  for (let i = 0; i < 7; i += 1) add(group, new THREE.TorusGeometry(0.25, 0.027, 8, 26), m.vessel, [-0.28, 1.62 - i * 0.25, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  tube(group, [[-0.28, 0, 0], [-0.65, -0.32, 0], [-0.95, -0.62, 0]], 0.13, m.pale);
  tube(group, [[-0.28, 0, 0], [0.12, -0.32, 0], [0.5, -0.62, 0]], 0.13, m.pale);
  add(group, new THREE.CylinderGeometry(0.14, 0.14, 2.65, 24), m.secondary, [0.35, 0.45, -0.35]);
  add(group, new THREE.SphereGeometry(0.8, 38, 26), m.secondary, [-0.88, -0.45, -0.12], [0.7, 1.1, 0.62]);
  add(group, new THREE.SphereGeometry(0.8, 38, 26), m.secondary, [0.72, -0.45, -0.12], [0.7, 1.1, 0.62]);
  const diaphragm = add(group, new THREE.SphereGeometry(1.6, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), m.primary, [-0.08, -1.25, 0], [1, 0.35, 0.7], [Math.PI, 0, 0]);
  diaphragm.material = m.primary;
  return group;
}

export function buildProceduralModel(id: string): THREE.Group | null {
  const builders: Record<string, () => THREE.Group> = {
    stomach,
    skeleton,
    muscles,
    ear,
    "spinal-cord": spinalCord,
    bladder,
    thyroid,
    lymphatic,
    "female-reproductive": femaleReproductive,
    "male-reproductive": maleReproductive,
    gallbladder,
    "airway-diaphragm": airwayDiaphragm,
  };
  const build = builders[id];
  if (!build) return null;
  const group = build();
  group.name = `procedural-${id}`;
  return group;
}

