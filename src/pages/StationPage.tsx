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
import { useEffect, useRef, useState } from "react";
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
  let html = controlUiHtml.replace(ROUTER_RE, ROUTER_REPLACE);

  // IMPORTANT: the dashboard calls boot() during parse, i.e. before React can touch
  // iframe.contentWindow. So the fetch shim must be embedded in the document itself,
  // ahead of the dashboard script, otherwise boot() hits raw '/api/*' with no JWT.
  const shim = `<script>
(function(){
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input
            : (input instanceof URL ? input.toString() : input.url);
    if (url.indexOf('/api/') === 0) { url = '/api/station/' + url.slice('/api/'.length); }
    var headers = new Headers((init && init.headers) || undefined);
    var tok = window.__PRAXION_STATION_TOKEN__;
    if (!headers.has('Authorization') && tok) { headers.set('Authorization', 'Bearer ' + tok); }
    var opts = Object.assign({}, init, { headers: headers });
    return nativeFetch(url, opts);
  };
})();
</script>`;

  // Signal readiness to the parent overlay: the dashboard sets this once its
  // first successful boot() render has populated the grid.
  const ready = `<script>
(function(){
  var tries = 0;
  function check(){
    tries++;
    var grid = document.getElementById('plgrid');
    var cards = document.querySelectorAll('.pbox').length;
    if (cards > 0 || tries > 200) {
      try { parent.postMessage({ type: 'praxion-station-ready' }, '*'); } catch (e) {}
      return;
    }
    setTimeout(check, 100);
  }
  if (document.readyState === 'complete') setTimeout(check, 60);
  else window.addEventListener('load', function(){ setTimeout(check, 60); });
})();
</script>`;

  // Inject before the dashboard's own <script> so the shim is already in place.
  if (html.includes('</head>')) {
    html = html.replace('</head>', shim + '\n</head>');
  } else {
    html = shim + html;
  }
  if (html.includes('</body>')) {
    html = html.replace('</body>', ready + '\n</body>');
  } else {
    html = html + ready;
  }
  return html;
}

export function StationPage() {
  const { token } = useAuth();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pct, setPct] = useState(6);
  const [phase, setPhase] = useState("Connecting…");
  tokenRef.current = token ?? loadAuthSession()?.token ?? null;

  // Listen for the dashboard's ready signal (posted from inside the iframe).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === "praxion-station-ready") {
        setPct(100);
        setPhase("Ready");
        // small beat so the bar visibly completes
        setTimeout(() => setLoaded(true), 220);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Tick the bar forward while we wait. It stalls at 92% until the real
  // ready signal lands, so it never claims to be finished when it isn't.
  useEffect(() => {
    if (loaded) return;
    const phrases = [
      "Connecting…",
      "Warming lanes…",
      "Fetching balances…",
      "Loading position P&L…",
      "Almost there…",
    ];
    let i = 0;
    const t = setInterval(() => {
      setPct((p) => (p >= 92 ? 92 : p + Math.max(1.5, (92 - p) * 0.13)));
      i = (i + 1) % phrases.length;
      setPhase(phrases[i]);
    }, 620);
    return () => clearInterval(t);
  }, [loaded]);

  useEffect(() => {
    const iframe = frameRef.current;
    if (!iframe) return;

    const html = patchedHtml();
    const doc = iframe.contentDocument;
    if (!doc) return;

    // Stamp the JWT onto the iframe window BEFORE the document parses, so the
    // embedded fetch shim can attach it to the very first /api call from boot().
    const winEarly = iframe.contentWindow as
      | (Window & typeof globalThis & { __PRAXION_STATION_TOKEN__?: string | null })
      | null;
    if (winEarly) winEarly.__PRAXION_STATION_TOKEN__ = tokenRef.current;

    doc.open();
    doc.write(html);
    doc.close();

    // NOTE: no second fetch shim here. The shim is embedded in the document <head>
    // (see patchedHtml). Installing another one wrapped the already-rewritten
    // '/api/station/snapshot' into '/api/station/station/snapshot' -> upstream 404.
  }, []);

  return (
    <>
      <iframe
        ref={frameRef}
        title="Praxion Control"
        className="fixed inset-0 h-full w-full border-0 bg-[#05070d]"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
      {!loaded && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "#05070d",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            transition: "opacity .22s ease",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "#7ee0ff",
              fontWeight: 700,
            }}
          >
            Praxion Station
          </div>

          <div
            style={{
              width: "min(320px, 74vw)",
              height: 4,
              borderRadius: 999,
              background: "rgba(126,224,255,.14)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                borderRadius: 999,
                background:
                  "linear-gradient(90deg,#7ee0ff,#3ddc84)",
                boxShadow: "0 0 12px rgba(126,224,255,.55)",
                transition: "width .45s cubic-bezier(.4,0,.2,1)",
              }}
            />
          </div>

          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.4,
              color: "#6b7a90",
              minHeight: 14,
            }}
          >
            {phase}
          </div>
        </div>
      )}
    </>
  );
}
