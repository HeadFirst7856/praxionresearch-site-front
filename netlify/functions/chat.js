/**
 * Praxion Terminal — operator chat (Netlify Function).
 * Route: /api/v1/chat
 *
 * Storage: Netlify Blobs via the function context (context.blobs), injected by
 * the platform at invocation time — no env vars required.
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

export const handler = async (event, context) => {
  const method = event.httpMethod ?? "GET";

  if (method === "OPTIONS") return json({ ok: true });

  let store;
  try {
    store = context.blobs?.openStore ? context.blobs.openStore({ name: BLOB_NAME }) : null;
  } catch {
    store = null;
  }
  if (!store) {
    return json({
      error: "blob store unavailable (no context.blobs)",
      hasBlobs: Boolean(context.blobs),
      keys: Object.keys(context ?? {}).slice(0, 15),
    }, 500);
  }

  if (method === "GET") {
    try {
      const raw = await store.get(BLOB_KEY, { type: "json" });
      const messages = Array.isArray(raw) ? raw : [];
      return json({ messages });
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
      return json({ ok: true, message: trimmed[trimmed.length - 1] }, 201);
    } catch (e) {
      return json({ error: `write failed: ${e.message}` }, 500);
    }
  }

  return json({ error: "method not allowed" }, 405);
};
