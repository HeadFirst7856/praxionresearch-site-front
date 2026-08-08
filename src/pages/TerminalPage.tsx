import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "globe.gl";
import type { GlobeInstance } from "globe.gl";

type FeedItem = {
  source: string;
  title: string;
  link: string;
  desc: string;
  pub: string;
  geo: { lat: number; lng: number; label: string } | null;
};

type FeedPayload = {
  generatedAt: string;
  news: FeedItem[];
  reddit: FeedItem[];
  sec: FeedItem[];
};

const GEO_DEFAULT = { lat: 40.7128, lng: -74.006, label: "New York" };

const COUNTRY_GEOJSON_URL =
  "https://unpkg.com/three-globe/example/datasets/ne_110m_admin_0_countries.geojson";

function formatClock(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const zulu = d.toISOString().slice(11, 19);
  return `${hh}:${mm}:${ss} ET / ${zulu} Z`;
}

function timeAgo(pub: string): string {
  if (!pub) return "--:--";
  const t = Date.parse(pub);
  if (Number.isNaN(t)) return "--:--";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function FeedRow({ item }: { item: FeedItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noreferrer"
      className="block border-b border-[#8a7a2a]/20 px-3 py-2 hover:bg-[#1a1505]/60 transition-colors"
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-[9px] tracking-[0.18em] text-[#8a7a2a]">{item.source}</span>
        <span className="shrink-0 text-[9px] text-[#6b5d1f]">{timeAgo(item.pub)}</span>
        {item.geo ? (
          <span className="ml-auto shrink-0 text-[9px] text-[#a08c30]">● {item.geo.label.toUpperCase()}</span>
        ) : null}
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-[#e8d67a]">{item.title}</div>
      {item.desc ? (
        <div className="mt-0.5 truncate text-[9px] text-[#8a7a2a]">{item.desc}</div>
      ) : null}
    </a>
  );
}

function FeedPanel({
  title,
  count,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  count: number;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex min-h-0 flex-1 flex-col border-b-2 border-[#ffd700]/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-[#ffd700]/40 bg-[#0a0800] px-3 py-1.5 text-left transition-colors hover:bg-[#141002]"
      >
        <span className={`text-[10px] text-[#ffd700] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        <span className="text-[10px] font-bold tracking-[0.25em] text-[#ffd700]">{title}</span>
        {badge ? <span className="text-[8px] tracking-wider text-[#6b5d1f]">{badge}</span> : null}
        <span className="ml-auto text-[9px] tracking-widest text-[#8a7a2a]">{count}</span>
      </button>
      {open ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#050300]/85">{children}</div>
      ) : null}
    </div>
  );
}

const SECTOR_LINES = [
  "SECTOR: QUANT RESEARCH // INTERNAL CAPITAL ONLY",
  "CLASSIFICATION: PRIVATE // NO EXTERNAL DISTRIBUTION",
  "CHANNEL: ENCRYPTED // RELAY 7 // NO LOG RETENTION",
  "CLEARANCE: OPERATOR // MFA REQUIRED // AUDIT TRAIL ACTIVE",
];

const COMMANDS: Array<{ cmd: string; out: string }> = [
  { cmd: "HELP", out: "COMMANDS: HELP // NEWS // REDDIT // SEC // X // GLOBE // AUTO // CLEAR // STATUS" },
  { cmd: "NEWS", out: "NEWS RELAY: 4 SOURCES (CNBC, BBC, MARKETWATCH, YAHOO) — POLL 60S // GEO-TAGGED" },
  { cmd: "REDDIT", out: "REDDIT RELAY: WALLSTREETBETS // STOCKS // INVESTING — ROTATED 1/POLL (RATE-LIMITED)" },
  { cmd: "SEC", out: "SEC RELAY: 8-K // 10-Q // 10-K // FORM 4 — EDGAR ATOM FEED LIVE" },
  { cmd: "X", out: "X RELAY: AWAITING API CREDENTIALS (PAID TIER REQUIRED) // COLUMN STANDBY" },
  { cmd: "GLOBE", out: "GLOBE: VECTOR TRAFFIC VIEW // DRAG TO ROTATE // SCROLL TO ZOOM // AUTO-SPIN PAUSES ON TOUCH" },
  { cmd: "AUTO", out: "AUTO-SPIN RESUMED (PAUSES WHEN YOU GRAB THE GLOBE)" },
  { cmd: "CLEAR", out: "__CLEAR__" },
  { cmd: "STATUS", out: "TERMINAL OK // NEWS LIVE // REDDIT ROTATING // SEC LIVE // X STANDBY // GLOBE VECTOR" },
];

export function TerminalPage() {
  const globeRef = useRef<HTMLDivElement | null>(null);
  const globeInst = useRef<GlobeInstance | null>(null);
  const spinRef = useRef<number | null>(null);
  const [payload, setPayload] = useState<FeedPayload | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [lines, setLines] = useState<string[]>([
    "PRAXION RESEARCH SECURE TERMINAL v2.2",
    "UPLINK ESTABLISHED // SESSION: OPERATOR",
    "TYPE A COMMAND + <GO> // HELP FOR LIST",
    "----------------------------------------",
  ]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Clock tick
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Feed poll
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/v1/news", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as FeedPayload;
        if (!cancelled) {
          setPayload(data);
          setFeedError(null);
          setLastPoll(new Date());
        }
      } catch (e) {
        if (!cancelled) {
          setFeedError(e instanceof Error ? e.message : "poll failed");
        }
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Globe: vector/traffic style, interactive (drag rotate, scroll zoom)
  useEffect(() => {
    if (!globeRef.current || globeInst.current) return;
    const inst = new Globe(globeRef.current);
    globeInst.current = inst;

    inst
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor("#ffd700")
      .atmosphereAltitude(0.22)
      .showGraticules(true)
      .globeMaterial({ color: "#0a1220", emissive: "#050b16", emissiveIntensity: 0.35 })
      .pointsData([])
      .pointLat("lat")
      .pointLng("lng")
      .pointAltitude(0.02)
      .pointRadius(0.55)
      .pointColor("color")
      .pointLabel((d: { title?: string }) => d.title ?? "")
      .arcsData([])
      .arcColor(() => "rgba(255,215,0,0.35)")
      .arcAltitude(0.35)
      .arcStroke(0.4)
      .arcDashLength(0.6)
      .arcDashGap(0.8)
      .arcDashAnimateTime(2000)
      .polygonsData([])
      .polygonCapColor(() => "rgba(20,34,54,0.9)")
      .polygonSideColor(() => "rgba(255,215,0,0.08)")
      .polygonStrokeColor(() => "rgba(255,215,0,0.5)")
      .polygonAltitude(0.01)
      .width(620)
      .height(620);

    // Load country outlines for the traffic-view landmasses
    void fetch(COUNTRY_GEOJSON_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((geo) => {
        if (geo?.features) inst.polygonsData(geo.features);
      })
      .catch(() => {
        /* vector globe still renders with graticules only */
      });

    // Auto-spin; pauses while the user drags/zooms
    function startSpin() {
      if (spinRef.current != null) return;
      let angle = 0;
      spinRef.current = window.setInterval(() => {
        angle += 0.0016;
        inst.pointOfView({ lat: 15, lng: angle * (180 / Math.PI), altitude: 2.2 }, 0);
      }, 30);
    }
    function stopSpin() {
      if (spinRef.current != null) {
        window.clearInterval(spinRef.current);
        spinRef.current = null;
      }
    }
    startSpin();

    const el = globeRef.current;
    el?.addEventListener("pointerdown", stopSpin);
    el?.addEventListener("pointerup", () => {
      // resume after 4s idle
      window.setTimeout(startSpin, 4000);
    });

    return () => {
      stopSpin();
    };
  }, []);

  // Feed data -> globe points + arcs
  const geoData = useMemo(() => {
    const withGeo = (payload?.news ?? []).filter((n) => n.geo != null);
    return withGeo.slice(0, 80).map((n, i) => ({
      id: i,
      lat: n.geo!.lat,
      lng: n.geo!.lng,
      label: n.geo!.label,
      size: 0.8,
      color: "#ffd700",
      title: `${n.source} — ${n.title}`,
    }));
  }, [payload]);

  useEffect(() => {
    const inst = globeInst.current;
    if (!inst) return;
    inst.pointsData(geoData);
    const arcs = geoData.map((g) => ({
      startLat: g.lat,
      startLng: g.lng,
      endLat: GEO_DEFAULT.lat,
      endLng: GEO_DEFAULT.lng,
    }));
    inst.arcsData(arcs);
  }, [geoData]);

  function submitCommand(raw: string) {
    const cmd = raw.trim().toUpperCase();
    if (!cmd) return;
    setLines((prev) => [...prev, `> ${raw}`]);
    if (cmd === "AUTO") {
      const inst = globeInst.current;
      if (inst) {
        let angle = 0;
        const spin = window.setInterval(() => {
          angle += 0.0016;
          inst.pointOfView({ lat: 15, lng: angle * (180 / Math.PI), altitude: 2.2 }, 0);
        }, 30);
        if (spinRef.current != null) window.clearInterval(spinRef.current);
        spinRef.current = spin;
      }
    }
    const hit = COMMANDS.find((c) => c.cmd === cmd);
    const out = hit ? hit.out : `UNRECOGNIZED COMMAND: ${cmd} // TYPE HELP`;
    if (out === "__CLEAR__") {
      setLines([]);
    } else {
      setLines((prev) => [...prev, out]);
    }
    setInput("");
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const news = payload?.news ?? [];
  const reddit = payload?.reddit ?? [];
  const sec = payload?.sec ?? [];
  const globeHasData = geoData.length > 0;

  return (
    <div
      className="relative min-h-[calc(100vh-72px)] overflow-hidden bg-black text-[#ffd700]"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Scanline overlay */}
      <div className="pointer-events-none fixed inset-0 z-40 opacity-[0.06] scanlines" />
      {/* Vignette */}
      <div className="pointer-events-none fixed inset-0 z-40 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.85)_100%)]" />

      <div className="relative z-10 flex h-[calc(100vh-72px)] flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b-2 border-[#ffd700]/60 bg-[#0a0800]/90 px-4 py-2">
          <div className="text-xs font-bold tracking-[0.3em] text-[#ffd700]">
            PRAXION&nbsp;RESEARCH&nbsp;//&nbsp;SECURE&nbsp;TERMINAL
          </div>
          <div className="text-xs tracking-[0.2em] text-[#ffd700]/90">
            {SECTOR_LINES[0]}
          </div>
          <div className="font-mono text-xs tracking-widest text-[#ffd700]">{formatClock(clock)}</div>
        </div>

        {/* Status strip */}
        <div className="flex items-center gap-4 border-b border-[#ffd700]/30 bg-[#050300]/90 px-4 py-1 font-mono text-[10px] tracking-[0.14em] text-[#c9a92c]">
          <span className={feedError ? "text-red-400" : "text-[#ffd700]"}>
            {feedError
              ? `FEED FAULT: ${feedError}`
              : `NEWS ${news.length} // REDDIT ${reddit.length} // SEC ${sec.length}${lastPoll ? ` // ${lastPoll.toLocaleTimeString()}` : " // CONNECTING..."}`}
          </span>
          <span>GLOBE: {globeHasData ? "TRACKING" : "STANDBY"}</span>
          <span>X: STANDBY</span>
          <span className="ml-auto">CLASSIFICATION: INTERNAL</span>
        </div>

        {/* Main area: news feed | globe | feeds */}
        <div className="flex min-h-0 flex-1">
          {/* Left: news feed */}
          <div className="flex w-[24%] min-w-[220px] flex-col border-r-2 border-[#ffd700]/50 bg-[#050300]/85">
            <div className="border-b border-[#ffd700]/40 bg-[#0a0800] px-3 py-1.5 text-[10px] font-bold tracking-[0.25em] text-[#ffd700]">
              LIVE NEWS RELAY
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {news.length === 0 ? (
                <div className="p-3 text-[10px] tracking-wider text-[#8a7a2a]">
                  {feedError ? `UPLINK FAULT: ${feedError}` : "ACQUIRING FEED..."}
                </div>
              ) : (
                news.map((item, i) => <FeedRow key={`${item.source}-${i}`} item={item} />)
              )}
            </div>
            <div className="border-t border-[#ffd700]/40 bg-[#0a0800] px-3 py-1 font-mono text-[9px] tracking-widest text-[#8a7a2a]">
              CNBC // BBC // MARKETWATCH // YAHOO
            </div>
          </div>

          {/* Center: globe */}
          <div className="relative flex min-w-0 flex-1 items-center justify-center bg-black">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,215,0,0.05),transparent_60%)]" />
            <div className="absolute left-4 top-3 font-mono text-[9px] tracking-[0.25em] text-[#8a7a2a]">
              ● GLOBAL NEWS TRACKING // VECTOR VIEW
            </div>
            <div className="absolute right-4 top-3 font-mono text-[9px] tracking-[0.25em] text-[#8a7a2a]">
              {geoData.length} INCIDENTS
            </div>
            <div ref={globeRef} className="relative z-10 cursor-grab active:cursor-grabbing" />
            <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center font-mono text-[9px] tracking-[0.3em] text-[#6b5d1f]">
              DRAG TO ROTATE // SCROLL TO ZOOM // DOTS = NEWS LOCATIONS
            </div>
          </div>

          {/* Right: collapsible feeds */}
          <div className="flex w-[24%] min-w-[220px] flex-col border-l-2 border-[#ffd700]/50 bg-[#050300]/85">
            <FeedPanel title="X RELAY" count={0} badge="STANDBY">
              <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="text-2xl text-[#ffd700]/40">✕</div>
                <div className="text-[10px] leading-relaxed tracking-[0.2em] text-[#c9a92c]">
                  X API ACCESS REQUIRES PAID TIER
                </div>
                <div className="text-[9px] leading-relaxed tracking-wider text-[#8a7a2a]">
                  SEAM READY — SET X_BEARER_TOKEN ENV
                </div>
                <div className="mt-2 font-mono text-[9px] text-[#6b5d1f]">STATUS: STANDBY</div>
              </div>
            </FeedPanel>

            <FeedPanel title="REDDIT RELAY" count={reddit.length} badge="WSB // STOCKS // INVESTING">
              {reddit.length === 0 ? (
                <div className="p-3 text-[10px] tracking-wider text-[#8a7a2a]">
                  RATE-LIMITED — ROTATING FEED...
                </div>
              ) : (
                reddit.map((item, i) => <FeedRow key={`r-${item.source}-${i}`} item={item} />)
              )}
            </FeedPanel>

            <FeedPanel title="SEC FILINGS" count={sec.length} badge="8-K // 10-Q // 10-K // 4">
              {sec.length === 0 ? (
                <div className="p-3 text-[10px] tracking-wider text-[#8a7a2a]">
                  ACQUIRING EDGAR FEED...
                </div>
              ) : (
                sec.map((item, i) => <FeedRow key={`s-${item.source}-${i}`} item={item} />)
              )}
            </FeedPanel>
          </div>
        </div>

        {/* Command line */}
        <div className="border-t-2 border-[#ffd700]/60 bg-[#0a0800] px-4 py-2 font-mono">
          <div
            ref={scrollRef}
            className="mb-1 max-h-24 overflow-y-auto text-[10px] leading-snug tracking-wider text-[#c9a92c]"
          >
            {lines.map((l, i) => (
              <div key={i} className={l.startsWith(">") ? "text-[#ffd700]" : ""}>
                {l}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#ffd700]">❯</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCommand(input);
                e.stopPropagation();
              }}
              className="flex-1 bg-transparent text-[12px] tracking-[0.15em] text-[#ffd700] caret-[#ffd700] outline-none placeholder:text-[#6b5d1f]"
              placeholder="TYPE COMMAND + ENTER // HELP"
              spellCheck={false}
              autoComplete="off"
            />
            <span className="text-[9px] tracking-[0.2em] text-[#6b5d1f]">CMD&nbsp;GO</span>
          </div>
        </div>
      </div>

      <style>{`
        .scanlines {
          background: repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 2px,
            rgba(0, 0, 0, 0.9) 3px
          );
        }
      `}</style>
    </div>
  );
}

export default TerminalPage;
