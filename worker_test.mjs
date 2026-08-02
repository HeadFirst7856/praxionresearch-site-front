// Local harness: exercises worker.js auth against the real backend user store.
// Usage: node --env-file=.env worker_test.mjs  (from the site repo; SIGNAL_JWT_SECRET from .env)
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.SIGNAL_JWT_SECRET = process.env.SIGNAL_JWT_SECRET || "";
globalThis.SIGNAL_JWT_SECRET = process.env.SIGNAL_JWT_SECRET;

// import the worker
const { default: worker } = await import("./worker/worker.js");

// serve the users store on a fake origin
const usersJson = readFileSync(process.env.USERS_JSON || "public/data/auth/users.json");
const server = http.createServer((req, res) => {
  if (req.url === "/data/auth/users.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(usersJson);
  } else {
    res.writeHead(404); res.end("nope");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

async function call(p, init) {
  const req = new Request(`${origin}${p}`, init);
  const res = await worker.fetch(req);
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

// 1. login with wrong password -> 401
let r = await call("/api/v1/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: process.env.TEST_EMAIL, password: "wrongpass123" }),
});
console.log("wrong password:", r.status, JSON.stringify(r.body).slice(0, 80));

// 2. login with correct password -> token
r = await call("/api/v1/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASS }),
});
console.log("login:", r.status, "token?", Boolean(r.body?.token), "user:", JSON.stringify(r.body?.user));
const token = r.body?.token;

// 3. /me with token -> email
if (token) {
  r = await call("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  console.log("me:", r.status, JSON.stringify(r.body));
}

// 4. /me with bad token -> 401
r = await call("/api/v1/auth/me", { headers: { Authorization: "Bearer garbage.token.here" } });
console.log("me bad token:", r.status);

server.close();
