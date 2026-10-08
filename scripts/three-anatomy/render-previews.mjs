// Renders the specimen artwork (organ.webp, thumb.webp) for every model in
// app/lib/three-models.json with real Three.js in headless Chromium, using
// the viewer's lighting so previews match what learners see.
//
//   node scripts/three-anatomy/render-previews.mjs            # all specimens
//   node scripts/three-anatomy/render-previews.mjs ear knee   # selected
//
// Set CHROMIUM_PATH to use a specific Chromium build; otherwise Playwright's
// installed browser is used (`npx playwright-core install chromium`).

import http from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(readFileSync(join(root, "app/lib/three-models.json"), "utf8"));
const requested = process.argv.slice(2);
const ids = requested.length ? requested : Object.keys(manifest);
const SIZE = 1280;

const page = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/examples/jsm/":"/node_modules/three/examples/jsm/"}}</script>
</head><body><script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(${SIZE}, ${SIZE});
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
// Same rig as app/lib/three/viewer.ts.
scene.add(new THREE.AmbientLight(0xffffff, 0.42));
scene.add(new THREE.HemisphereLight(0xfff8ee, 0x33252d, 0.72));
const key = new THREE.DirectionalLight(0xfff3e7, 3.5); key.position.set(4.8, 6.5, 6.8); scene.add(key);
const fill = new THREE.DirectionalLight(0xe6ecff, 1.12); fill.position.set(-4.5, 1.2, 5.2); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffb7a5, 1.6); rim.position.set(-4, 3.5, -5.5); scene.add(rim);
const warm = new THREE.PointLight(0xff8d70, 0.72, 11, 2); warm.position.set(-3, -1.4, 3.5); scene.add(warm);
{
  const w = 16, h = 32, data = new Uint8Array(w * h * 4);
  const top = new THREE.Color(0xfff3e4), bottom = new THREE.Color(0x6b4f45), mixed = new THREE.Color();
  for (let y = 0; y < h; y += 1) {
    mixed.copy(bottom).lerp(top, Math.pow(1 - y / (h - 1), 0.7));
    for (let x = 0; x < w; x += 1) { const i = (y * w + x) * 4; data[i] = mixed.r * 255; data[i + 1] = mixed.g * 255; data[i + 2] = mixed.b * 255; data[i + 3] = 255; }
  }
  const source = new THREE.DataTexture(data, w, h);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;
  source.needsUpdate = true;
  scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(source).texture;
}
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
window.render = async (url) => {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const model = gltf.scene;
  model.traverse((child) => {
    if (!child.isMesh) return;
    for (const material of [child.material].flat()) {
      material.roughness = THREE.MathUtils.clamp(material.roughness ?? 0.5, 0.42, 0.62);
      material.metalness = 0;
      material.envMapIntensity = 0.32;
    }
  });
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.rotation.set(0.05, -0.28, 0);
  scene.add(pivot);
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y) * 0.5 * 1.1;
  const distance = radius / Math.tan(THREE.MathUtils.degToRad(15)) + size.z * 0.5;
  camera.position.set(centre.x, centre.y + distance * 0.08, centre.z + distance);
  camera.lookAt(centre);
  renderer.render(scene, camera);
  scene.remove(pivot);
};
window.ready = true;
</script></body></html>`;

const types = { ".js": "text/javascript", ".glb": "model/gltf-binary" };
const server = http.createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://local").pathname));
  try {
    if (path === "/") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(page);
      return;
    }
    const file = path.startsWith("/models/") ? join(root, "public", path) : join(root, path);
    if (!file.startsWith(root)) throw new Error("outside root");
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
try {
  const tab = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  tab.on("pageerror", (error) => console.error(error.message));
  await tab.goto(origin);
  await tab.waitForFunction(() => window.ready);
  for (const id of ids) {
    const record = manifest[id];
    if (!record) throw new Error(`${id} is not in app/lib/three-models.json`);
    await tab.evaluate((url) => window.render(url), record.model);
    const png = await tab.locator("canvas").screenshot({ omitBackground: true });
    const directory = join(root, "public/anatomy", id);
    mkdirSync(directory, { recursive: true });
    for (const [asset, size] of [["organ", 640], ["thumb", 128]]) {
      await sharp(png).resize(size, size, { kernel: "lanczos3" }).webp({ quality: 88, alphaQuality: 90 }).toFile(join(directory, `${asset}.webp`));
    }
    console.log(`${id}: organ.webp, thumb.webp`);
  }
} finally {
  await browser.close();
  server.close();
}
