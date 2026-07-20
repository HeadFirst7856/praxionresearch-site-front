import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mockStrategySlots } from "@/mocks/dashboardMocks";

const palette = ["#38bdf8", "#818cf8", "#22c55e", "#f59e0b", "#f472b6", "#fb7185"];

function shortTitle(value: string): string {
  return value
    .replace("IQ + ", "IQ/")
    .replace("TrendShift", "TS")
    .replace("Mean Reversion", "MR")
    .replace("Overlay", "Ov")
    .replace("Core", "")
    .trim();
}

function formatMoney(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function PlaygroundCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#07111f]/80 p-5 shadow-[0_30px_90px_rgba(2,6,23,0.35)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function StrategyPlaygroundPage() {
  const slots = useMemo(() => mockStrategySlots.slice(0, 4), []);

  const weeklyPerformance = useMemo(() => {
    const weeks = Array.from(new Set(slots.flatMap((slot) => slot.weeklyRows.map((row) => row.week)))).sort();
    return weeks.map((week) => {
      const row: Record<string, string | number> = { week: week.replace("2026-", "") };
      slots.forEach((slot) => {
        const weekly = slot.weeklyRows.find((item) => item.week === week);
        row[slot.key] = weekly?.endBalance ?? slot.startBalance;
      });
      return row;
    });
  }, [slots]);

  const strategyComparison = useMemo(
    () =>
      slots.map((slot, index) => ({
        key: slot.key,
        title: shortTitle(slot.title),
        pnl: Number(slot.continuousPnl.toFixed(0)),
        drawdown: Number(slot.maxDrawdown.toFixed(0)),
        winRate: Number((slot.winRate * 100).toFixed(1)),
        profitFactor: Number(slot.profitFactor.toFixed(2)),
        trades: slot.trades,
        fill: palette[index % palette.length],
      })),
    [slots],
  );

  const headline = useMemo(() => {
    const totalPnl = strategyComparison.reduce((sum, slot) => sum + slot.pnl, 0);
    const avgWinRate = strategyComparison.reduce((sum, slot) => sum + slot.winRate, 0) / strategyComparison.length;
    const avgDrawdown = strategyComparison.reduce((sum, slot) => sum + slot.drawdown, 0) / strategyComparison.length;
    return {
      totalPnl,
      avgWinRate,
      avgDrawdown,
    };
  }, [strategyComparison]);

  return (
    <div className="page-container py-14">
      <section className="rounded-[32px] border border-sky-500/20 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_42%),linear-gradient(180deg,rgba(9,18,32,0.98),rgba(7,12,23,0.98))] px-6 py-10 shadow-[0_30px_120px_rgba(2,6,23,0.45)] md:px-10">
        <div className="max-w-4xl">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-300">Strategy Playground</p>
          <h1 className="mt-3 text-[clamp(2.7rem,7vw,5rem)] leading-[0.92] font-semibold tracking-tight text-slate-50">
            A graph workspace for strategy exploration.
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-300">
            This is the new Praxion graph lab, a place to compare strategy behavior, risk shape, and performance curves before we wire every chart into the full live simulation stack.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/simulations"
              className={cn(buttonVariants({ variant: "default" }), "rounded-full bg-sky-500/20 px-4 text-sky-100 hover:bg-sky-500/30")}
            >
              Open Simulations
            </Link>
            <a
              href="/regime.html"
              className={cn(buttonVariants({ variant: "outline" }), "rounded-full border-white/15 bg-transparent px-4 text-slate-100 hover:bg-white/5")}
            >
              Open Regime
            </a>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#091221]/80 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Tracked sample P&amp;L</div>
            <div className="mt-2 text-3xl font-semibold text-emerald-300">{formatMoney(headline.totalPnl)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#091221]/80 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Average win rate</div>
            <div className="mt-2 text-3xl font-semibold text-slate-100">{headline.avgWinRate.toFixed(1)}%</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#091221]/80 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Average max drawdown</div>
            <div className="mt-2 text-3xl font-semibold text-rose-300">{formatMoney(-headline.avgDrawdown)}</div>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <PlaygroundCard
          title="Weekly equity curves"
          subtitle="Compare how the main strategy sleeves climb over the same weekly checkpoints."
        >
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyPerformance} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  {strategyComparison.map((slot) => (
                    <linearGradient key={slot.key} id={`grad-${slot.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={slot.fill} stopOpacity={0.32} />
                      <stop offset="95%" stopColor={slot.fill} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="week" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "#08101b", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }}
                  formatter={(value) => {
                    const numeric = typeof value === "number" ? value : Number(value ?? 0);
                    return [`$${numeric.toLocaleString()}`, "Balance"];
                  }}
                />
                {strategyComparison.map((slot) => (
                  <Area
                    key={slot.key}
                    type="monotone"
                    dataKey={slot.key}
                    stroke={slot.fill}
                    fill={`url(#grad-${slot.key})`}
                    strokeWidth={2}
                    name={slot.title}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </PlaygroundCard>

        <PlaygroundCard
          title="Return vs drawdown"
          subtitle="A quick risk map, bigger to the right is better, lower drawdown is better."
        >
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                <XAxis
                  type="number"
                  dataKey="pnl"
                  name="P&L"
                  stroke="#94a3b8"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${Math.round(value)}`}
                />
                <YAxis
                  type="number"
                  dataKey="drawdown"
                  name="Max drawdown"
                  stroke="#94a3b8"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${Math.round(value)}`}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "4 4" }}
                  contentStyle={{ background: "#08101b", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }}
                  formatter={(value, name) => {
                    const numeric = typeof value === "number" ? value : Number(value ?? 0);
                    return [formatMoney(name === "P&L" ? numeric : -numeric), String(name)];
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.title ?? "Strategy"}
                />
                <Scatter data={strategyComparison}>
                  {strategyComparison.map((slot) => (
                    <Cell key={slot.key} fill={slot.fill} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </PlaygroundCard>

        <PlaygroundCard
          title="Win rate by sleeve"
          subtitle="Early scorecard view for deciding which graphs are worth promoting into the main simulations surface."
        >
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={strategyComparison} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="title" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                <Tooltip
                  contentStyle={{ background: "#08101b", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }}
                  formatter={(value) => {
                    const numeric = typeof value === "number" ? value : Number(value ?? 0);
                    return [`${numeric}%`, "Win rate"];
                  }}
                />
                <Bar dataKey="winRate" radius={[10, 10, 4, 4]}>
                  {strategyComparison.map((slot) => (
                    <Cell key={slot.key} fill={slot.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PlaygroundCard>

        <PlaygroundCard
          title="What this workspace is for"
          subtitle="A flexible place to test visual ideas before they become part of the canonical dashboard."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                title: "Graph prototypes",
                body: "Try new equity, drawdown, exposure, and regime overlays without cluttering the main simulations page.",
              },
              {
                title: "Fast iteration",
                body: "Ship chart ideas here first, then graduate the winners into the locked-in public dashboard or private sim board.",
              },
              {
                title: "Cross-linking",
                body: "Bounce between Simulations, Regime, and this Playground so visual research stays connected instead of living in separate silos.",
              },
              {
                title: "Next step",
                body: "Wire these cards to the live simulation feed and add symbol, date-range, and strategy selectors once the graph layout feels right.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/simulations"
              className={cn(buttonVariants({ variant: "outline" }), "border-white/15 bg-transparent text-slate-100 hover:bg-white/5")}
            >
              Go to Simulations
            </Link>
            <Link to="/" className={cn(buttonVariants({ variant: "default" }), "bg-sky-500/20 text-sky-100 hover:bg-sky-500/30")}>
              Back Home
            </Link>
          </div>
        </PlaygroundCard>
      </div>
    </div>
  );
}
