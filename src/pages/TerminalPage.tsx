import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "globe.gl";
import type { GlobeInstance } from "globe.gl";

type NewsItem = {
  source: string;
  title: string;
  link: string;
  desc: string;
  pub: string;
  geo: { lat: number; lng: number; label: string } | null;
};

const GEO_DEFAULT = { lat: 40.7128, lng: -74.006, label: "New York" };

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

function NewsRow({ item }: { item: NewsItem }) {
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
    </a>
  );
}

const SECTOR_LINES = [
  "SECTOR: QUANT RESEARCH // INTERNAL CAPITAL ONLY",
  "CLASSIFICATION: PRIVATE // NO EXTERNAL DISTRIBUTION",
  "CHANNEL: ENCRYPTED // RELAY 7 // NO LOG RETENTION",
  "CLEARANCE: OPERATOR // MFA REQUIRED // AUDIT TRAIL ACTIVE",
];

const COMMANDS: Array<{ cmd: string; out: string }> = [
  { cmd: "HELP", out: "AVAILABLE COMMANDS: HELP // NEWS // SECTORS // GLOBE // X // CLEAR // STATUS" },
  { cmd: "NEWS", out: "NEWS RELAY: 4 SOURCES ACTIVE (REUTERS, CNBC, BBC, MARKETWATCH, YAHOO) — POLL 60S" },
  { cmd: "SECTORS", out: "SECTOR OVERLAY: QUANT RESEARCH // INTERNAL CAPITAL ONLY // NO EXTERNAL FUNDS" },
  { cmd: "GLOBE", out: "GLOBE FEED: NEWS-GEO DOTS ACTIVE // ARC TRAILS ENABLED" },
  { cmd: "X", out: "X RELAY: AWAITING API CREDENTIALS (PAID TIER REQUIRED) // COLUMN STANDBY" },
  { cmd: "CLEAR", out: "__CLEAR__" },
  { cmd: "STATUS", out: "TERMINAL OK // UPLINK STABLE // NEWS FEED LIVE // GLOBE RENDER OK" },
];

export function TerminalPage() {
  const globeRef = useRef<HTMLDivElement | null>(null);
  const globeInst = useRef<GlobeInstance | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [lines, setLines] = useState<string[]>([
    "PRAXION RESEARCH SECURE TERMINAL v2.1",
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

  // News poll
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/v1/news", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items: NewsItem[] };
        if (!cancelled) {
          setNews(data.items ?? []);
          setNewsError(null);
          setLastPoll(new Date());
        }
      } catch (e) {
        if (!cancelled) {
          setNewsError(e instanceof Error ? e.message : "poll failed");
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

  // Globe
  const geoData = useMemo(() => {
    const withGeo = news.filter((n) => n.geo != null);
    return withGeo.slice(0, 80).map((n, i) => ({
      id: i,
      lat: n.geo!.lat,
      lng: n.geo!.lng,
      label: n.geo!.label,
      size: 0.8,
      color: "#ffd700",
      title: `${n.source} — ${n.title}`,
    }));
  }, [news]);

  useEffect(() => {
    if (!globeRef.current || globeInst.current) return;
    const inst = new Globe(globeRef.current);
    globeInst.current = inst;

    inst
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
      .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
      .backgroundImageUrl("//unpkg.com/three-globe/example/img/night-sky.png")
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor("#ffd700")
      .atmosphereAltitude(0.18)
      .pointsData([])
      .pointLat("lat")
      .pointLng("lng")
      .pointAltitude(0.02)
      .pointRadius(0.5)
      .pointColor("color")
      .pointLabel((d: { title?: string }) => d.title ?? "")
      .arcsData([])
      .arcColor(() => "rgba(255,215,0,0.35)")
      .arcAltitude(0.35)
      .arcStroke(0.4)
      .arcDashLength(0.6)
      .arcDashGap(0.8)
      .arcDashAnimateTime(2000)
      .width(560)
      .height(560);

    // Slow auto-rotation
    let angle = 0;
    const spin = window.setInterval(() => {
      angle += 0.0016;
      inst.pointOfView({ lat: 15, lng: angle * (180 / Math.PI) + 0, altitude: 2.1 }, 0);
    }, 30);

    return () => {
      window.clearInterval(spin);
    };
  }, []);

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
          <span className={newsError ? "text-red-400" : "text-[#ffd700]"}>
            {newsError ? `NEWS FEED FAULT: ${newsError}` : `NEWS RELAY: ${news.length} ITEMS // ${lastPoll ? `LAST ${lastPoll.toLocaleTimeString()}` : "CONNECTING..."}`}
          </span>
          <span>GLOBE: {globeHasData ? "TRACKING" : "STANDBY"}</span>
          <span>X RELAY: AWAITING CREDENTIALS</span>
          <span className="ml-auto">CLASSIFICATION: INTERNAL</span>
        </div>

        {/* Main area: news feed | globe | X feed */}
        <div className="flex min-h-0 flex-1">
          {/* Left: news feed */}
          <div className="flex w-[26%] min-w-[240px] flex-col border-r-2 border-[#ffd700]/50 bg-[#050300]/85">
            <div className="border-b border-[#ffd700]/40 bg-[#0a0800] px-3 py-1.5 text-[10px] font-bold tracking-[0.25em] text-[#ffd700]">
              LIVE NEWS RELAY
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {news.length === 0 ? (
                <div className="p-3 text-[10px] tracking-wider text-[#8a7a2a]">
                  {newsError ? `UPLINK FAULT: ${newsError}` : "ACQUIRING FEED..."}
                </div>
              ) : (
                news.map((item, i) => <NewsRow key={`${item.source}-${i}`} item={item} />)
              )}
            </div>
            <div className="border-t border-[#ffd700]/40 bg-[#0a0800] px-3 py-1 font-mono text-[9px] tracking-widest text-[#8a7a2a]">
              SOURCES: REUTERS // CNBC // BBC // MARKETWATCH // YAHOO
            </div>
          </div>

          {/* Center: globe */}
          <div className="relative flex min-w-0 flex-1 items-center justify-center bg-black">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,215,0,0.05),transparent_60%)]" />
            <div className="absolute left-4 top-3 font-mono text-[9px] tracking-[0.25em] text-[#8a7a2a]">
              ● GLOBAL NEWS TRACKING
            </div>
            <div className="absolute right-4 top-3 font-mono text-[9px] tracking-[0.25em] text-[#8a7a2a]">
              {geoData.length} INCIDENTS
            </div>
            <div ref={globeRef} className="relative z-10" />
            <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center font-mono text-[9px] tracking-[0.3em] text-[#6b5d1f]">
              DRAG TO ROTATE // DOTS = NEWS LOCATIONS
            </div>
          </div>

          {/* Right: X feed */}
          <div className="flex w-[26%] min-w-[240px] flex-col border-l-2 border-[#ffd700]/50 bg-[#050300]/85">
            <div className="border-b border-[#ffd700]/40 bg-[#0a0800] px-3 py-1.5 text-[10px] font-bold tracking-[0.25em] text-[#ffd700]">
              X RELAY // MARKET SENTIMENT
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="text-2xl text-[#ffd700]/40">✕</div>
              <div className="text-[10px] leading-relaxed tracking-[0.2em] text-[#c9a92c]">
                X API ACCESS REQUIRES PAID TIER
              </div>
              <div className="text-[9px] leading-relaxed tracking-wider text-[#8a7a2a]">
                SEAM READY — SET X_BEARER_TOKEN ENV<br />
                COLUMN GOES LIVE AUTOMATICALLY
              </div>
              <div className="mt-2 font-mono text-[9px] text-[#6b5d1f]">STATUS: STANDBY</div>
            </div>
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
