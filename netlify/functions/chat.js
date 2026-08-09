/**
 * Praxion Terminal — operator chat (Netlify Function).
 * Route: /api/v1/chat
 *
 * Storage: Netlify Blobs. Tries, in order:
 *   1. context.blobs (v2 injected store)
 *   2. getStore with explicit siteID + NETLIFY_FUNCTIONS_TOKEN from env
 *   3. getStore with auto context (NETLIFY_BLOBS_CONTEXT)
 * GET  -> { messages: [{ id, ts, name, text }] }
 * POST -> { name, text } appended, capped at 500 messages.
 */

const BLOB_NAME = "praxion-terminal-chat";
const BLOB_KEY = "messages-v1";
const MAX_MESSAGES = 500;

function json(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function sanitize(text) {
  return String(text ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .slice(0, 500);
}

async function openStore(context) {
  // 1. v2 injected store
  try {
    if (context.blobs?.openStore) {
      const s = context.blobs.openStore({ name: BLOB_NAME });
      if (s) return { store: s, via: "context.blobs" };
    }
  } catch {
    /* fall through */
  }
  // 2. explicit siteID + functions token
  try {
    const { getStore } = await import("@netlify/blobs");
    const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_FUNCTIONS_TOKEN;
    if (siteID && token) {
      const s = getStore({ name: BLOB_NAME, siteID, token });
      if (s) return { store: s, via: "explicit-token" };
    }
  } catch {
    /* fall through */
  }
  // 3. auto context
  try {
    const { getStore } = await import("@netlify/blobs");
    const s = getStore({ name: BLOB_NAME });
    return { store: s, via: "auto" };
  } catch (e) {
    return { error: `auto failed: ${e.message}` };
  }
}

export const handler = async (event, context) => {
  const method = event.httpMethod ?? "GET";
  if (method === "OPTIONS") return json({ ok: true });

  // Debug probe: does the event carry a blobs payload / headers?
  if (method === "GET" && event.headers?.["x-probe-blobs"] === "1") {
    return json({
      hasEventBlobs: Boolean(event.blobs),
      blobHeaders: Object.keys(event.headers ?? {}).filter((k) => /blob|nf/i.test(k)).slice(0, 10),
      nfHeaders: Object.keys(event.headers ?? {}).slice(0, 20),
      eventKeys: Object.keys(event ?? {}).slice(0, 25),
    });
  }

  const opened = await openStore(context);
  if (!opened.store) {
    return json(
      {
        error: `blob store unavailable: ${opened.error ?? "no store"}`,
        env: {
          siteID: process.env.SITE_ID ? "yes" : "no",
          fnToken: process.env.NETLIFY_FUNCTIONS_TOKEN ? "yes" : "no",
          blobCtx: process.env.NETLIFY_BLOBS_CONTEXT ? "yes" : "no",
        },
      },
      500,
    );
  }
  const store = opened.store;

  if (method === "GET") {
    try {
      const raw = await store.get(BLOB_KEY, { type: "json" });
      const messages = Array.isArray(raw) ? raw : [];
      return json({ messages, via: opened.via });
    } catch (e) {
      return json({ error: `read failed: ${e.message}` }, 500);
    }
  }

  if (method === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return json({ error: "invalid json body" }, 400);
    }
    const text = sanitize(payload.text);
    const name = sanitize(payload.name) || "OPERATOR";
    if (!text) return json({ error: "empty message" }, 400);

    try {
      const raw = await store.get(BLOB_KEY, { type: "json" });
      const messages = Array.isArray(raw) ? raw : [];
      const now = new Date().toISOString();
      messages.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: now,
        name,
        text,
      });
      const trimmed = messages.slice(-MAX_MESSAGES);
      await store.set(BLOB_KEY, JSON.stringify(trimmed), { type: "application/json" });
      return json({ ok: true, message: trimmed[trimmed.length - 1], via: opened.via }, 201);
    } catch (e) {
      return json({ error: `write failed: ${e.message}` }, 500);
    }
  }

  return json({ error: "method not allowed" }, 405);
};
