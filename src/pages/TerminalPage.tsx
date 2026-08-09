import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Globe from "globe.gl";
import type { GlobeInstance } from "globe.gl";
import { BattleMode } from "@/components/terminal/BattleMode";
import { MatrixRain } from "@/components/terminal/MatrixRain";
import { loadAuthSession } from "@/lib/authStorage";

type FeedItem = {
  source: string;
  title: string;
  link: string;
  desc: string;
  pub: string;
  geo: { lat: number; lng: number; label: string } | null;
};

type TapeItem = {
  sym: string;
  label: string;
  last: number | null;
  change: number | null;
  changePct: number | null;
};

type DashboardSlot = {
  title?: string;
  mode?: string;
  instrument?: string;
  daily_rows?: Array<{ period?: string; day?: string; pnl_dollars?: number; end_balance?: number; start_balance?: number }>;
  recent_trades?: Array<Record<string, unknown>>;
  all_trades?: Array<Record<string, unknown>>;
  ending_balance?: number;
  starting_balance?: number;
  trades_total?: number | null;
};
type DashboardPayload = { slots?: Record<string, DashboardSlot> };

function decodeJwtEmail(token: string): string | null {
  try {
    const part = token.split(".")[1];
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return json.email ?? json.sub ?? null;
  } catch {
    return null;
  }
}

type FeedPayload = {
  generatedAt: string;
  news: FeedItem[];
  reddit: FeedItem[];
  sec: FeedItem[];
  polymarket: FeedItem[];
};

const GEO_DEFAULT = { lat: 40.7128, lng: -74.006, label: "New York" };

// Major trading venues: tz, session window (local wall-clock minutes), weekdays only
const MARKETS = [
  { code: "NY", name: "NYSE", tz: "America/New_York", open: 9.5 * 60, close: 16 * 60 },
  { code: "CHI", name: "CME", tz: "America/Chicago", open: 8.5 * 60, close: 15 * 60 },
  { code: "LDN", name: "LSE", tz: "Europe/London", open: 8 * 60, close: 16.5 * 60 },
  { code: "FRA", name: "XETRA", tz: "Europe/Berlin", open: 9 * 60, close: 17.5 * 60 },
  { code: "TYO", name: "TSE", tz: "Asia/Tokyo", open: 9 * 60, close: 15.5 * 60 },
  { code: "HKG", name: "HKEX", tz: "Asia/Hong_Kong", open: 9.5 * 60, close: 16 * 60 },
  { code: "SYD", name: "ASX", tz: "Australia/Sydney", open: 10 * 60, close: 16 * 60 },
  { code: "SAO", name: "B3", tz: "America/Sao_Paulo", open: 10 * 60, close: 17 * 60 },
];

function marketNow(tz: string): { time: string; day: number; mins: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const time =
    parts.find((p) => p.type === "hour")?.value.padStart(2, "0") +
    ":" +
    parts.find((p) => p.type === "minute")?.value.padStart(2, "0");
  const dayName = parts.find((p) => p.type === "weekday")?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayName);
  const [hh, mm] = time.split(":").map(Number);
  return { time, day, mins: hh * 60 + mm };
}

function isOpen(m: (typeof MARKETS)[number]): boolean {
  const { day, mins } = marketNow(m.tz);
  if (day === 0 || day === 6) return false; // weekend
  return mins >= m.open && mins < m.close;
}

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
  { cmd: "HELP", out: "COMMANDS: HELP // NEWS // REDDIT // SEC // POLY // X // GLOBE // AUTO // CLOCKS // TAPE // WHO // PANIC // MATRIX // FULLSCREEN // EXIT // CLEAR // STATUS" },
  { cmd: "FULLSCREEN", out: "FULLSCREEN MODE TOGGLED VIA TOP-BAR BUTTON (⛶) // OR PRESS F11" },
  { cmd: "NEWS", out: "NEWS RELAY: 4 SOURCES (CNBC, BBC, MARKETWATCH, YAHOO) — POLL 60S // GEO-TAGGED" },
  { cmd: "REDDIT", out: "REDDIT RELAY: WALLSTREETBETS // STOCKS // INVESTING — ROTATED 1/POLL (RATE-LIMITED)" },
  { cmd: "SEC", out: "SEC RELAY: 8-K // 10-Q // 10-K // FORM 4 — EDGAR ATOM FEED LIVE" },
  { cmd: "POLY", out: "PREDICTION MARKETS: POLYMARKET GEOPOLITICS — YES% + 24H VOL // RED DOTS ON GLOBE" },
  { cmd: "X", out: "X RELAY: AWAITING API CREDENTIALS (PAID TIER REQUIRED) // COLUMN STANDBY" },
  { cmd: "GLOBE", out: "GLOBE: VECTOR TRAFFIC VIEW // DRAG TO ROTATE // SCROLL TO ZOOM // AUTO-SPIN PAUSES ON TOUCH" },
  { cmd: "AUTO", out: "AUTO-SPIN RESUMED (PAUSES WHEN YOU GRAB THE GLOBE)" },
  { cmd: "BATTLE", out: "VIEW: BATTLE MODE — 4-PANE WAR ROOM (MONTE CARLO // TRADE LOG // CHAT // ALERTS)" },
  { cmd: "PNL", out: "VIEW: BATTLE MODE — MONTE CARLO WALK-FORWARD ENGAGED" },
  { cmd: "TAPE", out: "MARKET TAPE: NQ // ES // YM // RTY // GC // CL // 6E // BTC // ETH // VIX // DXY // TNX — POLL 30S" },
  { cmd: "WHO", out: "__WHO__" },
  { cmd: "PANIC", out: "PANIC MODE: DECOY SCREEN ENGAGED // PRESS CTRL+SHIFT+P OR PANIC TO RETURN" },
  { cmd: "MATRIX", out: "__MATRIX__" },
  { cmd: "CLOCKS", out: "MARKET CLOCKS: NY // CHI // LDN // FRA // TYO // HKG // SYD // SAO — LOCAL SESSION STATUS" },
  { cmd: "CLEAR", out: "__CLEAR__" },
  { cmd: "EXIT", out: "__EXIT__" },
  { cmd: "STATUS", out: "TERMINAL OK // NEWS LIVE // REDDIT ROTATING // SEC LIVE // POLY LIVE // X STANDBY // TAPE LIVE // GLOBE VECTOR" },
];

export function TerminalPage() {
  const navigate = useNavigate();
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
  const [view, setView] = useState<"globe" | "battle">("globe");
  const [slots, setSlots] = useState<Record<string, DashboardSlot>>({});
  const [booted, setBooted] = useState(false);
  const [panic, setPanic] = useState(false);
  const [matrix, setMatrix] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [tape, setTape] = useState<TapeItem[]>([]);
  const [roster, setRoster] = useState<Array<{ name: string; email: string }>>([]);
  const sessionEmail = useMemo(() => {
    const token = loadAuthSession()?.token;
    return token ? decodeJwtEmail(token) : null;
  }, []);

  // Boot sequence: brief hardware check + uplink splash, then reveal terminal.
  useEffect(() => {
    const t = window.setTimeout(() => setBooted(true), 2400);
    return () => window.clearTimeout(t);
  }, []);

  // Tape poll (market quotes, 30s)
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/v1/tape", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { quotes: TapeItem[] };
        if (!cancelled) setTape(data.quotes ?? []);
      } catch {
        /* tape is non-critical; keep last values */
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Operator roster for WHO (from public auth store)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/data/auth/users.json", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { users_by_email: Record<string, { name: string; email: string }> };
        if (!cancelled) {
          setRoster(
            Object.values(data.users_by_email ?? {}).map((u) => ({
              name: u.name ?? u.email,
              email: u.email,
            })),
          );
        }
      } catch {
        /* roster optional */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Dashboard slots for Battle Mode (real trades + daily P&L)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/data/dashboard-data.json", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as DashboardPayload;
        if (!cancelled && data.slots) setSlots(data.slots);
      } catch {
        /* battle mode degrades to seeded view */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Panic key: Ctrl+Shift+P toggles decoy screen; Esc exits panic/matrix/WHO.
  // Capture phase on document so it fires even when the terminal input has
  // focus (the input's React onKeyDown stops propagation to window listeners).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPanic((p) => !p);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPanic(false);
        setMatrix(false);
        setWhoOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

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

  // Feed data -> globe points + arcs (news + geopolitical markets)
  const geoData = useMemo(() => {
    const newsGeo = (payload?.news ?? []).filter((n) => n.geo != null).map((n) => ({
      lat: n.geo!.lat,
      lng: n.geo!.lng,
      color: "#ffd700",
      title: `${n.source} — ${n.title}`,
    }));
    const polyGeo = (payload?.polymarket ?? [])
      .filter((n) => n.geo != null)
      .map((n) => ({
        lat: n.geo!.lat,
        lng: n.geo!.lng,
        color: "#ff4d4d",
        title: `POLY ${n.desc} — ${n.title}`,
      }));
    return [...newsGeo, ...polyGeo].slice(0, 80).map((g, i) => ({ id: i, ...g, size: 0.8 }));
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
    if (cmd === "PNL" || cmd === "BATTLE") {
      setView("battle");
    } else if (cmd === "GLOBE") {
      setView("globe");
    } else if (cmd === "MATRIX") {
      setMatrix((m) => !m);
    } else if (cmd === "PANIC") {
      setPanic((p) => !p);
    } else if (cmd === "WHO") {
      setWhoOpen(true);
    } else if (cmd === "AUTO") {
      const inst = globeInst.current;
      if (inst && spinRef.current == null) {
        let angle = 0;
        spinRef.current = window.setInterval(() => {
          angle += 0.0016;
          inst.pointOfView({ lat: 15, lng: angle * (180 / Math.PI), altitude: 2.2 }, 0);
        }, 30);
      }
    }
    const hit = COMMANDS.find((c) => c.cmd === cmd);
    const out = hit ? hit.out : `UNRECOGNIZED COMMAND: ${cmd} // TYPE HELP`;
    if (out === "__CLEAR__") {
      setLines([]);
    } else if (out === "__EXIT__") {
      navigate("/");
      return;
    } else {
      setLines((prev) => [...prev, out]);
    }
    setInput("");
  }

  const [isFs, setIsFs] = useState(false);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  useEffect(() => {
    const onFs = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const news = payload?.news ?? [];
  const reddit = payload?.reddit ?? [];
  const sec = payload?.sec ?? [];
  const polymarket = payload?.polymarket ?? [];
  const globeHasData = geoData.length > 0;

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-black text-[#ffd700]"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Scanline overlay */}
      <div className="pointer-events-none fixed inset-0 z-40 opacity-[0.06] scanlines" />
      {/* Vignette */}
      <div className="pointer-events-none fixed inset-0 z-40 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.85)_100%)]" />

      <div className="relative z-10 flex h-screen flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b-2 border-[#ffd700]/60 bg-[#0a0800]/90 px-4 py-2">
          <div className="flex items-center gap-4">
            <div className="text-xs font-bold tracking-[0.3em] text-[#ffd700]">
              PRAXION&nbsp;RESEARCH&nbsp;//&nbsp;SECURE&nbsp;TERMINAL
            </div>
            {/* View toggle: GLOBE | BATTLE MODE */}
            <div className="flex border border-[#ffd700]/40 font-mono text-[9px] tracking-[0.18em]">
              <button
                type="button"
                onClick={() => setView("globe")}
                className={`px-2.5 py-1 transition-colors ${view === "globe" ? "bg-[#ffd700] text-black" : "text-[#c9a92c] hover:bg-[#1a1505]"}`}
              >
                GLOBE
              </button>
              <button
                type="button"
                onClick={() => setView("battle")}
                className={`px-2.5 py-1 transition-colors ${view === "battle" ? "bg-[#ffd700] text-black" : "text-[#c9a92c] hover:bg-[#1a1505]"}`}
              >
                BATTLE MODE
              </button>
            </div>
          </div>
          <div className="hidden text-xs tracking-[0.2em] text-[#ffd700]/90 lg:block">
            {SECTOR_LINES[0]}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs tracking-widest text-[#ffd700]">{formatClock(clock)}</span>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="border border-[#ffd700]/40 px-2 py-0.5 text-[9px] tracking-[0.2em] text-[#c9a92c] transition-colors hover:bg-[#1a1505] hover:text-[#ffd700]"
            >
              {isFs ? "EXIT FS" : "⛶ FULLSCREEN"}
            </button>
          </div>
        </div>

        {/* Market clocks strip */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-b border-[#ffd700]/30 bg-[#070500]/95 px-4 py-2 font-mono text-[13px] tracking-[0.12em]">
          {MARKETS.map((m) => {
            const { time } = marketNow(m.tz);
            const open = isOpen(m);
            return (
              <span key={m.code} className="flex items-center gap-1.5">
                <span
                  className={`inline-block size-1.5 rounded-full ${open ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" : "bg-[#6b5d1f]"}`}
                />
                <span className="text-[#8a7a2a]">{m.code}</span>
                <span className="text-[#e8d67a]">{time}</span>
                <span className={open ? "text-emerald-300/80" : "text-[#5a4d18]"}>{open ? "OPEN" : "CLSD"}</span>
              </span>
            );
          })}
          <span className="hidden text-[#6b5d1f] md:inline">WORLD MARKET CLOCKS // LOCAL TIME</span>
        </div>

        {/* Status strip */}
        <div className="flex items-center gap-4 border-b border-[#ffd700]/30 bg-[#050300]/90 px-4 py-1 font-mono text-[10px] tracking-[0.14em] text-[#c9a92c]">
          <span className={feedError ? "text-red-400" : "text-[#ffd700]"}>
            {feedError
              ? `FEED FAULT: ${feedError}`
              : `NEWS ${news.length} // REDDIT ${reddit.length} // SEC ${sec.length} // POLY ${polymarket.length}${lastPoll ? ` // ${lastPoll.toLocaleTimeString()}` : " // CONNECTING..."}`}
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

          {/* Center: view toggle — GLOBE | BATTLE MODE */}
          <div className="relative flex min-w-0 flex-1 flex-col bg-black">
            {view === "battle" ? (
              <BattleMode
                slots={slots}
                news={news}
                tape={tape}
                myName={sessionEmail ?? "OPERATOR"}
                roster={roster}
              />
            ) : view === "globe" ? (
              <>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,215,0,0.05),transparent_60%)]" />
                <div className="absolute left-4 top-3 font-mono text-[9px] tracking-[0.25em] text-[#8a7a2a]">
                  ● GLOBAL NEWS TRACKING // VECTOR VIEW
                </div>
                <div className="absolute right-4 top-3 font-mono text-[9px] tracking-[0.25em] text-[#8a7a2a]">
                  {geoData.length} INCIDENTS
                </div>
                <div ref={globeRef} className="relative z-10 m-auto cursor-grab active:cursor-grabbing" />
                <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center font-mono text-[9px] tracking-[0.3em] text-[#6b5d1f]">
                  DRAG TO ROTATE // SCROLL TO ZOOM // DOTS = NEWS LOCATIONS
                </div>
              </>
            ) : null}
          </div>

          {/* Right: collapsible feeds */}
          <div className="flex w-[24%] min-w-[220px] flex-col border-l-2 border-[#ffd700]/50 bg-[#050300]/85">
            <FeedPanel title="PREDICTION MARKETS" count={polymarket.length} badge="POLYMARKET // GEOPOLITICS">
              {polymarket.length === 0 ? (
                <div className="p-3 text-[10px] tracking-wider text-[#8a7a2a]">
                  ACQUIRING GAMMA FEED...
                </div>
              ) : (
                polymarket.map((item, i) => <FeedRow key={`p-${item.source}-${i}`} item={item} />)
              )}
            </FeedPanel>

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

        {/* Market tape — scrolling quotes */}
        <div className="relative overflow-hidden border-t border-[#ffd700]/30 bg-[#0a0800] py-1 font-mono text-[10px] tracking-[0.12em]">
          {tape.length > 0 ? (
            <div className="tape-track flex w-max items-center gap-8 whitespace-nowrap">
              {[...tape, ...tape].map((q, i) => {
                const up = (q.changePct ?? 0) > 0;
                const flat = (q.changePct ?? 0) === 0;
                return (
                  <span key={`${q.sym}-${i}`} className="flex items-center gap-1.5">
                    <span className="text-[#8a7a2a]">{q.label}</span>
                    <span className="text-[#e8d67a]">{q.last != null ? q.last.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "--"}</span>
                    <span className={flat ? "text-[#8a7a2a]" : up ? "text-emerald-400" : "text-red-400"}>
                      {q.change != null && q.changePct != null
                        ? `${up ? "▲" : flat ? "▬" : "▼"} ${up ? "+" : ""}${q.change.toFixed(2)} (${up ? "+" : ""}${q.changePct.toFixed(2)}%)`
                        : "--"}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="px-4 text-[9px] tracking-widest text-[#6b5d1f]">TAPE: ACQUIRING QUOTES...</div>
          )}
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

      {/* Boot sequence overlay */}
      {!booted ? (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black font-mono text-[#ffd700]">
          <div className="text-2xl font-bold tracking-[0.4em]">PRAXION RESEARCH</div>
          <div className="mt-1 text-[10px] tracking-[0.3em] text-[#8a7a2a]">SECURE TERMINAL // BIOS v2.3</div>
          <div className="mt-8 w-72 space-y-1.5 text-[10px] tracking-wider text-[#c9a92c]">
            {[
              "MEM CHECK ............ 65536K OK",
              "UPLINK ENCRYPTION ..... AES-256",
              "RELAY 7 .............. STABLE",
              "NEWS FEEDS ........... LOCKING",
              "GLOBE RENDER ......... VECTOR",
            ].map((l) => (
              <div key={l}>{l}</div>
            ))}
            <div className="mt-3 h-1 w-full overflow-hidden bg-[#1a1505]">
              <div className="boot-bar h-full w-0 bg-[#ffd700]" />
            </div>
            <div className="pt-1 text-[9px] tracking-[0.2em] text-[#6b5d1f]">INITIALIZING...</div>
          </div>
        </div>
      ) : null}

      {/* WHO overlay */}
      {whoOpen ? (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setWhoOpen(false)}
        >
          <div className="w-[480px] border-2 border-[#ffd700]/60 bg-[#070500] p-4 font-mono" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between border-b border-[#ffd700]/40 pb-2">
              <span className="text-xs font-bold tracking-[0.25em] text-[#ffd700]">OPERATOR ROSTER // WHO</span>
              <button type="button" onClick={() => setWhoOpen(false)} className="text-[10px] text-[#8a7a2a] hover:text-[#ffd700]">
                [X]
              </button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto text-[11px] tracking-wider">
              {roster.length === 0 ? (
                <div className="text-[#8a7a2a]">ROSTER UNAVAILABLE...</div>
              ) : (
                roster.map((u) => {
                  const isMe = u.email === sessionEmail;
                  return (
                    <div key={u.email} className="flex items-center justify-between gap-2 border-b border-[#ffd700]/10 py-1">
                      <span className="flex items-center gap-2">
                        <span className={isMe ? "text-emerald-400" : "text-[#6b5d1f]"}>{isMe ? "●" : "○"}</span>
                        <span className={isMe ? "text-[#ffd700]" : "text-[#e8d67a]"}>{u.name.toUpperCase()}</span>
                      </span>
                      <span className="text-[10px] text-[#8a7a2a]">{u.email}</span>
                      <span className={`text-[9px] tracking-widest ${isMe ? "text-emerald-400" : "text-[#5a4d18]"}`}>
                        {isMe ? "ACTIVE" : "STANDBY"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-3 text-[9px] tracking-widest text-[#6b5d1f]">● = CURRENT SESSION // ESC TO CLOSE</div>
          </div>
        </div>
      ) : null}

      {/* Panic decoy overlay */}
      {panic ? (
        <div className="fixed inset-0 z-[75] bg-[#f3f3f3] text-[#1a1a1a]">
          <div className="flex h-9 items-center gap-2 border-b border-[#c0c0c0] bg-[#e8e8e8] px-3 text-[12px]">
            <span className="font-bold">Q3_Financial_Review.xlsx - Excel</span>
            <span className="ml-auto text-[11px] text-[#666]">AutoSave ✓</span>
          </div>
          <div className="flex items-center gap-1 border-b border-[#c0c0c0] bg-[#f8f8f8] px-3 py-1 text-[11px] text-[#444]">
            <span className="mr-2">B2</span>
            <span className="rounded bg-white px-2 py-0.5 text-[#888]">fx</span>
            <span className="ml-2 text-[#666]">=SUM(B5:B14)</span>
          </div>
          <div className="overflow-auto p-4">
            <table className="border-collapse text-[12px]">
              <tbody>
                {[
                  ["A", "B", "C", "D"],
                  ["Quarter", "Revenue", "Cost", "Margin"],
                  ["Q1", "1,204", "812", "32.6%"],
                  ["Q2", "1,318", "867", "34.2%"],
                  ["Q3", "1,476", "931", "36.9%"],
                  ["Q4", "1,562", "988", "36.7%"],
                  ["TOTAL", "5,560", "3,598", "35.3%"],
                ].map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`border border-[#d0d0d0] px-3 py-1 ${ri === 0 || ri === 1 ? "bg-[#e3e3e3] font-semibold" : "bg-white"} ${cell === "TOTAL" || ci === 0 && ri > 1 ? "font-semibold" : ""}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-[#999]">
            PANIC MODE // CTRL+SHIFT+P TO RETURN
          </div>
        </div>
      ) : null}

      {/* Matrix rain overlay */}
      {matrix ? <MatrixRain onExit={() => setMatrix(false)} /> : null}

      <style>{`
        .scanlines {
          background: repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 2px,
            rgba(0, 0, 0, 0.9) 3px
          );
        }
        .tape-track {
          animation: tape-scroll 45s linear infinite;
        }
        @keyframes tape-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .boot-bar {
          animation: boot-fill 2.2s ease-out forwards;
        }
        @keyframes boot-fill {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}

export default TerminalPage;
