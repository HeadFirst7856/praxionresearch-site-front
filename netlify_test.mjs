// Local harness for the Netlify auth function (tests login/me against a real user store).
import http from "node:http";
import { readFileSync } from "node:fs";

process.env.SIGNAL_JWT_SECRET = process.env.SIGNAL_JWT_SECRET || "";
const { handler } = await import("./netlify/functions/auth.js");

const users = readFileSync(process.env.USERS_JSON || "public/data/auth/users.json");
const srv = http.createServer((q, r) => {
  if (q.url === "/data/auth/users.json") { r.writeHead(200); r.end(users); }
  else { r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
process.env.URL = `http://127.0.0.1:${srv.address().port}`;

async function call(method, path, body, headers = {}) {
  const res = await handler({
    httpMethod: method,
    path,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  let parsed = null;
  try { parsed = JSON.parse(res.body); } catch {}
  return { status: res.statusCode, body: parsed };
}

let r = await call("POST", "/api/v1/auth/login", { email: process.env.TEST_EMAIL, password: "wrongpass123" });
console.log("wrong password:", r.status, JSON.stringify(r.body).slice(0, 60));
r = await call("POST", "/api/v1/auth/login", { email: process.env.TEST_EMAIL, password: process.env.TEST_PASS });
console.log("login:", r.status, "token?", Boolean(r.body?.token), "user:", JSON.stringify(r.body?.user));
const token = r.body?.token;
if (token) {
  r = await call("GET", "/api/v1/auth/me", null, { authorization: `Bearer ${token}` });
  console.log("me:", r.status, JSON.stringify(r.body));
}
r = await call("GET", "/api/v1/auth/me", null, { authorization: "Bearer bad.token.x" });
console.log("me bad token:", r.status);
r = await call("POST", "/api/v1/auth/login", { email: process.env.TEST_EMAIL, password: "short" });
console.log("short password:", r.status);
srv.close();
