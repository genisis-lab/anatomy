import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

function environment() {
  return {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

function context() {
  return { waitUntil() {}, passThroughOnException() {} };
}

test("server-renders the complete Anatomy Atelier experience", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), environment(), context());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const html = await response.text();
  assert.match(html, /Anatomy Atelier/);
  assert.match(html, /Learn anatomy like an artist/);
  assert.match(html, /Organ library/);
  assert.match(html, /View lesson/);
  assert.match(html, /Interactive education, not medical advice/);
  for (const specimen of [
    "Stomach",
    "Esophagus",
    "Knee",
    "Spleen",
    "Skeleton",
    "Muscles",
    "Ear",
    "Spinal Cord",
    "Bladder",
    "Thyroid",
    "Spleen &amp; Lymph Nodes",
    "Uterus &amp; Ovaries",
    "Testes &amp; Prostate",
    "Gallbladder",
    "Airway &amp; Diaphragm",
  ]) assert.match(html, new RegExp(specimen));
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("serves public legal pages and a custom not-found page", async () => {
  const worker = await loadWorker();
  for (const [path, expected, status] of [
    ["/privacy", "Privacy", 200],
    ["/terms", "Terms", 200],
    ["/missing-specimen", "Specimen not found", 404],
  ]) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), environment(), context());
    assert.equal(response.status, status);
    assert.match(await response.text(), new RegExp(expected, "i"));
  }
});
