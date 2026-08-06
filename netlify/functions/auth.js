// Netlify Function — POST /api/v1/auth/login (serverless, scale-to-zero)
// Mirrors backend auth: PBKDF2-SHA256 (210k) verify + HS256 JWT.
// Secret: env SIGNAL_JWT_SECRET (must equal backend .env value). Users: /data/auth/users.json.
const JWT_SECRET = process.env.SIGNAL_JWT_SECRET || "";

function normalizeBaseUrl(value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

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
async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations }, key, 256));
}
function constEq(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function signJwt(payload) {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = await hmac(Buffer.from(JWT_SECRET), Buffer.from(`${header}.${body}`));
  return `${header}.${body}.${b64url(Buffer.from(sig))}`;
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
async function loadUsers(event) {
  const headers = event?.headers || {};
  const proto = headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "https";
  const forwardedHost = headers["x-forwarded-host"] || headers["X-Forwarded-Host"] || headers.host || headers.Host;
  const candidates = [
    forwardedHost ? `${proto}://${forwardedHost}` : null,
    normalizeBaseUrl(process.env.URL),
    normalizeBaseUrl(process.env.DEPLOY_PRIME_URL),
    normalizeBaseUrl(process.env.DEPLOY_URL),
    normalizeBaseUrl(process.env.SITE_URL),
    "https://www.praxionresearch.com",
  ].filter(Boolean);

  for (const base of [...new Set(candidates)]) {
    try {
      const res = await fetch(new URL("/data/auth/users.json", base));
      if (res.ok) return res.json();
    } catch {}
  }
  throw new Error("user_store_unavailable");
}
function json(res, status) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(res),
  };
}

export const handler = async (event) => {
  const method = event.httpMethod;
  const path = event.path || "";
  try {
    if (method === "POST" && path.endsWith("/auth/login")) {
      const body = JSON.parse(event.body || "{}");
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (email.length < 5 || password.length < 8) return json({ detail: "email and password required (password >= 8 chars)" }, 422);
      const store = await loadUsers(event);
      const user = store.users_by_email?.[email];
      if (!user) return json({ detail: "invalid_credentials" }, 401);
      const [algo, iterRaw, saltRaw, digestRaw] = String(user.password_hash || "").split("$", 4);
      if (algo !== "pbkdf2_sha256") return json({ detail: "invalid_credentials" }, 401);
      const actual = await pbkdf2(password, b64urlDecode(saltRaw), parseInt(iterRaw, 10));
      if (!constEq(Buffer.from(actual), Buffer.from(b64urlDecode(digestRaw)))) return json({ detail: "invalid_credentials" }, 401);
      const now = Math.floor(Date.now() / 1000);
      const token = await signJwt({ sub: user.email, name: user.name || user.email, email: user.email, iat: now, exp: now + 7 * 86400 });
      return json({ token, user: { id: user.id, name: user.name, email: user.email } }, 200);
    }
    if (method === "GET" && path.endsWith("/auth/me")) {
      const auth = event.headers.authorization || "";
      if (!auth.toLowerCase().startsWith("bearer ")) return json({ detail: "missing_bearer_token" }, 401);
      const payload = await verifyJwt(auth.slice(7).trim());
      if (!payload) return json({ detail: "invalid_token" }, 401);
      return json({ email: payload.email, name: payload.name }, 200);
    }
    return json({ detail: "not_found" }, 404);
  } catch (err) {
    return json({ detail: String(err && err.message || err) }, 500);
  }
};
