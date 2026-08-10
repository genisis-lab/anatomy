import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("ships complete navigation and learning surfaces", async () => {
  const [app, views, dialog, css] = await Promise.all([
    read("app/components/AnatomyApp.tsx"),
    read("app/components/ProductViews.tsx"),
    read("app/components/LearningDialog.tsx"),
    read("app/globals.css"),
  ]);
  for (const label of ["explore", "systems", "lessons", "library", "notes"]) assert.match(app, new RegExp(`\\[\"${label}\"`));
  assert.match(views, /export function MobileNav/);
  assert.match(views, /export function ComparisonPanel/);
  assert.match(views, /onNoteSaved/);
  assert.match(dialog, /showModal\(\)/);
  assert.match(dialog, /quizQuestions/);
  assert.match(app, /prefers-reduced-motion/);
  assert.match(css, /\.hotspot-controls/);
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
  const [data, idsSource, expanded, procedural, loader, viewer, worker, models] = await Promise.all([
    read("app/lib/anatomy-data.ts"),
    read("app/lib/organ-ids.ts"),
    read("app/lib/expanded-organs.ts"),
    read("app/lib/three/procedural-models.ts"),
    read("app/lib/three/loaders.ts"),
    read("app/lib/three/viewer.ts"),
    read("worker/index.ts"),
    readdir(new URL("public/models/", root)),
  ]);
  assert.equal(models.length, 21);
  for (const model of models) assert.match(model, /^[a-z-]+\.[a-f0-9]{8}\.glb$/);
  const organIds = [...idsSource.matchAll(/^\s+"([a-z-]+)",$/gm)].map((match) => match[1]);
  assert.equal(organIds.length, 21);
  assert.equal(new Set(organIds).size, 21);
  const expandedIds = [...expanded.matchAll(/^\s+id: "([a-z-]+)",$/gm)].map((match) => match[1]);
  assert.equal(expandedIds.length, 12);
  assert.equal([...expanded.matchAll(/^\s+illustrated: true,$/gm)].length, 12);
  assert.doesNotMatch(expanded, /illustrated: false/);
  for (const id of expandedIds) {
    const modelMatch = expanded.match(new RegExp(`id: "${id}"[\\s\\S]*?model: "(/models/${id}\\.[a-f0-9]{8}\\.glb)"`));
    assert.ok(modelMatch, `${id} should use a versioned GLB model`);
    await access(new URL(`public${modelMatch[1]}`, root));
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
