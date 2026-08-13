import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ORGAN_IDS } from "../app/lib/organ-ids";
import { applySecurityHeaders } from "../security-headers";

type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
  EVENT_RATE_LIMITER: RateLimit;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  STATE_WRITE_RATE_LIMITER: RateLimit;
};

const ORGAN_ID_SET = new Set<string>(ORGAN_IDS);
const EVENT_NAMES = new Set([
  "app_opened",
  "view_changed",
  "organ_selected",
  "hotspot_selected",
  "lesson_started",
  "lesson_completed",
  "quiz_started",
  "quiz_completed",
  "comparison_opened",
  "bookmark_toggled",
  "note_saved",
  "model_loaded",
  "model_load_failed",
]);
const SESSION_COOKIE = "anatomy_session";
const SESSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_JSON_BYTES = 64 * 1024;

function securityHeaders(headers = new Headers()) {
  return applySecurityHeaders(headers);
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = securityHeaders(new Headers(init.headers));
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...init, headers });
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  for (const pair of cookie.split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function learnerSession(request: Request) {
  const current = cookieValue(request, SESSION_COOKIE);
  const id = current && SESSION_PATTERN.test(current) ? current : crypto.randomUUID();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const setCookie = current ? null : `${SESSION_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure`;
  return { hash, setCookie };
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > MAX_JSON_BYTES) throw new RangeError("Request body is too large");
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new RangeError("Request body is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function sameOriginWrite(request: Request) {
  const origin = request.headers.get("Origin");
  return origin === new URL(request.url).origin;
}

function isJsonRequest(request: Request) {
  return request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json") ?? false;
}

async function withinRateLimit(request: Request, limiter: RateLimit) {
  const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
  return (await limiter.limit({ key })).success;
}

function normalizedState(value: unknown) {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const organArray = (candidate: unknown) => Array.isArray(candidate)
    ? [...new Set(candidate.filter((item): item is string => typeof item === "string" && ORGAN_ID_SET.has(item)))].slice(0, ORGAN_IDS.length)
    : [];
  const notes: Record<string, string> = {};
  if (data.notes && typeof data.notes === "object") {
    for (const [organId, note] of Object.entries(data.notes as Record<string, unknown>)) {
      if (ORGAN_ID_SET.has(organId) && typeof note === "string") notes[organId] = note.slice(0, 10_000);
    }
  }
  const quizScores: Record<string, number> = {};
  if (data.quizScores && typeof data.quizScores === "object") {
    for (const [organId, score] of Object.entries(data.quizScores as Record<string, unknown>)) {
      if (ORGAN_ID_SET.has(organId) && typeof score === "number" && Number.isFinite(score)) quizScores[organId] = Math.max(0, Math.min(3, Math.round(score)));
    }
  }
  const structureNotes: Record<string, Record<string, string>> = {};
  if (data.structureNotes && typeof data.structureNotes === "object") {
    for (const [organId, candidate] of Object.entries(data.structureNotes as Record<string, unknown>)) {
      if (!ORGAN_ID_SET.has(organId) || !candidate || typeof candidate !== "object") continue;
      structureNotes[organId] = Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .filter(([id, note]) => /^[a-z0-9-]{1,60}$/i.test(id) && typeof note === "string")
          .slice(0, 16)
          .map(([id, note]) => [id, (note as string).slice(0, 320)]),
      );
    }
  }
  const structureProgress: Record<string, Record<string, { correct: number; attempts: number; lastReviewed: number }>> = {};
  if (data.structureProgress && typeof data.structureProgress === "object") {
    for (const [organId, candidate] of Object.entries(data.structureProgress as Record<string, unknown>)) {
      if (!ORGAN_ID_SET.has(organId) || !candidate || typeof candidate !== "object") continue;
      structureProgress[organId] = Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .filter(([id, progress]) => /^[a-z0-9-]{1,60}$/i.test(id) && progress && typeof progress === "object")
          .slice(0, 16)
          .map(([id, progress]) => {
            const entry = progress as Record<string, unknown>;
            const attempts = Math.max(0, Math.min(999, Math.round(Number(entry.attempts) || 0)));
            const correct = Math.max(0, Math.min(attempts, Math.round(Number(entry.correct) || 0)));
            return [id, { correct, attempts, lastReviewed: Math.max(0, Number(entry.lastReviewed) || 0) }];
          }),
      );
    }
  }
  const quizAttempts: Record<string, Array<{ mode: "knowledge" | "labelling"; score: number; total: number; completedAt: number }>> = {};
  if (data.quizAttempts && typeof data.quizAttempts === "object") {
    for (const [organId, candidate] of Object.entries(data.quizAttempts as Record<string, unknown>)) {
      if (!ORGAN_ID_SET.has(organId) || !Array.isArray(candidate)) continue;
      quizAttempts[organId] = candidate.slice(-12).flatMap((attempt) => {
        if (!attempt || typeof attempt !== "object") return [];
        const entry = attempt as Record<string, unknown>;
        const mode = entry.mode === "labelling" ? "labelling" : "knowledge";
        const total = Math.max(1, Math.min(20, Math.round(Number(entry.total) || 1)));
        const score = Math.max(0, Math.min(total, Math.round(Number(entry.score) || 0)));
        return [{ mode, score, total, completedAt: Math.max(0, Number(entry.completedAt) || 0) }];
      });
    }
  }
  const numberMap = (candidate: unknown, maximum: number) => candidate && typeof candidate === "object"
    ? Object.fromEntries(Object.entries(candidate as Record<string, unknown>)
      .filter(([organId, number]) => ORGAN_ID_SET.has(organId) && typeof number === "number" && Number.isFinite(number))
      .map(([organId, number]) => [organId, Math.max(0, Math.min(maximum, Math.round(number as number)))]))
    : {};
  const structureBookmarks: Record<string, string[]> = {};
  if (data.structureBookmarks && typeof data.structureBookmarks === "object") {
    for (const [organId, candidate] of Object.entries(data.structureBookmarks as Record<string, unknown>)) {
      if (!ORGAN_ID_SET.has(organId) || !Array.isArray(candidate)) continue;
      structureBookmarks[organId] = [...new Set(candidate.filter((id): id is string => typeof id === "string" && /^[a-z0-9-]{1,60}$/i.test(id)))].slice(0, 16);
    }
  }
  return {
    bookmarks: organArray(data.bookmarks),
    completedLessons: organArray(data.completedLessons),
    notes,
    structureNotes,
    structureBookmarks,
    quizScores,
    quizAttempts,
    structureProgress,
    lessonProgress: numberMap(data.lessonProgress, 3),
    lastStudiedAt: numberMap(data.lastStudiedAt, Number.MAX_SAFE_INTEGER),
    recentOrgans: organArray(data.recentOrgans).slice(0, 6),
  };
}

async function handleState(request: Request, env: Env) {
  if (request.method !== "GET" && request.method !== "PUT") return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET, PUT" } });
  if (request.method === "PUT" && !sameOriginWrite(request)) return json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
  if (request.method === "PUT" && !isJsonRequest(request)) return json({ error: "Send a JSON request body" }, { status: 415 });
  if (request.method === "PUT" && !(await withinRateLimit(request, env.STATE_WRITE_RATE_LIMITER))) {
    return json({ error: "Too many state updates" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const session = await learnerSession(request);
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT payload FROM learner_state WHERE session_hash = ?").bind(session.hash).first<{ payload: string }>();
    const state = row?.payload ? normalizedState(JSON.parse(row.payload)) : normalizedState(null);
    const response = json(state);
    if (session.setCookie) response.headers.append("Set-Cookie", session.setCookie);
    return response;
  }

  const state = normalizedState(await readBoundedJson(request));
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO learner_state (session_hash, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(session_hash) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).bind(session.hash, JSON.stringify(state), now).run();
  const response = json({ saved: true, updatedAt: now });
  if (session.setCookie) response.headers.append("Set-Cookie", session.setCookie);
  return response;
}

async function handleEvent(request: Request, env: Env, ctx: ExecutionContext) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  if (!sameOriginWrite(request)) return json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
  if (!isJsonRequest(request)) return json({ error: "Send a JSON request body" }, { status: 415 });
  if (!(await withinRateLimit(request, env.EVENT_RATE_LIMITER))) {
    return json({ error: "Too many analytics events" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const payload = await readBoundedJson(request);
  if (!payload || typeof payload !== "object") return json({ error: "Invalid event" }, { status: 400 });
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.event !== "string" || !EVENT_NAMES.has(candidate.event)) return json({ error: "Unknown event" }, { status: 400 });
  const organId = typeof candidate.organId === "string" && ORGAN_ID_SET.has(candidate.organId) ? candidate.organId : null;
  const metadata = candidate.metadata && typeof candidate.metadata === "object"
    ? JSON.stringify(Object.fromEntries(Object.entries(candidate.metadata as Record<string, unknown>).slice(0, 12).map(([key, value]) => [key.slice(0, 40), typeof value === "string" ? value.slice(0, 120) : value])))
    : null;
  const session = await learnerSession(request);
  ctx.waitUntil(env.DB.prepare(`
    INSERT INTO analytics_events (session_hash, event, organ_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(session.hash, candidate.event, organId, metadata, Date.now()).run());
  const response = json({ accepted: true }, { status: 202 });
  if (session.setCookie) response.headers.append("Set-Cookie", session.setCookie);
  return response;
}

async function staticAsset(request: Request, env: Env, url: URL) {
  const response = await env.ASSETS.fetch(request);
  const headers = securityHeaders(new Headers(response.headers));
  if (/\/models\/[^/]+\.[a-f0-9]{8}\.glb$/i.test(url.pathname) || url.pathname.startsWith("/assets/")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    headers.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/state") return await handleState(request, env);
      if (url.pathname === "/api/events") return await handleEvent(request, env, ctx);

      if (url.pathname === "/_vinext/image") {
        const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
        return await handleImageOptimization(request, {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
            return result.response();
          },
        }, allowedWidths);
      }

      if (request.method === "GET" && (/^\/(models|anatomy|assets|basis|draco)\//.test(url.pathname) || /^\/(favicon|icon-|apple-touch-icon|og\.)/.test(url.pathname))) {
        return await staticAsset(request, env, url);
      }

      const response = await handler.fetch(request, env, ctx);
      const headers = securityHeaders(new Headers(response.headers));
      if (response.headers.get("Content-Type")?.includes("text/html")) headers.set("Cache-Control", "public, max-age=0, must-revalidate");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      console.error(JSON.stringify({
        message: "request_failed",
        path: url.pathname,
        method: request.method,
        error: error instanceof Error ? error.message : "Unknown error",
      }));
      if (error instanceof RangeError) return json({ error: error.message }, { status: 413 });
      if (error instanceof SyntaxError) return json({ error: "Malformed JSON" }, { status: 400 });
      return json({ error: "Request failed" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

export default worker;
