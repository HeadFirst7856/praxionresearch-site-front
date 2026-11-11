// Netlify Function — station-proxy
// Proxies the "Praxion Control" dashboard API (control-server.js:8890) and the
// session-router chat API (session-router.js:8791) to the browser, but ONLY after
// verifying a valid Station JWT.
//
// Security model:
//   - Outer wall: a valid Station JWT (same secret as netlify/functions/auth.js).
//   - Inner wall: the shared control token (STATION_CONTROL_TOKEN) is injected here,
//     server-side, and never exposed to the browser. The browser only ever sends
//     its Station JWT to this function, never the control token.
//
// Env required:
//   - SIGNAL_JWT_SECRET          (must equal the backend's .env value)
//   - STATION_CONTROL_TOKEN      (contents of 09_STATION/state/control-token.txt)
//   - STATION_CONTROL_ORIGIN     (default http://127.0.0.1:8890)
//   - STATION_ROUTER_ORIGIN      (default http://127.0.0.1:8791)

const JWT_SECRET = process.env.SIGNAL_JWT_SECRET || "";
const CONTROL_TOKEN = process.env.STATION_CONTROL_TOKEN || "";
const CONTROL_ORIGIN = (process.env.STATION_CONTROL_ORIGIN || "http://127.0.0.1:8890").replace(/\/+$/, "");
const ROUTER_ORIGIN = (process.env.STATION_ROUTER_ORIGIN || "http://127.0.0.1:8791").replace(/\/+$/, "");

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}
async function hmac(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}
function constEq(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function verifyJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expect = await hmac(Buffer.from(JWT_SECRET), Buffer.from(`${header}.${body}`));
  if (!constEq(Buffer.from(b64urlDecode(sig)), Buffer.from(expect))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(b64urlDecode(body)).toString()); } catch { return null; }
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

function json(res, status) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
    body: JSON.stringify(res),
  };
}

export const handler = async (event) => {
  const method = event.httpMethod || "GET";
  const path = event.path || "";

  if (method === "OPTIONS") return json({ ok: true }, 204);

  // --- Auth guard: require a valid Station JWT on every request. ---
  const auth = event.headers?.authorization || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return json({ detail: "missing_bearer_token" }, 401);
  const payload = await verifyJwt(auth.slice(7).trim());
  if (!payload) return json({ detail: "invalid_token" }, 401);

  if (!CONTROL_TOKEN) return json({ detail: "station_proxy_misconfigured: STATION_CONTROL_TOKEN" }, 500);

  // --- Route: /api/station/chat* -> session-router (8791); everything else -> control-server (8890). ---
  // The dashboard calls ROUTER + '/chat' where ROUTER is printed as http://127.0.0.1:8791.
  // We rewrite it to a same-origin path the browser can reach through this proxy.
  const chatPrefix = "/api/station/chat";
  let upstream;
  let upstreamPath;
  if (path.startsWith(chatPrefix)) {
    upstream = ROUTER_ORIGIN;
    upstreamPath = path.slice("/api/station".length); // -> /chat, /chat/:id
  } else if (path === "/api/station" || path.startsWith("/api/station/")) {
    upstream = CONTROL_ORIGIN;
    // Control-server routes live under /api/*, so map /api/station/snapshot -> /api/snapshot.
    const rest = path.slice("/api/station".length); // -> "" | "/snapshot" | "/project/..."
    upstreamPath = rest.startsWith("/api/") ? rest : "/api" + (rest || "/snapshot");
  } else {
    return json({ detail: "not_found" }, 404);
  }
  if (!upstreamPath.startsWith("/")) upstreamPath = "/" + upstreamPath;

  const url = new URL(upstream + upstreamPath);
  // forward query string
  const qs = event.rawQuery || event.queryStringParameters || "";
  if (qs) url.search = (url.search ? url.search + "&" : "?") + qs;

  const headers = {
    "Authorization": "Bearer " + CONTROL_TOKEN, // inner wall: shared control token, server-side only
  };
  const copyHeaders = ["content-type"];
  for (const h of copyHeaders) {
    if (event.headers?.[h]) headers[h] = event.headers[h];
  }

  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : (event.body || undefined),
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const text = await res.text();

    return {
      statusCode: res.status,
      headers: {
        "Content-Type": contentType || (isJson ? "application/json" : "text/plain"),
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
      body: text,
    };
  } catch (err) {
    return json({ detail: "station_upstream_unreachable: " + String(err && err.message || err) }, 502);
  }
};
