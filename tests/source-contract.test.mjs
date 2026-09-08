import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("refined delivery assets decode, match their hashes, and retain labelled structures", async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({"meshopt.decoder": MeshoptDecoder});
  const manifest = JSON.parse(await read("app/lib/refined-models.json"));
  const additional = await read("app/lib/additional-organs.ts");
  assert.equal(Object.keys(manifest).length, 15);
  for (const [id, record] of Object.entries(manifest)) {
    const bytes = await readFile(new URL(`public${record.url}`, root));
    assert.equal(bytes.length, record.bytes);
    assert.ok(record.bytes < (id === "muscles" ? 7_000_000 : id === "skeleton" ? 4_000_000 : 700_000), `${id}: transfer budget`);
    assert.ok(record.url.includes(createHash("sha256").update(bytes).digest("hex").slice(0,8)));
    const doc = await io.readBinary(bytes);
    const nodes = doc.getRoot().listNodes().filter(node => node.getMesh());
    assert.equal(nodes.length, record.meshes);
    const bounds = getBounds(doc.getRoot().listScenes()[0]);
    assert.ok([...bounds.min, ...bounds.max].every(Number.isFinite));
    assert.ok(bounds.max.some((v,i) => v - bounds.min[i] > 0));
    for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute("POSITION");
      assert.ok(positions.getCount() > 0);
      assert.ok(positions.getArray().every(Number.isFinite));
      assert.ok(primitive.getIndices().getArray().every(index => index < positions.getCount()));
    }
    if (["spleen", "esophagus", "knee"].includes(id)) {
      const section = additional.split(`id:'${id}'`)[1].split(/\n  },/)[0];
      const names = new Set(nodes.map(node => node.getName()));
      const anchors = [...section.matchAll(/meshName:'([^']+)'/g)];
      assert.equal(anchors.length,4);
      for (const [,name] of anchors) assert.ok(names.has(name), `${id}: ${name} anchor exists`);
      for (const art of ["thumb", "organ"]) await access(new URL(`public/anatomy/${id}/${art}.webp`, root));
    }
  }
});

async function readGlbJson(path) {
  const buffer = await readFile(new URL(path, root));
  assert.equal(buffer.toString("ascii", 0, 4), "glTF", `${path} should be a binary glTF`);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength).replace(/[\u0000 ]+$/, ""));
}

test("ships complete navigation and learning surfaces", async () => {
  const [app, views, dialog, comparison, learning, css] = await Promise.all([
    read("app/components/AnatomyApp.tsx"),
    read("app/components/ProductViews.tsx"),
    read("app/components/LearningDialog.tsx"),
    read("app/components/ComparisonExperience.tsx"),
    read("app/lib/learning.ts"),
    read("app/globals.css"),
  ]);
  for (const label of ["explore", "systems", "lessons", "library", "notes"]) assert.match(app, new RegExp(`\\[\"${label}\"`));
  assert.match(views, /export function MobileNav/);
  assert.match(comparison, /export function ComparisonExperience/);
  assert.match(comparison, /onViewChange/);
  assert.match(learning, /buildReviewQueue/);
  assert.match(learning, /systemPathway/);
  assert.match(views, /structure-note-field/);
  assert.match(views, /Continue learning/);
  assert.match(views, /onNoteSaved/);
  assert.match(dialog, /showModal\(\)/);
  assert.match(dialog, /quizQuestions/);
  assert.match(app, /prefers-reduced-motion/);
  assert.match(app, /className=\{`header-explore/);
  for (const parameter of ["hotspot", "compare", "learn", "step", "quiz", "pathway", "pathStep"]) assert.match(app, new RegExp(`"${parameter}"`));
  assert.doesNotMatch(app, /a BuiltWAI experience/);
  assert.match(css, /\.hotspot-controls/);
  assert.match(css, /\.header-explore/);
  assert.match(css, /\.mobile-nav/);
  assert.match(css, /:focus-visible/);
});

test("persists anonymous learner state and bounded analytics in D1", async () => {
  const [hosting, vite, worker, migration, schema, privacy] = await Promise.all([
    read(".openai/hosting.json"),
    read("vite.config.ts"),
    read("worker/index.ts"),
    read("drizzle/0000_anatomy_learning.sql"),
    read("db/schema.ts"),
    read("app/privacy/page.tsx"),
  ]);
  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.match(vite, /PRODUCTION_DATABASE_ID/);
  assert.match(vite, /assets: \{ binding: "ASSETS", run_worker_first: true \}/);
  assert.match(vite, /images: \{ binding: "IMAGES" \}/);
  assert.match(worker, /HttpOnly; SameSite=Lax/);
  assert.match(worker, /MAX_JSON_BYTES = 64 \* 1024/);
  assert.match(worker, /ctx\.waitUntil/);
  assert.match(worker, /prepare\("SELECT payload FROM learner_state/);
  assert.match(migration, /CREATE TABLE `learner_state`/);
  assert.match(migration, /CREATE TABLE `analytics_events`/);
  assert.match(schema, /idx_analytics_events_event_created/);
  assert.match(privacy, /anonymous/i);
});

test("uses versioned models, modern Three timing, and durable cache policy", async () => {
  const [data, idsSource, expanded, procedural, loader, viewer, worker, securityHeaders, models] = await Promise.all([
    read("app/lib/anatomy-data.ts"),
    read("app/lib/organ-ids.ts"),
    read("app/lib/expanded-organs.ts"),
    read("app/lib/three/procedural-models.ts"),
    read("app/lib/three/loaders.ts"),
    read("app/lib/three/viewer.ts"),
    read("worker/index.ts"),
    read("security-headers.ts"),
    readdir(new URL("public/models/", root)),
  ]);
  assert.equal(models.length, 24);
  for (const model of models) assert.match(model, /^[a-z-]+\.[a-f0-9]{8}\.glb$/);
  const organIds = [...idsSource.matchAll(/^\s+"([a-z-]+)",$/gm)].map((match) => match[1]);
  assert.equal(organIds.length, 24);
  assert.equal(new Set(organIds).size, 24);
  const expandedIds = [...expanded.matchAll(/^\s+id: "([a-z-]+)",$/gm)].map((match) => match[1]);
  assert.equal(expandedIds.length, 12);
  assert.equal([...expanded.matchAll(/^\s+illustrated: true,$/gm)].length, 12);
  assert.doesNotMatch(expanded, /illustrated: false/);
  for (const id of expandedIds) {
    const modelMatch = expanded.match(new RegExp(`id: "${id}"[\\s\\S]*?model: "(/models/${id}\\.[a-f0-9]{8}\\.glb)"`));
    assert.ok(modelMatch, `${id} should use a versioned GLB model`);
    await access(new URL(`public${modelMatch[1]}`, root));
    const glb = await readGlbJson(`public${modelMatch[1]}`);
    const vertexCount = (glb.meshes ?? []).reduce(
      (total, mesh) => total + mesh.primitives.reduce(
        (meshTotal, primitive) => meshTotal + (glb.accessors[primitive.attributes.POSITION]?.count ?? 0),
        0,
      ),
      0,
    );
    assert.ok(glb.meshes.length >= 10, `${id} should contain detailed, individually selectable anatomy`);
    assert.ok(vertexCount > 1000 && vertexCount < 650_000, `${id} should retain anatomy within a bounded mesh budget`);
    assert.ok(glb.extensionsRequired.includes('EXT_meshopt_compression'), `${id} should use compressed delivery`);
    if (id !== "muscles") assert.ok(glb.images.length >= 3, `${id} should embed color, normal, and roughness imagery`);
    else assert.ok(glb.materials.length > 0, "repaired muscles use UV-independent matte anatomy colors");
    if (id === "skeleton") assert.ok(glb.meshes.length >= 80, "skeleton should retain the full BodyParts3D bone set");
    if (id === "muscles") assert.ok(glb.meshes.length >= 120, "muscles should retain the registered scan-based full-body system");
    assert.match(procedural, new RegExp(`(?:"${id}"|${id.replaceAll("-", "")})`));
    const artwork = await readdir(new URL(`public/anatomy/${id}/`, root));
    assert.deepEqual(artwork.sort(), ["compare.webp", "location.webp", "microscopic.webp", "organ.webp", "thumb.webp"]);
  }
  assert.doesNotMatch(expanded, /procedural:/);
  assert.doesNotMatch(loader, /buildProceduralModel|startsWith\("procedural:"\)/);
  assert.match(procedural, /new THREE\.MeshPhysicalMaterial/);
  assert.match(procedural, /function organicize/);
  assert.doesNotMatch(data, /\/models\/[a-z]+\.glb/);
  assert.match(data, /\.\.\.expandedOrgans/);
  assert.match(viewer, /new THREE\.Timer\(\)/);
  assert.doesNotMatch(viewer, /new THREE\.Clock\(\)/);
  assert.match(worker, /new Set<string>\(ORGAN_IDS\)/);
  assert.match(worker, /max-age=31536000, immutable/);
  assert.match(securityHeaders, /connect-src 'self' blob:/, "embedded GLB textures require blob fetches");
});

test("ports upstream multilingual routing and labelling quiz across the expanded atlas", async () => {
  const [config, dictionaries, merge, app, organViewer, viewer, hotspots, localizedPage] = await Promise.all([
    read("app/i18n/config.ts"),
    read("app/i18n/dictionaries.ts"),
    read("app/i18n/merge.ts"),
    read("app/components/AnatomyApp.tsx"),
    read("app/components/OrganViewer.tsx"),
    read("app/lib/three/viewer.ts"),
    read("app/lib/three/hotspots.ts"),
    read("app/components/LocalizedPage.tsx"),
  ]);
  assert.equal([...config.matchAll(/code: "[a-z]{2}"/g)].length, 12);
  for (const locale of ["en", "es", "hi", "zh", "ar", "pt", "fr", "de", "ja", "ru", "id", "ko"]) {
    assert.match(dictionaries, new RegExp(`${locale}: \\(\\) => import\\(\"\\./ui/${locale}\"\\)`));
    await access(new URL(`app/i18n/organs/${locale}.ts`, root));
    await access(new URL(`app/${locale}/page.tsx`, root));
  }
  assert.match(merge, /baseOrgans\.map/);
  assert.match(app, /mode: "labelling"/);
  assert.match(organViewer, /function LabelQuiz/);
  assert.match(organViewer, /onQuizComplete/);
  assert.match(viewer, /setQuizMode/);
  assert.match(viewer, /captureAuthorPoint/);
  assert.match(hotspots, /FLASH_CORRECT/);
  assert.match(localizedPage, /createLocalizedMetadata/);
});
