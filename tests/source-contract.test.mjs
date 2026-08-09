import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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
  const [data, idsSource, expanded, procedural, viewer, worker, models] = await Promise.all([
    read("app/lib/anatomy-data.ts"),
    read("app/lib/organ-ids.ts"),
    read("app/lib/expanded-organs.ts"),
    read("app/lib/three/procedural-models.ts"),
    read("app/lib/three/viewer.ts"),
    read("worker/index.ts"),
    readdir(new URL("public/models/", root)),
  ]);
  assert.equal(models.length, 9);
  for (const model of models) assert.match(model, /^[a-z]+\.[a-f0-9]{8}\.glb$/);
  const organIds = [...idsSource.matchAll(/^\s+"([a-z-]+)",$/gm)].map((match) => match[1]);
  assert.equal(organIds.length, 21);
  assert.equal(new Set(organIds).size, 21);
  const expandedIds = [...expanded.matchAll(/^\s+id: "([a-z-]+)",$/gm)].map((match) => match[1]);
  assert.equal(expandedIds.length, 12);
  for (const id of expandedIds) {
    assert.match(expanded, new RegExp(`model: "procedural:${id}"`));
    assert.match(procedural, new RegExp(`(?:"${id}"|${id.replaceAll("-", "")})`));
  }
  assert.doesNotMatch(data, /\/models\/[a-z]+\.glb/);
  assert.match(data, /\.\.\.expandedOrgans/);
  assert.match(viewer, /new THREE\.Timer\(\)/);
  assert.doesNotMatch(viewer, /new THREE\.Clock\(\)/);
  assert.match(worker, /new Set<string>\(ORGAN_IDS\)/);
  assert.match(worker, /max-age=31536000, immutable/);
});
