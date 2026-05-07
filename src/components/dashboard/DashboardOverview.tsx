import { formatMoney, formatPercent } from "@/lib/format";
import type { DashboardOverviewData } from "@/lib/mapSimulationDashboard";
import type { StrategySlot } from "@/mocks/dashboardMocks";

type Props = {
  overview: DashboardOverviewData;
  slots: StrategySlot[];
};

function pickBest(slots: StrategySlot[], selector: (slot: StrategySlot) => number): StrategySlot | null {
  if (slots.length === 0) return null;
  return slots.reduce((best, slot) => (selector(slot) > selector(best) ? slot : best), slots[0]);
}

function pickWorst(slots: StrategySlot[], selector: (slot: StrategySlot) => number): StrategySlot | null {
  if (slots.length === 0) return null;
  return slots.reduce((worst, slot) => (selector(slot) < selector(worst) ? slot : worst), slots[0]);
}

function SummaryCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "positive" | "warning" | "info";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "warning"
        ? "text-amber-400"
        : tone === "info"
          ? "text-sky-300"
          : "text-foreground";
  return (
    <div className="kpi-card">
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

export function DashboardOverview({ overview, slots }: Props) {
  const activeSlots = slots.filter((slot) => slot.trades > 0 || slot.positions.length > 0 || slot.continuousPnl !== 0);
  const totalTrades = activeSlots.reduce((sum, slot) => sum + slot.trades, 0);
  const best = pickBest(activeSlots, (slot) => slot.continuousPnl);
  const worst = pickWorst(activeSlots, (slot) => slot.continuousPnl);
  const mostTrades = pickBest(activeSlots, (slot) => slot.trades);
  const bestWinRate = pickBest(activeSlots.filter((slot) => slot.trades > 0), (slot) => slot.winRate);
  const maxDrawdown = pickBest(activeSlots, (slot) => slot.maxDrawdown);

  return (
    <section id="overview" className="overflow-hidden rounded-3xl border border-border bg-[#080d18f0]">
      <div className="border-b border-border px-5 py-5">
        <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard
          label="Aggregate P&L"
          value={formatMoney(overview.totalSimPnl)}
          detail={`${overview.barsProcessed != null ? `${overview.barsProcessed.toLocaleString("en-US")} bars · ` : ""}${totalTrades} trades`}
          tone={overview.totalSimPnl >= 0 ? "info" : "warning"}
        />
        <SummaryCard
          label="Best strategy"
          value={best?.title ?? "—"}
          detail={best ? `${formatMoney(best.continuousPnl)} · ${best.trades} trades` : "No data"}
          tone="positive"
        />
        <SummaryCard
          label="Worst strategy"
          value={worst?.title ?? "—"}
          detail={worst ? `${formatMoney(worst.continuousPnl)} · ${worst.trades} trades` : "No data"}
          tone={(worst?.continuousPnl ?? 0) < 0 ? "warning" : "default"}
        />
        <SummaryCard
          label="Most trades"
          value={mostTrades?.title ?? "—"}
          detail={mostTrades ? `${mostTrades.trades} trades · ${formatMoney(mostTrades.continuousPnl)}` : "No data"}
          tone="info"
        />
        <SummaryCard
          label="Highest win rate"
          value={bestWinRate?.title ?? "—"}
          detail={bestWinRate ? `${formatPercent(bestWinRate.winRate)} · PF ${bestWinRate.profitFactor.toFixed(2)}` : "No data"}
          tone="positive"
        />
        <SummaryCard
          label="Largest drawdown"
          value={maxDrawdown?.title ?? "—"}
          detail={maxDrawdown ? `${formatMoney(maxDrawdown.maxDrawdown)} max DD` : "No data"}
          tone="warning"
        />
      </div>
    </section>
  );
}
