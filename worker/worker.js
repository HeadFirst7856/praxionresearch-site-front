/**
 * Praxion auth worker — serverless login/me, mirror of the FastAPI backend auth
 * (app/auth/accounts.py + app/auth/jwt.py).
 *
 * Password store: pbkdf2_sha256$210000$<salt_b64>$<digest_b64>  (WebCrypto PBKDF2)
 * JWT: HS256, payload {sub: email, name, email, exp: now+7d, iat}
 * Users file: /data/auth/users.json on the same origin (synced daily by the pipeline).
 * Secret: env SIGNAL_JWT_SECRET (must equal backend .env SIGNAL_JWT_SECRET).
 */
const JWT_SECRET = globalThis.SIGNAL_JWT_SECRET || "";
function secretFor(env) {
  return (env && env.SIGNAL_JWT_SECRET) || globalThis.SIGNAL_JWT_SECRET || "";
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}
async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations }, key, 256
    )
  );
}
function constEq(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

async function signJwt(payload, secret) {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSha256(new TextEncoder().encode(secret), new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expect = await hmacSha256(new TextEncoder().encode(secret), new TextEncoder().encode(`${header}.${body}`));
  if (!constEq(b64urlDecode(sig), expect)) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))); } catch { return null; }
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  if (!payload.sub) return null;
  return payload;
}

async function loadUsers(request) {
  const url = new URL("/data/auth/users.json", request.url);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("user_store_unavailable");
  return res.json();
}

function json(res, status) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function handleLogin(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ detail: "invalid_json" }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (email.length < 5 || password.length < 3) {
    return json({ detail: "email and password required (password >= 3 chars)" }, 422);
  }
  const store = await loadUsers(request);
  const user = store.users_by_email?.[email];
  if (!user) return json({ detail: "invalid_credentials" }, 401);
  const [algo, iterRaw, saltRaw, digestRaw] = String(user.password_hash || "").split("$", 4);
  if (algo !== "pbkdf2_sha256") return json({ detail: "invalid_credentials" }, 401);
  const actual = await pbkdf2(password, b64urlDecode(saltRaw), parseInt(iterRaw, 10));
  if (!constEq(actual, b64urlDecode(digestRaw))) return json({ detail: "invalid_credentials" }, 401);
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ sub: user.email, name: user.name || user.email, email: user.email, iat: now, exp: now + 7 * 86400 }, secretFor(env));
  return json({ token, user: { id: user.id, name: user.name, email: user.email } }, 200);
}

async function handleMe(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return json({ detail: "missing_bearer_token" }, 401);
  const payload = await verifyJwt(auth.slice(7).trim(), secretFor(env));
  if (!payload) return json({ detail: "invalid_token" }, 401);
  return json({ email: payload.email, name: payload.name }, 200);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === "POST" && p.endsWith("/auth/login")) return handleLogin(request, env);
    if (request.method === "GET" && p.endsWith("/auth/me")) return handleMe(request, env);
    return json({ detail: "not_found" }, 404);
  },
};
