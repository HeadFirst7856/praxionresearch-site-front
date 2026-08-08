import { useEffect, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// P&L Monte Carlo — RVWAP MLP expectancy on a Topstep 50K profile.
// Seeded fake engine for the terminal: as elapsed days grow, surviving paths
// re-anchor to the realized equity line and impossible (busted / divergent)
// paths are eliminated — the fan converges to reality.
// ---------------------------------------------------------------------------

export const ACCOUNT_START = 50_000;
export const DAILY_EV = 125; // $/day expected value (RVWAP MLP-style seed)
export const DAILY_SIGMA = 340; // $/day noise
export const T_DAYS = 30;
export const N_PATHS = 80;
export const DAILY_LOSS_LIMIT = 2_000; // Topstep 50K daily loss limit
export const TRAILING_DD = 2_500; // Topstep 50K trailing max drawdown

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

/** Full T-day simulations from account start. Paths that bust stop updating (flat). */
function generatePaths(seed: number): number[][] {
  const rng = mulberry32(seed);
  const paths: number[][] = [];
  for (let p = 0; p < N_PATHS; p++) {
    const path: number[] = [ACCOUNT_START];
    let equity = ACCOUNT_START;
    let peak = ACCOUNT_START;
    let busted = false;
    for (let d = 1; d <= T_DAYS; d++) {
      if (!busted) {
        equity += DAILY_EV + gaussian(rng) * DAILY_SIGMA;
        peak = Math.max(peak, equity);
        if (equity <= peak - TRAILING_DD) busted = true;
      }
      path.push(busted ? path[path.length - 1] : equity);
    }
    paths.push(path);
  }
  return paths;
}

/** One "realized" equity path (fake but plausible: modest drift, no bust). */
function generateRealized(seed: number): number[] {
  const rng = mulberry32(seed);
  const path: number[] = [ACCOUNT_START];
  let equity = ACCOUNT_START;
  let peak = ACCOUNT_START;
  for (let d = 1; d <= T_DAYS; d++) {
    equity += 90 + gaussian(rng) * 300;
    peak = Math.max(peak, equity);
    if (equity <= peak - TRAILING_DD) equity = peak - TRAILING_DD + 40; // near-miss recovery
    path.push(Math.round(equity));
  }
  return path;
}

function pct(arr: number[], q: number): number {
  if (arr.length === 0) return ACCOUNT_START;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx];
}

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

export function PnLMonteCarlo({ active }: { active: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [seed] = useState(() => 20260808);
  const [realizedSeed] = useState(() => 1337);

  const paths = useMemo(() => generatePaths(seed), [seed]);
  const realized = useMemo(() => generateRealized(realizedSeed), [realizedSeed]);

  // Auto-advance one trading day every 3.5s while running + visible.
  useEffect(() => {
    if (!running || !active) return;
    const id = window.setInterval(() => {
      setElapsed((e) => (e >= T_DAYS ? T_DAYS : e + 1));
    }, 3500);
    return () => window.clearInterval(id);
  }, [running, active]);

  const survivors = useMemo(() => {
    if (elapsed === 0) return paths;
    const realizedAt = realized[elapsed];
    // Deviation band tightens relative to noise growth: impossible paths get cut.
    const band = DAILY_SIGMA * Math.sqrt(Math.max(elapsed, 1)) * 1.7;
    return paths.filter((path) => {
      // busted in simulation before elapsed contradicts a surviving reality
      for (let d = 1; d <= elapsed; d++) {
        if (path[d] <= ACCOUNT_START - TRAILING_DD + 1) return false;
      }
      return Math.abs(path[elapsed] - realizedAt) <= band;
    });
  }, [paths, realized, elapsed]);

  // Re-anchor survivors to the realized line, then project forward.
  const anchored = useMemo(() => {
    return survivors.map((path) => {
      const delta = realized[elapsed] - path[elapsed];
      return path.map((v, d) => (d <= elapsed ? realized[d] : v + delta));
    });
  }, [survivors, realized, elapsed]);

  const bands = useMemo(() => {
    const p5: number[] = [];
    const p25: number[] = [];
    const p50: number[] = [];
    const p75: number[] = [];
    const p95: number[] = [];
    for (let d = 0; d <= T_DAYS; d++) {
      const col = anchored.map((p) => p[d]);
      p5.push(pct(col, 0.05));
      p25.push(pct(col, 0.25));
      p50.push(pct(col, 0.5));
      p75.push(pct(col, 0.75));
      p95.push(pct(col, 0.95));
    }
    return { p5, p25, p50, p75, p95 };
  }, [anchored]);

  const endValues = useMemo(() => anchored.map((p) => p[T_DAYS]), [anchored]);
  const probPass = endValues.length
    ? (endValues.filter((v) => v >= ACCOUNT_START).length / endValues.length) * 100
    : 0;
  const medianEnd = pct(endValues, 0.5);
  const p10End = pct(endValues, 0.1);
  const p90End = pct(endValues, 0.9);

  // SVG geometry
  const W = 760;
  const H = 430;
  const PAD = { l: 64, r: 18, t: 24, b: 34 };
  const allEq = [...realized, ...anchored.flat()];
  const lo = Math.min(ACCOUNT_START - TRAILING_DD - 600, ...allEq);
  const hi = Math.max(ACCOUNT_START + 4_000, ...allEq);
  const x = (d: number) => PAD.l + (d / T_DAYS) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const pathStr = (arr: number[]) =>
    arr.map((v, d) => `${d === 0 ? "M" : "L"}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const bandPath = (a: number[], b: number[]) =>
    `${pathStr(a)} ${[...b].reverse().map((v, i) => `L${x(a.length - 1 - i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} Z`;

  const dayProg = Math.round((elapsed / T_DAYS) * 100);

  return (
    <div className="flex h-full w-full flex-col bg-black">
      {/* Header row */}
      <div className="flex items-center justify-between border-b border-[#ffd700]/30 bg-[#070500]/90 px-4 py-1.5">
        <div className="text-[10px] font-bold tracking-[0.25em] text-[#ffd700]">
          P&L TRAJECTORY // MONTE CARLO // RVWAP MLP EXPECTANCY
        </div>
        <div className="flex items-center gap-3 font-mono text-[9px] tracking-[0.15em]">
          <span className="text-[#8a7a2a]">
            DAY {Math.min(elapsed, T_DAYS)}/{T_DAYS} · {dayProg}%
          </span>
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className="border border-[#ffd700]/40 px-2 py-0.5 text-[#c9a92c] transition-colors hover:bg-[#1a1505] hover:text-[#ffd700]"
          >
            {running ? "❚❚ PAUSE" : "▶ RUN"}
          </button>
          <button
            type="button"
            onClick={() => setElapsed(0)}
            className="border border-[#ffd700]/40 px-2 py-0.5 text-[#c9a92c] transition-colors hover:bg-[#1a1505] hover:text-[#ffd700]"
          >
            ↺ RESET
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
          {/* grid */}
          {Array.from({ length: 7 }).map((_, i) => {
            const v = lo + ((hi - lo) * i) / 6;
            return (
              <g key={`g${i}`}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgba(255,215,0,0.08)" strokeWidth={1} />
                <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#6b5d1f" fontFamily="monospace">
                  ${Math.round(v / 250) * 250 >= 1000 ? `${(Math.round(v / 250) * 250 / 1000).toFixed(1)}K` : Math.round(v / 250) * 250}
                </text>
              </g>
            );
          })}
          {Array.from({ length: 7 }).map((_, i) => {
            const d = Math.round((T_DAYS * i) / 6);
            return (
              <g key={`v${i}`}>
                <line x1={x(d)} x2={x(d)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,215,0,0.06)" strokeWidth={1} />
                <text x={x(d)} y={H - PAD.b + 14} textAnchor="middle" fontSize={9} fill="#6b5d1f" fontFamily="monospace">
                  D{d}
                </text>
              </g>
            );
          })}

          {/* reference lines */}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(ACCOUNT_START - DAILY_LOSS_LIMIT)} y2={y(ACCOUNT_START - DAILY_LOSS_LIMIT)} stroke="rgba(248,113,113,0.35)" strokeWidth={1} strokeDasharray="5 4" />
          <text x={W - PAD.r - 4} y={y(ACCOUNT_START - DAILY_LOSS_LIMIT) - 4} textAnchor="end" fontSize={8} fill="#f87171" fontFamily="monospace" opacity={0.8}>
            DAILY LOSS LIMIT −$2,000
          </text>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(ACCOUNT_START - TRAILING_DD)} y2={y(ACCOUNT_START - TRAILING_DD)} stroke="rgba(248,113,113,0.6)" strokeWidth={1.2} strokeDasharray="6 4" />
          <text x={PAD.l + 4} y={y(ACCOUNT_START - TRAILING_DD) + 12} fontSize={8} fill="#f87171" fontFamily="monospace" opacity={0.9}>
            TRAILING MAX DD −$2,500 (BUST)
          </text>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(ACCOUNT_START)} y2={y(ACCOUNT_START)} stroke="rgba(255,215,0,0.25)" strokeWidth={1} />
          <text x={PAD.l + 4} y={y(ACCOUNT_START) - 4} fontSize={8} fill="#a08c30" fontFamily="monospace">
            START $50,000
          </text>

          {/* fan bands */}
          <path d={bandPath(bands.p5, bands.p95)} fill="rgba(255,215,0,0.07)" />
          <path d={bandPath(bands.p25, bands.p75)} fill="rgba(255,215,0,0.12)" />
          {/* spaghetti: first 24 survivors */}
          {anchored.slice(0, 24).map((p, i) => (
            <path key={i} d={pathStr(p)} fill="none" stroke="rgba(255,215,0,0.10)" strokeWidth={0.7} />
          ))}
          {/* median */}
          <path d={pathStr(bands.p50)} fill="none" stroke="#d4af37" strokeWidth={1.6} />
          {/* realized */}
          <path d={pathStr(realized)} fill="none" stroke="#ffd700" strokeWidth={2.4} />
          {realized.map((v, d) => (
            <circle
              key={d}
              cx={x(d)}
              cy={y(v)}
              r={d === 0 || d === elapsed ? 4 : 1.6}
              fill={d <= elapsed ? "#ffd700" : "transparent"}
              stroke={d <= elapsed ? "#ffd700" : "rgba(255,215,0,0.4)"}
              strokeWidth={1}
            />
          ))}
          {/* convergence marker */}
          <line x1={x(elapsed)} x2={x(elapsed)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,215,0,0.5)" strokeWidth={1.2} strokeDasharray="3 3" />
          <text x={x(elapsed)} y={PAD.t - 6} textAnchor="middle" fontSize={9} fill="#ffd700" fontFamily="monospace">
            ▼ NOW
          </text>
        </svg>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-px border-t border-[#ffd700]/30 bg-[#ffd700]/20 sm:grid-cols-6">
        {[
          { k: "EXPECTANCY", v: `${fmtMoney(DAILY_EV)}/D` },
          { k: "SIGMA", v: `$${DAILY_SIGMA}/D` },
          { k: "SURVIVORS", v: `${survivors.length}/${N_PATHS}` },
          { k: "P(PASS)", v: `${probPass.toFixed(0)}%` },
          { k: "MEDIAN END", v: fmtMoney(medianEnd - ACCOUNT_START) },
          { k: "P10/P90", v: `${fmtMoney(p10End - ACCOUNT_START)} / ${fmtMoney(p90End - ACCOUNT_START)}` },
        ].map((s) => (
          <div key={s.k} className="bg-[#070500] px-2 py-1.5">
            <div className="text-[8px] tracking-[0.18em] text-[#6b5d1f]">{s.k}</div>
            <div className="mt-0.5 font-mono text-[11px] text-[#e8d67a]">{s.v}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-[#ffd700]/20 bg-[#050300] px-3 py-1 text-center font-mono text-[8px] tracking-[0.2em] text-[#6b5d1f]">
        PATHS RE-ANCHOR TO REALIZED EQUITY EACH DAY // IMPOSSIBLE PATHS ELIMINATED // SEEDED DEMO DATA
      </div>
    </div>
  );
}
