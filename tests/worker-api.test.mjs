import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

function mockD1() {
  const states = new Map();
  const events = [];
  return {
    states,
    events,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (!sql.includes("SELECT payload")) return null;
              const payload = states.get(values[0]);
              return payload ? { payload } : null;
            },
            async run() {
              if (sql.includes("INSERT INTO learner_state")) states.set(values[0], values[1]);
              if (sql.includes("INSERT INTO analytics_events")) events.push(values);
              return { success: true };
            },
          };
        },
      };
    },
  };
}

function request(path, init = {}) {
  return new Request(`https://anatomy.test${path}`, init);
}

test("round-trips normalized learner state in an anonymous session", async () => {
  const worker = await loadWorker();
  const DB = mockD1();
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const first = await worker.fetch(request("/api/state"), { DB }, ctx);
  assert.equal(first.status, 200);
  const cookie = first.headers.get("set-cookie");
  assert.match(cookie ?? "", /anatomy_session=.*HttpOnly; SameSite=Lax; Secure/);

  const state = {
    bookmarks: ["heart", "stomach", "skeleton", "not-an-organ"],
    completedLessons: ["brain", "airway-diaphragm"],
    notes: { heart: "Follow the chambers", thyroid: "Compare the two lobes" },
    structureNotes: { heart: { aorta: "Carries blood away", "bad key!": "drop" } },
    structureBookmarks: { heart: ["aorta", "left-ventricle", "bad key!", "aorta"] },
    quizScores: { brain: 9, "female-reproductive": 2 },
    quizAttempts: { heart: [{ mode: "labelling", score: 4, total: 6, completedAt: 1234 }] },
    structureProgress: { heart: { aorta: { correct: 2, attempts: 3, lastReviewed: 1234 } } },
    lessonProgress: { heart: 2, brain: 12 },
    lastStudiedAt: { heart: 1234 },
    recentOrgans: ["heart", "spinal-cord"],
  };
  const saved = await worker.fetch(request("/api/state", { method: "PUT", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(state) }), { DB }, ctx);
  assert.equal(saved.status, 200);

  const read = await worker.fetch(request("/api/state", { headers: { cookie } }), { DB }, ctx);
  assert.deepEqual(await read.json(), {
    bookmarks: ["heart", "stomach", "skeleton"],
    completedLessons: ["brain", "airway-diaphragm"],
    notes: { heart: "Follow the chambers", thyroid: "Compare the two lobes" },
    structureNotes: { heart: { aorta: "Carries blood away" } },
    structureBookmarks: { heart: ["aorta", "left-ventricle"] },
    quizScores: { brain: 3, "female-reproductive": 2 },
    quizAttempts: { heart: [{ mode: "labelling", score: 4, total: 6, completedAt: 1234 }] },
    structureProgress: { heart: { aorta: { correct: 2, attempts: 3, lastReviewed: 1234 } } },
    lessonProgress: { heart: 2, brain: 3 },
    lastStudiedAt: { heart: 1234 },
    recentOrgans: ["heart", "spinal-cord"],
  });
});

test("accepts allowlisted analytics and rejects unsafe writes", async () => {
  const worker = await loadWorker();
  const DB = mockD1();
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(promise); }, passThroughOnException() {} };
  const accepted = await worker.fetch(request("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "quiz_completed", organId: "heart", metadata: { score: 3 } }) }), { DB }, ctx);
  assert.equal(accepted.status, 202);
  await Promise.all(pending);
  assert.equal(DB.events.length, 1);

  const expanded = await worker.fetch(request("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "lesson_completed", organId: "gallbladder" }) }), { DB }, ctx);
  assert.equal(expanded.status, 202);
  await Promise.all(pending);
  assert.equal(DB.events.length, 2);

  const unknown = await worker.fetch(request("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "arbitrary" }) }), { DB }, ctx);
  assert.equal(unknown.status, 400);
  const crossOrigin = await worker.fetch(request("/api/state", { method: "PUT", headers: { origin: "https://attacker.test", "content-type": "application/json" }, body: "{}" }), { DB }, ctx);
  assert.equal(crossOrigin.status, 403);
});
