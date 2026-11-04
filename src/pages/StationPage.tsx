// StationPage — embeds the "Praxion Control" dashboard (control-server UI) behind the
// Praxion Station login wall. The original control-ui.html is self-contained (inline CSS + one
// <script> block) and calls:
//   - fetch('/api/...')             -> control-server (8890)
//   - fetch(ROUTER + '/chat...')    -> session-router (8791)
//
// We load the raw HTML, run its script inside an isolated <iframe> (same-origin), and
// install a small fetch shim inside that iframe that:
//   1. Rewrites '/api/*'            -> '/api/station/*'  (control-server via proxy)
//   2. Rewrites the hardcoded ROUTER host -> '/api/station/chat' (router via proxy)
//   3. Attaches the Station JWT as 'Authorization: Bearer <token>'
//
// The proxy (netlify/functions/station-proxy.js) then verifies the JWT and injects the
// shared STATION_CONTROL_TOKEN server-side before forwarding to the local servers.
//
// The browser NEVER sees the control token — only this page's JWT.
import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { loadAuthSession } from "@/lib/authStorage";
import controlUiHtml from "./station/control-ui.html?raw";

// Route the station dashboard through Netlify's station-proxy (JWT-gated).
// The proxy verifies the Station JWT, injects the control token server-side,
// and forwards to the local control-server (8890) + session-router (8791).
// The browser NEVER talks to the tunnel/backend directly and NEVER sees the control token.
const ROUTER_RE = /var\s+ROUTER\s*=\s*'http:\/\/127\.0\.0\.1:8791'/;
const ROUTER_REPLACE = "var ROUTER='/api/station/chat'";

function patchedHtml(): string {
  // Rewrite the hardcoded session-router origin to a same-origin path the proxy handles.
  return controlUiHtml.replace(ROUTER_RE, ROUTER_REPLACE);
}

export function StationPage() {
  const { token } = useAuth();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token ?? loadAuthSession()?.token ?? null;

  useEffect(() => {
    const iframe = frameRef.current;
    if (!iframe) return;

    const html = patchedHtml();
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();

    // Install a fetch shim inside the iframe so all '/api/*' calls rewrite to
    // '/api/station/*' and carry the Station JWT.
    const win = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (win) {
      const nativeFetch = win.fetch.bind(win);
      win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        // Rewrite same-origin '/api/*' calls to the namespaced proxy path '/api/station/*'.
        if (url.startsWith("/api/")) {
          url = "/api/station/" + url.slice("/api/".length);
        }

        const headers = new Headers(init?.headers);
        if (!headers.has("Authorization") && tokenRef.current) {
          headers.set("Authorization", `Bearer ${tokenRef.current}`);
        }

        return nativeFetch(url, { ...init, headers });
      }) as typeof fetch;
    }
  }, []);

  return (
    <iframe
      ref={frameRef}
      title="Praxion Control"
      className="fixed inset-0 h-full w-full border-0 bg-[#05070d]"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    />
  );
}
