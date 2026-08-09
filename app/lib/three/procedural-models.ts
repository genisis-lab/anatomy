import * as THREE from "three";

type MaterialSet = {
  primary: THREE.MeshPhysicalMaterial;
  secondary: THREE.MeshPhysicalMaterial;
  pale: THREE.MeshPhysicalMaterial;
  vessel: THREE.MeshPhysicalMaterial;
};

function material(color: number, roughness = 0.56) {
  const base = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: base,
    roughness,
    metalness: 0,
    ior: 1.38,
    clearcoat: 0.1,
    clearcoatRoughness: 0.62,
    sheen: 0.22,
    sheenRoughness: 0.78,
    sheenColor: base.clone().lerp(new THREE.Color(0xffe8dc), 0.42),
    specularIntensity: 0.48,
    specularColor: new THREE.Color(0xffeee4),
  });
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

/** Adds restrained, deterministic micro-undulation so soft tissue catches the
 * atelier lighting like an anatomical cast instead of a perfect primitive. */
function organicize<T extends THREE.BufferGeometry>(geometry: T, amount = 0.018, seed = 0): T {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    normal.copy(vertex).normalize();
    const wave =
      Math.sin(vertex.x * 7.3 + seed * 1.7) *
        Math.sin(vertex.y * 6.1 - seed * 0.8) * 0.62 +
      Math.sin(vertex.z * 10.7 + vertex.y * 3.2 + seed) * 0.38;
    vertex.addScaledVector(normal, wave * amount);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function softSphere(radius = 1, width = 48, height = 32, amount = 0.018, seed = 0) {
  return organicize(new THREE.SphereGeometry(radius, width, height), amount, seed);
}

function nodule(
  group: THREE.Group,
  position: [number, number, number],
  scale: [number, number, number],
  surface: THREE.Material,
  seed = 0,
) {
  return add(group, softSphere(1, 24, 18, 0.022, seed), surface, position, scale);
}

function branch(
  group: THREE.Group,
  origin: [number, number, number],
  tips: Array<[number, number, number]>,
  radius: number,
  surface: THREE.Material,
) {
  tips.forEach((tip, index) => {
    const bend: [number, number, number] = [
      THREE.MathUtils.lerp(origin[0], tip[0], 0.56),
      THREE.MathUtils.lerp(origin[1], tip[1], 0.56) + (index % 2 ? -0.05 : 0.05),
      Math.max(origin[2], tip[2]) + 0.06,
    ];
    tube(group, [origin, bend, tip], Math.max(0.012, radius * (1 - index * 0.045)), surface);
  });
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
  add(group, softSphere(1, 56, 38, 0.026, 1), m.primary, [0.25, -0.2, 0], [0.82, 1.25, 0.62], [0, 0, -0.22]);
  add(group, softSphere(0.72, 44, 30, 0.02, 2), m.secondary, [0.55, 0.72, -0.02], [0.9, 0.75, 0.72]);
  tube(group, [[-0.35, 1.75, 0], [-0.35, 1.25, 0], [-0.18, 0.85, 0]], 0.18, m.secondary);
  tube(group, [[-0.12, -0.9, 0], [-0.55, -1.25, 0], [-0.95, -1.18, 0]], 0.2, m.secondary);
  tube(group, [[-0.12, 0.9, 0.5], [0.85, 0.45, 0.6], [0.88, -0.55, 0.45], [0.2, -1.05, 0.38]], 0.032, m.pale);
  for (let index = 0; index < 6; index += 1) {
    const y = 0.48 - index * 0.22;
    tube(group, [[-0.18, y + 0.1, 0.58], [0.2, y + 0.02, 0.7], [0.58, y - 0.06, 0.57]], 0.022, m.pale);
  }
  branch(group, [0.15, 0.85, 0.57], [[0.7,0.55,0.62],[0.82,0.02,0.58],[0.62,-0.55,0.52],[0.1,-0.92,0.45]], 0.026, m.vessel);
  return group;
}

function skeleton() {
  const group = new THREE.Group();
  const m = materials(0xc8ad83);
  add(group, new THREE.SphereGeometry(0.38, 34, 24), m.pale, [0, 1.62, 0], [0.88, 1.05, 0.82]);
  add(group, new THREE.BoxGeometry(0.34, 0.22, 0.3), m.pale, [0, 1.27, 0.02], [1, 1, 1]);
  bone(group, [0, 1.15, 0], [0, -0.65, 0], 0.075, m.pale);
  add(group, new THREE.BoxGeometry(0.12, 1.08, 0.08), m.secondary, [0, 0.53, 0.22]);
  for (let i = 0; i < 10; i += 1) {
    const y = 1.02 - i * 0.145;
    const width = 0.5 + Math.sin((i / 9) * Math.PI) * 0.34;
    const rib = add(group, new THREE.TorusGeometry(width, 0.035, 8, 36, Math.PI * 1.55), m.pale, [0, y, -0.03], [1, 0.62, 1], [Math.PI / 2, 0, -Math.PI * 0.77]);
    rib.rotation.y = 0.02;
  }
  for (let i = 0; i < 15; i += 1) nodule(group, [0, 1.1 - i * 0.115, -0.11], [0.095,0.065,0.12], m.secondary, i);
  add(group, new THREE.TorusGeometry(0.25, 0.045, 8, 26, Math.PI * 1.2), m.pale, [0, 1.45, 0.18], [1,0.78,1], [0,0,Math.PI * 0.9]);
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
  for (const side of [-1, 1]) {
    for (let digit = 0; digit < 4; digit += 1) {
      bone(group, [side * 1.02, -0.55, 0], [side * (1.12 + digit * 0.035), -0.78 - digit * 0.015, 0.02], 0.018, m.pale);
      bone(group, [side * 0.4, -2.23, 0.03], [side * (0.42 + digit * 0.045), -2.43, 0.14 + digit * 0.018], 0.022, m.pale);
    }
  }
  return group;
}

function muscles() {
  const group = new THREE.Group();
  const m = materials(0xa94f48);
  add(group, softSphere(0.32, 32, 22, 0.012, 3), m.secondary, [0, 1.65, 0], [0.9, 1.08, 0.82]);
  add(group, organicize(new THREE.CapsuleGeometry(0.5, 1.15, 10, 32), 0.018, 4), m.primary, [0, 0.65, 0], [1, 1, 0.72]);
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
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      const offset = index * 0.045;
      tube(group, [[side * (0.62 + offset),0.9,0.22],[side * (0.78 + offset),0.35,0.25],[side * (0.92 + offset),-0.15,0.2]], 0.012, m.pale);
      tube(group, [[side * (0.28 + offset),-0.72,0.32],[side * (0.38 + offset),-1.25,0.34],[side * (0.42 + offset),-1.75,0.27]], 0.014, m.pale);
    }
  }
  for (let row = 0; row < 3; row += 1) {
    nodule(group, [-0.16, 0.55 - row * 0.3, 0.48], [0.14,0.12,0.08], m.secondary, row + 10);
    nodule(group, [0.16, 0.55 - row * 0.3, 0.48], [0.14,0.12,0.08], m.secondary, row + 20);
  }
  return group;
}

function ear() {
  const group = new THREE.Group();
  const m = materials(0xc68170);
  add(group, organicize(new THREE.TorusGeometry(1.05, 0.28, 24, 72), 0.018, 2), m.primary, [-0.55, 0.1, 0], [0.8, 1.12, 0.55], [0, 0.18, 0]);
  add(group, new THREE.TorusGeometry(0.54, 0.16, 20, 48), m.secondary, [-0.55, 0.05, 0.28], [0.8, 1.08, 0.65], [0, 0.2, 0]);
  tube(group, [[-0.05, 0.05, 0.15], [0.45, 0.03, 0.1], [0.8, 0.05, 0]], 0.12, m.pale);
  add(group, new THREE.CircleGeometry(0.2, 36), m.secondary, [0.48, 0.04, 0.14], [1,1,1], [0,0.7,0]);
  bone(group, [0.5,0.12,0.2],[0.68,0.23,0.25],0.035,m.pale);
  bone(group, [0.68,0.23,0.25],[0.82,0.12,0.22],0.03,m.pale);
  bone(group, [0.82,0.12,0.22],[0.9,-0.01,0.18],0.026,m.pale);
  const cochleaPoints: Array<[number, number, number]> = [];
  for (let index = 0; index < 42; index += 1) {
    const angle = index * 0.31;
    const radius = 0.5 * (1 - index / 50);
    cochleaPoints.push([1.05 + Math.cos(angle) * radius, -0.18 + Math.sin(angle) * radius, 0.08 + index * 0.002]);
  }
  tube(group, cochleaPoints, 0.07, m.secondary);
  add(group, new THREE.TorusGeometry(0.52, 0.07, 12, 40, Math.PI * 1.35), m.vessel, [0.95, 0.72, 0], [0.65, 1, 0.7], [0.1, 0, -0.55]);
  add(group, new THREE.TorusGeometry(0.48, 0.07, 12, 40, Math.PI * 1.35), m.vessel, [1.24, 0.62, -0.02], [0.65, 1, 0.7], [0.1, 0, 0.52]);
  add(group, new THREE.TorusGeometry(0.44, 0.065, 12, 40, Math.PI * 1.35), m.vessel, [1.08, 0.86, -0.16], [0.65,1,0.7], [0.55,0,-0.08]);
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
    nodule(group, [-0.47,y - 0.07,0.04], [0.11,0.075,0.07], m.secondary, i);
    nodule(group, [0.47,y - 0.07,0.04], [0.11,0.075,0.07], m.secondary, i + 10);
  }
  tube(group, [[0,1.7,0.17],[0,0.7,0.19],[0,-0.4,0.18],[0,-1.55,0.16]], 0.018, m.vessel);
  for (let i = -2; i <= 2; i += 1) tube(group, [[0, -1.55, 0], [i * 0.1, -1.85, 0], [i * 0.22, -2.2, 0.03]], 0.035, m.secondary);
  return group;
}

function bladder() {
  const group = new THREE.Group();
  const m = materials(0xc9915e);
  add(group, softSphere(0.95, 52, 36, 0.028, 5), m.primary, [0, -0.15, 0], [0.85, 1.05, 0.72]);
  tube(group, [[-0.8, 1.55, 0], [-0.65, 0.8, 0], [-0.48, 0.45, 0.05]], 0.075, m.secondary);
  tube(group, [[0.8, 1.55, 0], [0.65, 0.8, 0], [0.48, 0.45, 0.05]], 0.075, m.secondary);
  tube(group, [[0, -0.95, 0], [0, -1.65, 0]], 0.11, m.secondary);
  add(group, new THREE.TorusGeometry(0.48, 0.035, 10, 36), m.pale, [0, -0.35, 0.7], [1, 0.55, 1], [Math.PI / 2, 0, 0]);
  for (let index = 0; index < 5; index += 1) {
    const y = 0.48 - index * 0.22;
    tube(group, [[-0.52,y,0.58],[0,y - 0.08,0.72],[0.52,y,0.58]], 0.018, m.pale);
  }
  branch(group, [0,-0.48,0.68], [[-0.52,-0.22,0.58],[-0.38,0.35,0.56],[0.38,0.35,0.56],[0.52,-0.22,0.58]], 0.022, m.vessel);
  return group;
}

function thyroid() {
  const group = new THREE.Group();
  const m = materials(0xb55f59);
  add(group, new THREE.CylinderGeometry(0.28, 0.28, 2.8, 28), m.pale, [0, 0, -0.32]);
  for (let i = -4; i <= 4; i += 1) add(group, new THREE.TorusGeometry(0.31, 0.025, 8, 28), m.vessel, [0, i * 0.25, -0.32], [1, 1, 1], [Math.PI / 2, 0, 0]);
  add(group, organicize(new THREE.CapsuleGeometry(0.38, 1.25, 12, 32), 0.025, 6), m.primary, [-0.52, 0, 0.05], [0.8, 1, 0.75], [0, 0, -0.12]);
  add(group, organicize(new THREE.CapsuleGeometry(0.38, 1.25, 12, 32), 0.025, 7), m.secondary, [0.52, 0, 0.05], [0.8, 1, 0.75], [0, 0, 0.12]);
  bone(group, [-0.3, -0.18, 0.05], [0.3, -0.18, 0.05], 0.15, m.primary);
  for (const side of [-1, 1]) {
    for (let row = -2; row <= 2; row += 1) {
      for (let column = -1; column <= 1; column += 1) {
        nodule(group, [side * (0.52 + column * 0.07), row * 0.25, 0.34], [0.105,0.13,0.07], row % 2 ? m.primary : m.secondary, row * 4 + column);
      }
    }
    tube(group, [[side * 0.43,0.72,0.4],[side * 0.55,0.05,0.48],[side * 0.42,-0.72,0.38]], 0.024, m.vessel);
  }
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
  branch(group, [0,1.18,0.02], [[-.48,1.5,.04],[.48,1.5,.04],[-.82,.98,.04],[.82,.98,.04]], 0.026, m.vessel);
  branch(group, [-.5,.6,.03], [[-1.0,.72,.05],[-1.14,.28,.05],[-.92,-.12,.05]], 0.022, m.vessel);
  branch(group, [.5,.58,.03], [[1.0,.7,.05],[1.14,.25,.05],[.95,-.2,.05]], 0.022, m.vessel);
  branch(group, [-.45,-.85,.02], [[-.82,-1.2,.04],[-.88,-1.65,.04],[-.62,-1.92,.04]], 0.021, m.vessel);
  branch(group, [.45,-.85,.02], [[.82,-1.2,.04],[.88,-1.65,.04],[.62,-1.92,.04]], 0.021, m.vessel);
  const nodes: Array<[number, number, number]> = [[0,1.35,0.04],[-.45,.75,.05],[.45,.72,.05],[-.85,.16,.05],[.82,.08,.05],[0,-.28,.08],[-.48,-.92,.06],[.5,-.94,.06],[-.6,-1.48,.04],[.62,-1.5,.04]];
  nodes.forEach((point, index) => add(group, new THREE.SphereGeometry(0.12, 20, 14), index % 2 ? m.secondary : m.primary, point));
  for (const [index, point] of [[-.75,1.03,.05],[.75,1.03,.05],[-1.04,.38,.05],[1.04,.38,.05],[-.8,-1.22,.05],[.8,-1.22,.05]].entries()) {
    nodule(group, point as [number, number, number], [0.09,0.12,0.08], index % 2 ? m.secondary : m.primary, index + 30);
  }
  add(group, softSphere(0.62, 40, 28, 0.025, 8), m.primary, [1.02, 0.58, -0.08], [0.58, 1.12, 0.42], [0, 0, -0.35]);
  branch(group, [0.82,0.58,0.25], [[1.08,.88,.28],[1.24,.55,.25],[1.0,.2,.25]], 0.018, m.pale);
  return group;
}

function femaleReproductive() {
  const group = new THREE.Group();
  const m = materials(0xb9617e);
  add(group, softSphere(0.72, 48, 32, 0.024, 9), m.primary, [0, 0.05, 0], [0.82, 1.02, 0.62]);
  add(group, new THREE.CapsuleGeometry(0.2, 0.55, 8, 20), m.secondary, [0, -0.92, 0], [0.75, 1, 0.7]);
  tube(group, [[-0.42, 0.55, 0], [-0.9, 0.92, 0], [-1.35, 0.75, 0.02]], 0.085, m.secondary);
  tube(group, [[0.42, 0.55, 0], [0.9, 0.92, 0], [1.35, 0.75, 0.02]], 0.085, m.secondary);
  add(group, softSphere(0.28, 32, 22, 0.016, 10), m.secondary, [-1.48, 0.67, 0], [1, 0.72, 0.8]);
  add(group, softSphere(0.28, 32, 22, 0.016, 11), m.secondary, [1.48, 0.67, 0], [1, 0.72, 0.8]);
  tube(group, [[0, 0.55, 0.58], [0, 0.1, 0.68], [0, -0.38, 0.58]], 0.035, m.pale);
  for (const side of [-1, 1]) {
    for (let finger = -2; finger <= 2; finger += 1) {
      tube(group, [[side * 1.28,.78,.05],[side * (1.52 + Math.abs(finger) * .035),.78 + finger * .075,.08]], 0.024, m.secondary);
    }
    for (let follicle = 0; follicle < 5; follicle += 1) {
      nodule(group, [side * (1.43 + (follicle % 2) * .08),.58 + Math.floor(follicle / 2) * .09,.24], [0.055,0.055,0.04], m.pale, follicle);
    }
    branch(group, [0.24 * side,-0.3,.58], [[.78 * side,.18,.56],[1.22 * side,.54,.48]], 0.018, m.vessel);
  }
  return group;
}

function maleReproductive() {
  const group = new THREE.Group();
  const m = materials(0xa56f61);
  add(group, softSphere(0.62, 42, 28, 0.018, 12), m.pale, [0, 1.05, -0.12], [1, 0.72, 0.75]);
  add(group, softSphere(0.46, 40, 28, 0.026, 13), m.primary, [0, 0.36, 0.15], [1, 0.72, 0.78]);
  add(group, softSphere(0.4, 38, 26, 0.02, 14), m.secondary, [-0.48, -1.1, 0], [0.78, 1.12, 0.72]);
  add(group, softSphere(0.4, 38, 26, 0.02, 15), m.secondary, [0.48, -1.1, 0], [0.78, 1.12, 0.72]);
  tube(group, [[-0.48, -0.75, 0], [-0.75, 0.15, 0], [-0.42, 0.95, 0]], 0.06, m.vessel);
  tube(group, [[0.48, -0.75, 0], [0.75, 0.15, 0], [0.42, 0.95, 0]], 0.06, m.vessel);
  add(group, new THREE.SphereGeometry(0.23, 24, 18), m.secondary, [-0.42, 0.8, 0.4], [0.72, 1.1, 0.7]);
  add(group, new THREE.SphereGeometry(0.23, 24, 18), m.secondary, [0.42, 0.8, 0.4], [0.72, 1.1, 0.7]);
  tube(group, [[0, 0.18, 0.35], [0, -0.55, 0.25], [0, -1.75, 0.05]], 0.085, m.pale);
  for (const side of [-1, 1]) {
    const coil: Array<[number, number, number]> = [];
    for (let index = 0; index < 24; index += 1) {
      const angle = index * 0.52;
      coil.push([side * (0.48 + Math.cos(angle) * 0.22), -1.05 + Math.sin(angle) * 0.48, 0.28 + Math.cos(angle) * 0.045]);
    }
    tube(group, coil, 0.038, m.pale);
    branch(group, [side * .28,.28,.48], [[side * .46,.48,.5],[side * .42,.82,.48]], 0.018, m.vessel);
  }
  return group;
}

function gallbladder() {
  const group = new THREE.Group();
  const m = materials(0x85964d);
  add(group, softSphere(0.72, 48, 32, 0.026, 16), m.primary, [0, -0.35, 0], [0.72, 1.35, 0.62]);
  add(group, new THREE.CapsuleGeometry(0.22, 0.55, 8, 20), m.secondary, [0.12, 0.88, 0], [0.75, 1, 0.72], [0, 0, -0.18]);
  tube(group, [[0.12, 1.2, 0], [0.55, 1.45, 0], [1.05, 1.2, 0]], 0.07, m.secondary);
  tube(group, [[1.05, 1.2, 0], [1.0, 0.45, 0], [1.12, -0.25, 0]], 0.075, m.vessel);
  branch(group, [1.02,1.18,.02], [[.72,1.62,.04],[1.14,1.68,.04],[1.48,1.42,.04]], 0.052, m.secondary);
  for (let index = 0; index < 5; index += 1) {
    const y = 0.32 - index * 0.26;
    tube(group, [[-.3,y,.48],[0,y - .08,.58],[.3,y,.48]], 0.018, m.pale);
  }
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
  add(group, softSphere(0.8, 44, 30, 0.024, 17), m.secondary, [-0.88, -0.45, -0.12], [0.7, 1.1, 0.62]);
  add(group, softSphere(0.8, 44, 30, 0.024, 18), m.secondary, [0.72, -0.45, -0.12], [0.7, 1.1, 0.62]);
  branch(group, [-.62,-.28,.42], [[-1.05,.08,.45],[-1.16,-.42,.48],[-.92,-.92,.44]], 0.055, m.pale);
  branch(group, [.24,-.28,.42], [[.58,.08,.45],[.92,-.38,.48],[.68,-.92,.44]], 0.055, m.pale);
  branch(group, [-.98,-.4,.48], [[-1.28,-.18,.5],[-1.28,-.62,.5],[-1.02,-.88,.5]], 0.025, m.vessel);
  branch(group, [.68,-.4,.48], [[.98,-.18,.5],[1.0,-.6,.5],[.72,-.88,.5]], 0.025, m.vessel);
  const diaphragm = add(group, new THREE.SphereGeometry(1.6, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), m.primary, [-0.08, -1.25, 0], [1, 0.35, 0.7], [Math.PI, 0, 0]);
  diaphragm.material = m.primary;
  for (let index = -5; index <= 5; index += 1) {
    tube(group, [[0,-1.1,.48],[index * .18,-1.32,.42],[index * .24,-1.42,.2]], 0.014, m.pale);
  }
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
