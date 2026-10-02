import * as THREE from "three";
import { edgeTable, triTable } from "three/examples/jsm/objects/MarchingCubes.js";
import { gradient } from "./sdf.mjs";

// Bourke corner order, matching three's MarchingCubes tables.
const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
// Each edge as [corner a, corner b, axis, dx, dy, dz] where (dx, dy, dz) is
// the grid point the edge starts from, relative to the cell origin.
const EDGES = [
  [0, 1, 0, 0, 0, 0], [1, 2, 1, 1, 0, 0], [3, 2, 0, 0, 1, 0], [0, 3, 1, 0, 0, 0],
  [4, 5, 0, 0, 0, 1], [5, 6, 1, 1, 0, 1], [7, 6, 0, 0, 1, 1], [4, 7, 1, 0, 0, 1],
  [0, 4, 2, 0, 0, 0], [1, 5, 2, 1, 0, 0], [2, 6, 2, 1, 1, 0], [3, 7, 2, 0, 1, 0],
];

const BLOCK = 4;

/**
 * Narrow-band marching cubes over a signed distance field.
 *
 * Space is first visited in 4³-cell blocks; blocks whose centre is provably
 * far from the surface are skipped, so only a thin shell of samples is
 * evaluated. Normals come from the analytic field gradient rather than the
 * triangles, which is what gives the specimens their cast-like smoothness.
 *
 * `caps` lists cutting planes (`{ normal, offset }`). Triangles lying on a
 * cap receive their own vertices and the exact plane normal so cut faces
 * read as crisp sections, and are tagged for interior painting.
 */
export function meshField(field, {
  cell,
  bounds = field.b,
  shade = field,
  caps = [],
  maxCells = 340,
  lipschitz = 1.6,
} = {}) {
  let size = cell;
  const extent = [bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]];
  const longest = Math.max(...extent);
  if (longest / size > maxCells) size = longest / maxCells;
  const pad = 2 * size;
  const origin = [bounds[0] - pad, bounds[1] - pad, bounds[2] - pad];
  const nx = Math.ceil((extent[0] + 2 * pad) / size / BLOCK) * BLOCK;
  const ny = Math.ceil((extent[1] + 2 * pad) / size / BLOCK) * BLOCK;
  const nz = Math.ceil((extent[2] + 2 * pad) / size / BLOCK) * BLOCK;
  const sx = nx + 1, sxy = (nx + 1) * (ny + 1);
  const values = new Float32Array(sxy * (nz + 1)).fill(Number.NaN);
  const sample = (i, j, k) => {
    const index = i + j * sx + k * sxy;
    let v = values[index];
    if (Number.isNaN(v)) {
      v = field.d(origin[0] + i * size, origin[1] + j * size, origin[2] + k * size);
      values[index] = v;
    }
    return v;
  };

  const halfDiagonal = (BLOCK * size * Math.sqrt(3)) / 2;
  const positions = [];
  const triangles = [];
  const vertexByEdge = new Map();
  const cornerValues = new Float64Array(8);

  const vertexFor = (ci, cj, ck, edge) => {
    const [a, b, axis, dx, dy, dz] = EDGES[edge];
    const gi = ci + dx, gj = cj + dy, gk = ck + dz;
    const key = (gi + gj * sx + gk * sxy) * 3 + axis;
    const cached = vertexByEdge.get(key);
    if (cached !== undefined) return cached;
    const va = cornerValues[a], vb = cornerValues[b];
    const t = va / (va - vb);
    const pa = CORNERS[a], pb = CORNERS[b];
    // A sample exactly on the surface puts the vertex on a grid corner that
    // several edges share. Key those by the corner so they weld; otherwise
    // decimation later tears the coincident copies apart.
    if (t <= 1e-6 || t >= 1 - 1e-6) {
      const corner = t <= 1e-6 ? pa : pb;
      const cornerKey = -1 - ((ci + corner[0]) + (cj + corner[1]) * sx + (ck + corner[2]) * sxy);
      const known = vertexByEdge.get(cornerKey);
      if (known !== undefined) {
        vertexByEdge.set(key, known);
        return known;
      }
      const index = positions.length / 3;
      positions.push(origin[0] + (ci + corner[0]) * size, origin[1] + (cj + corner[1]) * size, origin[2] + (ck + corner[2]) * size);
      vertexByEdge.set(cornerKey, index);
      vertexByEdge.set(key, index);
      return index;
    }
    const index = positions.length / 3;
    positions.push(
      origin[0] + (ci + pa[0] + (pb[0] - pa[0]) * t) * size,
      origin[1] + (cj + pa[1] + (pb[1] - pa[1]) * t) * size,
      origin[2] + (ck + pa[2] + (pb[2] - pa[2]) * t) * size,
    );
    vertexByEdge.set(key, index);
    return index;
  };

  const vertexIds = new Int32Array(12);
  for (let bk = 0; bk < nz; bk += BLOCK) for (let bj = 0; bj < ny; bj += BLOCK) for (let bi = 0; bi < nx; bi += BLOCK) {
    const center = field.d(
      origin[0] + (bi + BLOCK / 2) * size,
      origin[1] + (bj + BLOCK / 2) * size,
      origin[2] + (bk + BLOCK / 2) * size,
    );
    if (Math.abs(center) > halfDiagonal * lipschitz + size) continue;
    for (let k = bk; k < bk + BLOCK; k += 1) for (let j = bj; j < bj + BLOCK; j += 1) for (let i = bi; i < bi + BLOCK; i += 1) {
      let cube = 0;
      for (let c = 0; c < 8; c += 1) {
        const corner = CORNERS[c];
        const v = sample(i + corner[0], j + corner[1], k + corner[2]);
        cornerValues[c] = v;
        if (v < 0) cube |= 1 << c;
      }
      const edges = edgeTable[cube];
      if (!edges) continue;
      for (let e = 0; e < 12; e += 1) if (edges & (1 << e)) vertexIds[e] = vertexFor(i, j, k, e);
      const row = cube << 4;
      for (let t = 0; triTable[row + t] !== -1; t += 3) {
        const v0 = vertexIds[triTable[row + t]], v1 = vertexIds[triTable[row + t + 1]], v2 = vertexIds[triTable[row + t + 2]];
        if (v0 !== v1 && v1 !== v2 && v2 !== v0) triangles.push(v0, v1, v2);
      }
    }
  }

  return finishGeometry(positions, triangles, shade, size, caps);
}

function finishGeometry(positionList, triangleList, shade, size, caps) {
  const positions = Float32Array.from(positionList);
  let triangles = Uint32Array.from(triangleList);
  const vertexCount = positions.length / 3;
  const normals = new Float32Array(vertexCount * 3);
  const g = new THREE.Vector3();
  for (let v = 0; v < vertexCount; v += 1) {
    gradient(shade, positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], size * 0.35, g);
    normals[v * 3] = g.x; normals[v * 3 + 1] = g.y; normals[v * 3 + 2] = g.z;
  }

  // Orient triangles so their winding agrees with the field gradient.
  let agree = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < triangles.length; t += 3) {
    a.fromArray(positions, triangles[t] * 3);
    b.fromArray(positions, triangles[t + 1] * 3);
    c.fromArray(positions, triangles[t + 2] * 3);
    n.subVectors(c, b).cross(a.clone().sub(b));
    agree += Math.sign(n.dot(g.fromArray(normals, triangles[t] * 3)));
    if (t > 3000) break;
  }
  if (agree < 0) {
    for (let t = 0; t < triangles.length; t += 3) {
      const tmp = triangles[t + 1];
      triangles[t + 1] = triangles[t + 2];
      triangles[t + 2] = tmp;
    }
  }

  let capIds = new Uint8Array(vertexCount);
  let finalPositions = positions;
  let finalNormals = normals;
  if (caps.length) {
    const tolerance = size * 1e-3;
    const extraPositions = [];
    const extraNormals = [];
    const extraCaps = [];
    const remaps = caps.map(() => new Map());
    for (let t = 0; t < triangles.length; t += 3) {
      for (let p = 0; p < caps.length; p += 1) {
        const { normal, offset } = caps[p];
        let onPlane = true;
        for (let corner = 0; corner < 3 && onPlane; corner += 1) {
          const v = triangles[t + corner];
          const distance = positions[v * 3] * normal.x + positions[v * 3 + 1] * normal.y + positions[v * 3 + 2] * normal.z - offset;
          if (Math.abs(distance) > tolerance) onPlane = false;
        }
        if (!onPlane) continue;
        for (let corner = 0; corner < 3; corner += 1) {
          const v = triangles[t + corner];
          let mapped = remaps[p].get(v);
          if (mapped === undefined) {
            mapped = vertexCount + extraPositions.length / 3;
            extraPositions.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
            extraNormals.push(normal.x, normal.y, normal.z);
            extraCaps.push(p + 1);
            remaps[p].set(v, mapped);
          }
          triangles[t + corner] = mapped;
        }
        break;
      }
    }
    if (extraPositions.length) {
      finalPositions = new Float32Array(positions.length + extraPositions.length);
      finalPositions.set(positions);
      finalPositions.set(extraPositions, positions.length);
      finalNormals = new Float32Array(normals.length + extraNormals.length);
      finalNormals.set(normals);
      finalNormals.set(extraNormals, normals.length);
      const nextCaps = new Uint8Array(capIds.length + extraCaps.length);
      nextCaps.set(capIds);
      nextCaps.set(extraCaps, capIds.length);
      capIds = nextCaps;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(finalPositions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(finalNormals, 3));
  geometry.setIndex(new THREE.BufferAttribute(triangles, 1));
  geometry.userData.cap = capIds;
  geometry.userData.cell = size;
  return compact(geometry);
}

/** Drops vertices no triangle references (cap splitting leaves some behind). */
export function compact(geometry) {
  const index = geometry.index.array;
  const count = geometry.attributes.position.count;
  const used = new Int32Array(count).fill(-1);
  let next = 0;
  for (let i = 0; i < index.length; i += 1) if (used[index[i]] < 0) used[index[i]] = next++;
  if (next === count) return geometry;
  const out = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const size = attribute.itemSize;
    const array = new attribute.array.constructor(next * size);
    for (let v = 0; v < count; v += 1) {
      if (used[v] < 0) continue;
      for (let c = 0; c < size; c += 1) array[used[v] * size + c] = attribute.array[v * size + c];
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized));
  }
  const remapped = new Uint32Array(index.length);
  for (let i = 0; i < index.length; i += 1) remapped[i] = used[index[i]];
  out.setIndex(new THREE.BufferAttribute(remapped, 1));
  const cap = geometry.userData.cap;
  if (cap) {
    const nextCap = new Uint8Array(next);
    for (let v = 0; v < count; v += 1) if (used[v] >= 0) nextCap[used[v]] = cap[v];
    out.userData = { ...geometry.userData, cap: nextCap };
  } else {
    out.userData = { ...geometry.userData };
  }
  return out;
}
