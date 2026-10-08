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

/** Splits a content module into its specimen entries, keyed by organ id. */
function specimenSections(source) {
  return Object.fromEntries(source.split(/\n  \{\n/).slice(1).map((section) => [section.match(/id: "([a-z-]+)"/)[1], section]));
}

test("Three.js specimens decode, match the manifest, and anchor every hotspot", async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({"meshopt.decoder": MeshoptDecoder});
  const manifest = JSON.parse(await read("app/lib/three-models.json"));
  const sections = {
    ...specimenSections(await read("app/lib/expanded-organs.ts")),
    ...specimenSections(await read("app/lib/additional-organs.ts")),
  };
  assert.equal(Object.keys(manifest).length, 21);
  assert.deepEqual(Object.keys(manifest).sort(), Object.keys(sections).sort());
  for (const [id, record] of Object.entries(manifest)) {
    assert.match(record.model, new RegExp(`^/models/${id}\\.[a-f0-9]{8}\\.glb$`));
    const bytes = await readFile(new URL(`public${record.model}`, root));
    assert.equal(bytes.length, record.bytes);
    assert.ok(record.bytes < 4_000_000, `${id}: transfer budget`);
    assert.ok(record.model.includes(createHash("sha256").update(bytes).digest("hex").slice(0, 8)), `${id}: content hash`);
    const glb = await readGlbJson(`public${record.model}`);
    assert.ok(glb.extensionsRequired.includes("EXT_meshopt_compression"), `${id} should use compressed delivery`);
    const doc = await io.readBinary(bytes);
    const nodes = doc.getRoot().listNodes().filter((node) => node.getMesh());
    assert.equal(nodes.length, record.meshes);
    assert.ok(record.meshes >= 4, `${id} should contain individually selectable structures`);
    const bounds = getBounds(doc.getRoot().listScenes()[0]);
    assert.ok([...bounds.min, ...bounds.max].every(Number.isFinite));
    const extent = Math.max(...bounds.max.map((v, i) => v - bounds.min[i]));
    assert.ok(extent > 1 && extent < 10, `${id} should be authored at viewer scale`);
    let triangles = 0;
    for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute("POSITION");
      assert.ok(positions.getCount() > 0);
      assert.ok(positions.getArray().every(Number.isFinite));
      assert.ok(primitive.getAttribute("NORMAL"), `${id}: normals`);
      assert.ok(primitive.getAttribute("COLOR_0"), `${id}: painted vertex colour`);
      const indices = primitive.getIndices().getArray();
      assert.ok(indices.every((index) => index < positions.getCount()));
      triangles += indices.length / 3;
    }
    assert.equal(triangles, record.triangles);
    assert.ok(triangles > 50_000 && triangles < 500_000, `${id} should be detailed within a bounded budget`);
    const names = new Set(nodes.map((node) => node.getName()));
    const hotspots = [...sections[id].split("hotspots: spots(")[1].matchAll(/\["([a-z-]+)", "/g)].map((match) => match[1]);
    assert.ok(hotspots.length >= 7, `${id} should label its structures`);
    for (const hotspot of hotspots) {
      const anchor = record.anchors[hotspot];
      assert.ok(anchor, `${id}: ${hotspot} has a built anchor`);
      assert.ok(names.has(anchor.meshName), `${id}: ${anchor.meshName} exists`);
      assert.equal(anchor.position.length, 3);
      assert.ok(anchor.position.every((v) => Number.isFinite(v) && Math.abs(v) < 2.5));
    }
    assert.ok(sections[id].match(/modelNote: "([^"]+)"/)?.[1].length > 80, `${id}: model note`);
    const artwork = await readdir(new URL(`public/anatomy/${id}/`, root));
    const expected = /specimenOnly: true/.test(sections[id]) ? ["organ.webp", "thumb.webp"] : ["compare.webp", "location.webp", "microscopic.webp", "organ.webp", "thumb.webp"];
    for (const art of expected) assert.ok(artwork.includes(art), `${id}: ${art}`);
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
  const [data, idsSource, expanded, additional, loader, viewer, worker, securityHeaders, models] = await Promise.all([
    read("app/lib/anatomy-data.ts"),
    read("app/lib/organ-ids.ts"),
    read("app/lib/expanded-organs.ts"),
    read("app/lib/additional-organs.ts"),
    read("app/lib/three/loaders.ts"),
    read("app/lib/three/viewer.ts"),
    read("worker/index.ts"),
    read("security-headers.ts"),
    readdir(new URL("public/models/", root)),
  ]);
  assert.equal(models.length, 30);
  for (const model of models) assert.match(model, /^[a-z-]+\.[a-f0-9]{8}\.glb$/);
  const organIds = [...idsSource.matchAll(/^\s+"([a-z-]+)",$/gm)].map((match) => match[1]);
  assert.equal(organIds.length, 30);
  assert.equal(new Set(organIds).size, 30);
  for (const id of organIds) assert.equal(models.filter((model) => model.startsWith(`${id}.`)).length, 1, `${id} should ship exactly one model`);
  const expandedIds = [...expanded.matchAll(/^\s+id: "([a-z-]+)",$/gm)].map((match) => match[1]);
  assert.equal(expandedIds.length, 12);
  assert.equal([...expanded.matchAll(/^\s+illustrated: true,$/gm)].length, 12);
  assert.doesNotMatch(expanded, /illustrated: false/);
  assert.doesNotMatch(additional, /illustrated: false/);
  for (const source of [expanded, additional]) {
    assert.match(source, /content\.map\(withThreeModel\)/);
    assert.doesNotMatch(source, /model: "|procedural:/);
  }
  assert.doesNotMatch(loader, /buildProceduralModel|startsWith\("procedural:"\)/);
  assert.doesNotMatch(data, /\/models\/[a-z]+\.glb/);
  assert.doesNotMatch(data, /detailed-studies/);
  assert.match(data, /\.\.\.expandedOrgans/);
  assert.match(data, /\.\.\.additionalOrgans/);
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
