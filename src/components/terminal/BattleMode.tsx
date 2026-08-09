import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveAccount } from "@/lib/useLiveAccount";

// ---------------------------------------------------------------------------
// BATTLE MODE — 4-pane war room:
//   1. MONTE CARLO WALK-FORWARD  — real daily P&L distribution from the live
//      slot, re-anchored to CURRENT account amount + days since strategy start.
//   2. TRADE LOG                 — real closed trades across live/sim slots.
//   3. OPERATOR CHAT             — shared terminal chat (Netlify Blobs).
//   4. NEWS + PRICE ALERTS       — flashing alerts on big moves / fresh news.
// ---------------------------------------------------------------------------

type DailyRow = { period?: string; day?: string; pnl_dollars?: number; end_balance?: number; start_balance?: number };
type TradeRow = {
  strategy?: string;
  side?: string;
  entry_time?: string;
  exit_time?: string;
  entry_price?: number;
  exit_price?: number;
  pnl_dollars?: number;
  pnl_points?: number;
  exit_reason?: string;
  size?: number;
};
type Slot = {
  title?: string;
  mode?: string;
  instrument?: string;
  daily_rows?: DailyRow[];
  recent_trades?: TradeRow[];
  all_trades?: TradeRow[];
  ending_balance?: number;
  starting_balance?: number;
  trades_total?: number | null;
};
type ChatMessage = { id: string; ts: string; name: string; text: string };
type TapeItem = { sym: string; label: string; last: number | null; change: number | null; changePct: number | null };
type FeedItem = { source: string; title: string; link: string; desc?: string; pub: string; geo?: unknown };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString();
}

function pctOf(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)));
  return s[idx];
}

function timeAgo(ts: string): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return "--";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const PANE_HEADER = "flex items-center justify-between border-b border-[#ffd700]/40 bg-[#0a0800] px-3 py-1.5";
const PANE_TITLE = "text-[10px] font-bold tracking-[0.25em] text-[#ffd700]";
const PANE_BODY = "min-h-0 flex-1 overflow-y-auto bg-[#050300]/85";

// ---------------------------------------------------------------------------
// Pane 1 — Monte Carlo walk-forward on REAL daily P&L
// ---------------------------------------------------------------------------
function MonteCarloPane({ slots }: { slots: Record<string, Slot> }) {
  // Live slot is the anchor; fall back to any slot with daily_rows.
  const slotKey = slots.topstep_rvwap_mlp_live ? "topstep_rvwap_mlp_live"
    : Object.keys(slots).find((k) => (slots[k].daily_rows?.length ?? 0) > 0) ?? "";
  const slot = slots[slotKey];
  const daily = useMemo(() => {
    const rows = (slot?.daily_rows ?? []).filter((r) => typeof r.pnl_dollars === "number");
    return rows.map((r) => r.pnl_dollars as number);
  }, [slot]);

  // Strategy start date = first covered day of the sim (summary-level anchor).
  const startDate = useMemo(() => {
    const first = slot?.daily_rows?.[0]?.period ?? slot?.daily_rows?.[0]?.day;
    return first ? new Date(first) : null;
  }, [slot]);

  const [account, setAccount] = useState(50_000);
  const [daysElapsed, setDaysElapsed] = useState(0);
  const [horizon, setHorizon] = useState(30);
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const [running, setRunning] = useState(true);

  // Defaults: current account = 50K profile; days since start = real elapsed.
  useEffect(() => {
    if (startDate) {
      const d = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86400000));
      setDaysElapsed(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate]);

  // Realized equity from the slot's actual daily P&L, re-anchored to account.
  const realized = useMemo(() => {
    const eq: number[] = [account];
    let e = account;
    for (let i = 0; i < Math.min(daysElapsed, daily.length); i++) {
      e += daily[i];
      eq.push(e);
    }
    return eq;
  }, [account, daysElapsed, daily]);

  // Forward paths: bootstrap-sampled daily P&L from the REAL distribution.
  const paths = useMemo(() => {
    if (daily.length < 5) return [];
    const rng = mulberry32(seed);
    const used = Math.min(daysElapsed, daily.length);
    const realizedAt = realized[realized.length - 1];
    const pathsOut: number[][] = [];
    const N = 120;
    for (let p = 0; p < N; p++) {
      const path: number[] = [realizedAt];
      let eq = realizedAt;
      let peak = eq;
      let busted = false;
      for (let d = 1; d <= horizon; d++) {
        if (!busted) {
          const sample = daily[Math.floor(rng() * daily.length)] + gaussian(rng) * 30;
          eq += sample;
          peak = Math.max(peak, eq);
          if (eq <= peak - 2_500) busted = true; // trailing DD bust (Topstep 50K)
        }
        path.push(busted ? path[path.length - 1] : eq);
      }
      pathsOut.push(path);
    }
    void used;
    return pathsOut;
  }, [daily, seed, daysElapsed, realized, horizon]);

  // Advance the "now" marker while running (1 day per 2.5s).
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {}, 2500);
    return () => window.clearInterval(id);
  }, [running]);

  const bands = useMemo(() => {
    const p5: number[] = [], p25: number[] = [], p50: number[] = [], p75: number[] = [], p95: number[] = [];
    for (let d = 0; d <= horizon; d++) {
      const col = paths.map((p) => p[d]);
      p5.push(pctOf(col, 0.05));
      p25.push(pctOf(col, 0.25));
      p50.push(pctOf(col, 0.5));
      p75.push(pctOf(col, 0.75));
      p95.push(pctOf(col, 0.95));
    }
    return { p5, p25, p50, p75, p95 };
  }, [paths, horizon]);

  const endValues = useMemo(() => paths.map((p) => p[horizon]), [paths, horizon]);
  const probPass = endValues.length ? (endValues.filter((v) => v >= account).length / endValues.length) * 100 : 0;
  const medianEnd = pctOf(endValues, 0.5);
  const p10End = pctOf(endValues, 0.1);
  const p90End = pctOf(endValues, 0.9);
  const bustRate = endValues.length ? (endValues.filter((v) => v <= account - 2_500).length / endValues.length) * 100 : 0;

  // SVG geometry
  const W = 640, H = 300, PAD = { l: 56, r: 14, t: 20, b: 30 };
  const allEq = [...realized, ...paths.flat()];
  const lo = Math.min(account - 2_500 - 500, ...allEq);
  const hi = Math.max(account + 3_000, ...allEq);
  const totalDays = daysElapsed + horizon;
  const x = (d: number) => PAD.l + (d / totalDays) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const pathStr = (arr: number[], offset = 0) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(offset + i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const bandPath = (a: number[], b: number[]) =>
    `${pathStr(a, daysElapsed)} ${[...b].reverse().map((v, i) => `L${x(daysElapsed + a.length - 1 - i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} Z`;

  return (
    <div className="flex h-full w-full flex-col bg-black">
      <div className={PANE_HEADER}>
        <span className={PANE_TITLE}>MONTE CARLO // WALK-FORWARD</span>
        <span className="font-mono text-[9px] tracking-widest text-[#8a7a2a]">
          {slot ? `${slot.title ?? slotKey}`.toUpperCase() : "NO SLOT DATA"}
        </span>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-4 gap-px border-b border-[#ffd700]/30 bg-[#ffd700]/20">
        {[
          { k: "ACCOUNT $", v: account, set: setAccount, step: 1000 },
          { k: "DAYS SINCE START", v: daysElapsed, set: setDaysElapsed, step: 1 },
          { k: "HORIZON DAYS", v: horizon, set: setHorizon, step: 5 },
        ].map((f) => (
          <label key={f.k} className="bg-[#070500] px-2 py-1">
            <span className="block text-[8px] tracking-[0.18em] text-[#6b5d1f]">{f.k}</span>
            <input
              type="number"
              value={f.v}
              min={0}
              step={f.step}
              onChange={(e) => f.set(Number(e.target.value) || 0)}
              className="w-full bg-transparent font-mono text-[12px] text-[#e8d67a] outline-none"
            />
          </label>
        ))}
        <div className="flex items-center justify-end gap-1.5 bg-[#070500] px-2 py-1">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className="border border-[#ffd700]/40 px-3 py-2 text-[10px] tracking-widest text-[#c9a92c] hover:bg-[#1a1505] sm:px-2 sm:py-0.5 sm:text-[9px]"
          >
            {running ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            onClick={() => { setSeed(Date.now() % 100000); }}
            className="border border-[#ffd700]/40 px-2 py-0.5 text-[9px] tracking-widest text-[#c9a92c] hover:bg-[#1a1505]"
          >
            ↺ NEW RUN
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="relative min-h-0 flex-1">
        {paths.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[10px] tracking-widest text-[#6b5d1f]">
            INSUFFICIENT DAILY DATA FOR WALK-FORWARD
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            {Array.from({ length: 6 }).map((_, i) => {
              const v = lo + ((hi - lo) * i) / 5;
              return (
                <g key={`g${i}`}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgba(255,215,0,0.08)" />
                  <text x={PAD.l - 5} y={y(v) + 3} textAnchor="end" fontSize={8} fill="#6b5d1f" fontFamily="monospace">
                    {Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`}
                  </text>
                </g>
              );
            })}
            <line x1={x(0)} x2={x(totalDays)} y1={y(account)} y2={y(account)} stroke="rgba(255,215,0,0.25)" strokeWidth={1} />
            <text x={PAD.l + 4} y={y(account) - 4} fontSize={8} fill="#a08c30" fontFamily="monospace">
              START ${fmtNum(account)}
            </text>
            <line x1={x(0)} x2={x(totalDays)} y1={y(account - 2_500)} y2={y(account - 2_500)} stroke="rgba(248,113,113,0.6)" strokeWidth={1.2} strokeDasharray="6 4" />
            <text x={W - PAD.r - 4} y={y(account - 2_500) - 4} textAnchor="end" fontSize={8} fill="#f87171" fontFamily="monospace">
              BUST −$2,500
            </text>
            {/* realized + forward separator */}
            <line x1={x(daysElapsed)} x2={x(daysElapsed)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,215,0,0.5)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(daysElapsed)} y={PAD.t - 4} textAnchor="middle" fontSize={8} fill="#ffd700" fontFamily="monospace">
              ▼ NOW
            </text>
            {/* fan */}
            <path d={bandPath(bands.p5, bands.p95)} fill="rgba(255,215,0,0.07)" />
            <path d={bandPath(bands.p25, bands.p75)} fill="rgba(255,215,0,0.12)" />
            {paths.slice(0, 18).map((p, i) => (
              <path key={i} d={pathStr(p, daysElapsed)} fill="none" stroke="rgba(255,215,0,0.10)" strokeWidth={0.6} />
            ))}
            <path d={pathStr(bands.p50, daysElapsed)} fill="none" stroke="#d4af37" strokeWidth={1.5} />
            {/* realized */}
            <path d={pathStr(realized)} fill="none" stroke="#ffd700" strokeWidth={2.2} />
            {realized.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={i === realized.length - 1 ? 3.5 : 1.4} fill={i === realized.length - 1 ? "#ffd700" : "transparent"} stroke="#ffd700" strokeWidth={1} />
            ))}
          </svg>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-px border-t border-[#ffd700]/30 bg-[#ffd700]/20">
        {[
          { k: "SAMPLES", v: `${daily.length}d` },
          { k: "PATHS", v: `${paths.length}` },
          { k: "P(PASS)", v: `${probPass.toFixed(0)}%` },
          { k: "BUST", v: `${bustRate.toFixed(0)}%` },
          { k: "MEDIAN END", v: fmtMoney(medianEnd - account) },
          { k: "P10/P90", v: `${fmtMoney(p10End - account)}/${fmtMoney(p90End - account)}` },
        ].map((s) => (
          <div key={s.k} className="bg-[#070500] px-2 py-1">
            <div className="text-[8px] tracking-[0.18em] text-[#6b5d1f]">{s.k}</div>
            <div className="mt-0.5 font-mono text-[11px] text-[#e8d67a]">{s.v}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-[#ffd700]/20 bg-[#050300] px-3 py-1 text-center font-mono text-[8px] tracking-[0.18em] text-[#6b5d1f]">
        BOOTSTRAP FROM REAL DAILY P&L · TRAILING DD BUST −$2,500 · RE-ANCHORED TO CURRENT ACCOUNT
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pane 2 — Trade log (real closed trades)
// ---------------------------------------------------------------------------
function TradeLogPane({ slots }: { slots: Record<string, Slot> }) {
  const trades = useMemo(() => {
    const out: Array<TradeRow & { slotTitle: string }> = [];
    for (const [key, s] of Object.entries(slots)) {
      const src = s.all_trades?.length ? s.all_trades : s.recent_trades ?? [];
      for (const t of src) {
        out.push({ ...t, slotTitle: s.title ?? key });
      }
    }
    return out
      .filter((t) => t.exit_time)
      .sort((a, b) => (b.exit_time ?? "").localeCompare(a.exit_time ?? ""))
      .slice(0, 400);
  }, [slots]);

  if (trades.length === 0) {
    return (
      <div className="flex h-full flex-col bg-black">
        <div className={PANE_HEADER}><span className={PANE_TITLE}>TRADE LOG</span><span className="font-mono text-[9px] text-[#8a7a2a]">0</span></div>
        <div className="flex flex-1 items-center justify-center text-[10px] tracking-widest text-[#6b5d1f]">NO TRADE DATA</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-black">
      <div className={PANE_HEADER}>
        <span className={PANE_TITLE}>TRADE LOG</span>
        <span className="font-mono text-[9px] tracking-widest text-[#8a7a2a]">{trades.length} CLOSED</span>
      </div>
      <div className={PANE_BODY}>
        <table className="w-full border-collapse font-mono text-[9px]">
          <thead className="sticky top-0 bg-[#0a0800] text-[8px] tracking-widest text-[#8a7a2a]">
            <tr>
              <th className="px-2 py-1 text-left">EXIT (ET)</th>
              <th className="px-1 py-1 text-left">SYM</th>
              <th className="px-1 py-1 text-left">SIDE</th>
              <th className="px-1 py-1 text-right">ENTRY</th>
              <th className="px-1 py-1 text-right">EXIT</th>
              <th className="px-2 py-1 text-right">P&L $</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => {
              const pnl = t.pnl_dollars ?? 0;
              return (
                <tr key={i} className="border-t border-[#ffd700]/10 hover:bg-[#141002]">
                  <td className="whitespace-nowrap px-2 py-1 text-[#8a7a2a]">{timeAgo(t.exit_time ?? "")}</td>
                  <td className="px-1 py-1 text-[#e8d67a]">{t.strategy?.toUpperCase().slice(0, 10) ?? "--"}</td>
                  <td className={`px-1 py-1 ${t.side === "long" ? "text-emerald-400" : "text-red-400"}`}>
                    {t.side === "long" ? "▲L" : t.side === "short" ? "▼S" : "--"}
                  </td>
                  <td className="px-1 py-1 text-right text-[#a08c30]">{t.entry_price != null ? fmtNum(t.entry_price) : "--"}</td>
                  <td className="px-1 py-1 text-right text-[#a08c30]">{t.exit_price != null ? fmtNum(t.exit_price) : "--"}</td>
                  <td className={`px-2 py-1 text-right ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pane 3 — Operator chat (Netlify Blobs)
// ---------------------------------------------------------------------------
function ChatPane({ myName, roster }: { myName: string; roster: Array<{ name: string; email: string }> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("CONNECTING");
  const [flashId, setFlashId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastIdRef = useRef<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/chat", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { messages: ChatMessage[] };
      setMessages(data.messages ?? []);
      setStatus("LIVE");
      const last = data.messages?.[data.messages.length - 1];
      if (last && last.id !== lastIdRef.current) {
        if (lastIdRef.current != null) setFlashId(last.id);
        lastIdRef.current = last.id;
      }
    } catch (e) {
      setStatus(`FAULT: ${e instanceof Error ? e.message : "poll"}`);
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), 5000);
    return () => window.clearInterval(id);
  }, [poll]);

  useEffect(() => {
    if (!flashId) return;
    const t = window.setTimeout(() => setFlashId(null), 1600);
    return () => window.clearTimeout(t);
  }, [flashId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const nameFor = (name: string) => {
    const match = roster.find((r) => r.email.toLowerCase() === name.toLowerCase());
    return match ? match.name.toUpperCase() : name.toUpperCase();
  };

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setStatus("SENDING");
    try {
      const res = await fetch("/api/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: myName || "OPERATOR", text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("LIVE");
      await poll();
    } catch (e) {
      setStatus(`SEND FAIL: ${e instanceof Error ? e.message : "err"}`);
      setDraft(text); // restore
    }
  }

  return (
    <div className="flex h-full flex-col bg-black">
      <div className={PANE_HEADER}>
        <span className={PANE_TITLE}>OPERATOR CHAT</span>
        <span className={`font-mono text-[9px] tracking-widest ${status === "LIVE" ? "text-emerald-400" : "text-red-400"}`}>
          {status === "LIVE" ? "● LIVE" : status}
        </span>
      </div>
      <div ref={scrollRef} className={`${PANE_BODY} flex flex-col gap-1.5 p-2`}>
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[10px] tracking-widest text-[#6b5d1f]">
            NO MESSAGES — SAY SOMETHING
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.name === (myName || "OPERATOR");
            return (
              <div
                key={m.id}
                className={`rounded border px-2 py-1 text-[10px] leading-snug ${
                  flashId === m.id
                    ? "animate-[chatflash_1.6s_ease-out] border-[#ffd700]"
                    : mine
                      ? "ml-8 self-end border-[#ffd700]/40 bg-[#141002]"
                      : "mr-8 self-start border-[#8a7a2a]/40 bg-[#0a0800]"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className={mine ? "text-[#ffd700]" : "text-[#a08c30]"}>{nameFor(m.name)}</span>
                  <span className="ml-auto text-[8px] text-[#6b5d1f]">{timeAgo(m.ts)}</span>
                </div>
                <div className="mt-0.5 text-[#e8d67a]">{m.text}</div>
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-[#ffd700]/40 bg-[#0a0800] px-2 py-2.5 sm:py-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
            e.stopPropagation();
          }}
          placeholder="MESSAGE // ENTER TO SEND"
          className="min-w-0 flex-1 bg-transparent font-mono text-[12px] tracking-wider text-[#ffd700] outline-none placeholder:text-[#6b5d1f] sm:text-[10px]"
          maxLength={500}
        />
        <button
          type="button"
          onClick={() => void send()}
          className="border border-[#ffd700]/40 px-2 py-0.5 text-[9px] tracking-widest text-[#c9a92c] hover:bg-[#1a1505]"
        >
          SEND
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pane 4 — News + price alerts (flashing)
// ---------------------------------------------------------------------------
function AlertsPane({
  news,
  tape,
}: {
  news: FeedItem[];
  tape: TapeItem[];
}) {
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const [threshold, setThreshold] = useState(1.0); // % move to flash
  const bigMovers = useMemo(
    () => (tape ?? []).filter((q) => Math.abs(q.changePct ?? 0) >= threshold),
    [tape, threshold],
  );

  // Flash when a new headline arrives.
  useEffect(() => {
    if (news.length === 0) return;
    const latest = news[0];
    const key = `${latest.source}-${latest.title}`;
    if (!seen.has(key)) {
      setSeen((prev) => new Set([key, ...Array.from(prev).slice(0, 200)]));
      setFlashIdx(0);
      const t = window.setTimeout(() => setFlashIdx(null), 1800);
      return () => window.clearTimeout(t);
    }
  }, [news, seen]);

  return (
    <div className="flex h-full flex-col bg-black">
      <div className={PANE_HEADER}>
        <span className={PANE_TITLE}>NEWS + PRICE ALERTS</span>
        <span className="font-mono text-[9px] tracking-widest text-[#8a7a2a]">
          MOVERS ≥ {threshold.toFixed(1)}% · {bigMovers.length}
        </span>
      </div>

      {/* Price alert strip */}
      <div className="border-b border-[#ffd700]/30 bg-[#0a0800] px-2 py-1">
        {bigMovers.length === 0 ? (
          <div className="text-center font-mono text-[9px] tracking-widest text-[#6b5d1f]">
            NO SYMBOLS MOVING ≥ {threshold.toFixed(1)}%
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {bigMovers.map((q, i) => {
              const up = (q.changePct ?? 0) > 0;
              return (
                <span
                  key={`${q.sym}-${i}`}
                  className={`animate-[alertflash_1.4s_ease-in-out_infinite] border px-2 py-0.5 font-mono text-[10px] ${
                    up
                      ? "border-emerald-400/70 bg-emerald-950/40 text-emerald-300"
                      : "border-red-400/70 bg-red-950/40 text-red-300"
                  }`}
                >
                  {q.label} {up ? "▲" : "▼"} {q.changePct != null ? `${up ? "+" : ""}${q.changePct.toFixed(2)}%` : "--"}
                </span>
              );
            })}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[8px] tracking-[0.18em] text-[#6b5d1f]">FLASH THRESHOLD %</span>
          <input
            type="number"
            value={threshold}
            min={0.1}
            step={0.1}
            onChange={(e) => setThreshold(Number(e.target.value) || 1)}
            className="w-14 bg-transparent font-mono text-[10px] text-[#e8d67a] outline-none"
          />
        </div>
      </div>

      {/* News flash list */}
      <div className={PANE_BODY}>
        {news.length === 0 ? (
          <div className="p-3 text-[10px] tracking-wider text-[#8a7a2a]">ACQUIRING FEED...</div>
        ) : (
          news.slice(0, 60).map((item, i) => (
            <a
              key={`${item.source}-${i}`}
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className={`block border-b border-[#8a7a2a]/20 px-3 py-2 transition-colors hover:bg-[#1a1505] ${
                flashIdx === i ? "animate-[chatflash_1.8s_ease-out] bg-[#141002]" : ""
              }`}
            >
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 text-[9px] tracking-[0.18em] text-[#8a7a2a]">{item.source}</span>
                <span className="shrink-0 text-[9px] text-[#6b5d1f]">{timeAgo(item.pub)}</span>
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-[#e8d67a]">{item.title}</div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pane 5 — Console (terminal command line as its own pane)
// ---------------------------------------------------------------------------
function ConsolePane({
  consoleProps,
}: {
  consoleProps: {
    lines: string[];
    input: string;
    setInput: (v: string) => void;
    submit: (v: string) => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    scrollRef: React.RefObject<HTMLDivElement | null>;
  };
}) {
  const { lines, input, setInput, submit, inputRef, scrollRef } = consoleProps;
  return (
    <div className="flex h-full flex-col bg-black">
      <div className={PANE_HEADER}>
        <span className={PANE_TITLE}>CONSOLE</span>
        <span className="font-mono text-[9px] tracking-widest text-[#8a7a2a]">TYPE HELP + ENTER</span>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto bg-[#050300]/85 px-3 py-2 font-mono text-[10px] leading-snug tracking-wider text-[#c9a92c]"
      >
        {lines.map((l, i) => (
          <div key={i} className={l.startsWith(">") ? "text-[#ffd700]" : ""}>
            {l}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-[#ffd700]/40 bg-[#0a0800] px-2 py-1.5">
        <span className="text-[#ffd700]">❯</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(input);
            e.stopPropagation();
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] tracking-[0.15em] text-[#ffd700] caret-[#ffd700] outline-none placeholder:text-[#6b5d1f] sm:text-[11px]"
          placeholder="TYPE COMMAND + ENTER // HELP"
          spellCheck={false}
          autoComplete="off"
        />
        <span className="text-[8px] tracking-[0.2em] text-[#6b5d1f]">CMD&nbsp;GO</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pane 6 — Stats (total W/L, sessions, P&L since integrating)
// ---------------------------------------------------------------------------
export type SummaryData = {
  totals?: {
    closed_trades?: number;
    closed_pnl_dollars?: number;
    continuous_pnl_dollars?: number;
    days_covered?: number;
    covered_from?: string;
    covered_to?: string;
    return_on_50k?: number;
  };
  periods?: {
    yearly_rows?: Array<{
      period?: string;
      wins?: number;
      losses?: number;
      win_rate?: number;
      profit_factor?: number;
      max_drawdown?: number;
      pnl_dollars?: number;
      closed_trades?: number;
    }>;
  };
};

function StatsPane({ summary }: { summary: SummaryData | null }) {
  const live = useLiveAccount(60_000);
  const totals = summary?.totals;
  const yearly = summary?.periods?.yearly_rows?.[0];
  const wins = yearly?.wins ?? 0;
  const losses = yearly?.losses ?? 0;
  const winRate = yearly?.win_rate ?? (wins + losses > 0 ? wins / (wins + losses) : 0);
  const sessions = totals?.days_covered ?? 0;
  const pnlSince = totals?.closed_pnl_dollars ?? 0;
  const pf = yearly?.profit_factor ?? 0;
  const maxDD = yearly?.max_drawdown ?? 0;
  const trades = totals?.closed_trades ?? yearly?.closed_trades ?? 0;
  const ret = totals?.return_on_50k ?? 0;

  const cells: Array<{ k: string; v: string; tone?: string }> = [
    { k: "LIVE BALANCE", v: live.balance != null ? fmtMoney(live.balance) : (live.offline ? "OFFLINE" : "--"), tone: live.balance != null && live.balance >= 0 ? "text-emerald-400" : "text-[#e8d67a]" },
    { k: "P&L DAY", v: live.pnl_day != null ? fmtMoney(live.pnl_day) : "--", tone: live.pnl_day != null ? (live.pnl_day >= 0 ? "text-emerald-400" : "text-red-400") : "text-[#e8d67a]" },
    { k: "P&L WEEK", v: live.pnl_week != null ? fmtMoney(live.pnl_week) : "--", tone: live.pnl_week != null ? (live.pnl_week >= 0 ? "text-emerald-400" : "text-red-400") : "text-[#e8d67a]" },
    { k: "P&L 90D", v: live.pnl_90d != null ? fmtMoney(live.pnl_90d) : "--", tone: live.pnl_90d != null ? (live.pnl_90d >= 0 ? "text-emerald-400" : "text-red-400") : "text-[#e8d67a]" },
    { k: "OPEN POSITIONS", v: String(live.open_positions) },
    { k: "TOTAL WINS", v: fmtNum(wins), tone: "text-emerald-400" },
    { k: "TOTAL LOSSES", v: fmtNum(losses), tone: "text-red-400" },
    { k: "WIN RATE", v: `${(winRate * 100).toFixed(1)}%` },
    { k: "CLOSED TRADES", v: fmtNum(trades) },
    { k: "SESSIONS", v: `${sessions} DAYS` },
    { k: "P&L SINCE INTEGRATING", v: fmtMoney(pnlSince), tone: pnlSince >= 0 ? "text-emerald-400" : "text-red-400" },
    { k: "PROFIT FACTOR", v: pf.toFixed(2) },
    { k: "MAX DRAWDOWN", v: `$${Math.round(maxDD).toLocaleString()}` },
    { k: "RETURN ON 50K", v: `${(ret * 100).toFixed(1)}%` },
  ];

  return (
    <div className="flex h-full flex-col bg-black">
      <div className={PANE_HEADER}>
        <span className={PANE_TITLE}>DESK STATS</span>
        <span className="font-mono text-[9px] tracking-widest text-[#8a7a2a]">
          {totals?.covered_from ?? "--"} → {totals?.covered_to ?? "--"}
        </span>
      </div>
      <div className={PANE_BODY}>
        <div className="grid grid-cols-2 gap-px bg-[#ffd700]/20 p-px">
          {cells.map((c) => (
            <div key={c.k} className="bg-[#070500] px-2 py-2">
              <div className="text-[8px] tracking-[0.18em] text-[#6b5d1f]">{c.k}</div>
              <div className={`mt-1 font-mono text-[13px] ${c.tone ?? "text-[#e8d67a]"}`}>{c.v}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 border border-[#ffd700]/30 bg-[#0a0800] px-2 py-1.5 font-mono text-[8px] tracking-[0.16em] text-[#6b5d1f]">
          COVERED FROM {totals?.covered_from ?? "--"} // REALTIME SIM SYNC // DAILY REFRESH 06:30 ET
        </div>
        <div className={`mt-1 px-2 py-1 font-mono text-[8px] tracking-[0.16em] ${live.offline ? "text-[#6b5d1f]" : "text-emerald-400/80"}`}>
          {live.offline
            ? `LIVE ACCOUNT: OFFLINE${live.error ? ` (${live.error})` : ""}`
            : `LIVE ACCOUNT: SYNCED${live.fetched_at ? ` ${live.fetched_at.slice(11, 19)}Z` : ""}${live.from_cache ? " (CACHE)" : ""} · POLL 60S`}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Battle Mode shell — 6-pane grid (3x2)
// ---------------------------------------------------------------------------
export function BattleMode({
  slots,
  news,
  tape,
  myName,
  roster,
  summary,
  consoleProps,
}: {
  slots: Record<string, Slot>;
  news: FeedItem[];
  tape: TapeItem[];
  myName: string;
  roster: Array<{ name: string; email: string }>;
  summary: SummaryData | null;
  consoleProps: {
    lines: string[];
    input: string;
    setInput: (v: string) => void;
    submit: (v: string) => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    scrollRef: React.RefObject<HTMLDivElement | null>;
  };
}) {
  // Mobile: one pane at a time, switched via a horizontal pill strip.
  // Desktop (>=640px): full 3x2 grid of all six panes.
  const [mobPane, setMobPane] = useState<"mc" | "trades" | "chat" | "alerts" | "console" | "stats">("mc");
  const panes = {
    mc: <MonteCarloPane slots={slots} />,
    trades: <TradeLogPane slots={slots} />,
    chat: <ChatPane myName={myName} roster={roster} />,
    alerts: <AlertsPane news={news} tape={tape} />,
    console: <ConsolePane consoleProps={consoleProps} />,
    stats: <StatsPane summary={summary} />,
  };
  const labels: Record<string, string> = {
    mc: "MONTE CARLO", trades: "TRADES", chat: "CHAT", alerts: "ALERTS", console: "CONSOLE", stats: "STATS",
  };

  return (
    <div className="flex h-full w-full flex-col bg-black">
      {/* Mobile pane switcher */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#ffd700]/30 bg-[#0a0800] px-2 py-1.5 sm:hidden">
        {(Object.keys(labels) as Array<"mc" | "trades" | "chat" | "alerts" | "console" | "stats">).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setMobPane(k)}
            className={`shrink-0 rounded border px-2.5 py-1.5 text-[10px] font-bold tracking-[0.15em] transition-colors ${
              mobPane === k ? "border-[#ffd700] bg-[#ffd700] text-black" : "border-[#8a7a2a]/50 text-[#c9a92c]"
            }`}
          >
            {labels[k]}
          </button>
        ))}
      </div>

      {/* Mobile: active pane only */}
      <div className="min-h-0 flex-1 sm:hidden">{panes[mobPane]}</div>

      {/* Desktop: full grid */}
      <div className="hidden h-full w-full grid-cols-3 grid-rows-2 gap-px bg-[#ffd700]/20 sm:grid">
        <div className="min-h-0 min-w-0 border-b border-r border-[#ffd700]/20">
          <MonteCarloPane slots={slots} />
        </div>
        <div className="min-h-0 min-w-0 border-b border-r border-[#ffd700]/20">
          <TradeLogPane slots={slots} />
        </div>
        <div className="min-h-0 min-w-0 border-b border-[#ffd700]/20">
          <ChatPane myName={myName} roster={roster} />
        </div>
        <div className="min-h-0 min-w-0 border-r border-[#ffd700]/20">
          <AlertsPane news={news} tape={tape} />
        </div>
        <div className="min-h-0 min-w-0 border-r border-[#ffd700]/20">
          <ConsolePane consoleProps={consoleProps} />
        </div>
        <div className="min-h-0 min-w-0">
          <StatsPane summary={summary} />
        </div>
      </div>
      <style>{`
        @keyframes chatflash {
          0% { background-color: rgba(255, 215, 0, 0.35); box-shadow: 0 0 18px rgba(255,215,0,0.5); }
          100% { background-color: transparent; box-shadow: none; }
        }
        @keyframes alertflash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>
    </div>
  );
}

export default BattleMode;
