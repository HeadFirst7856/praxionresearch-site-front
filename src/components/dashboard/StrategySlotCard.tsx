import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { formatMoney, formatPercent, formatTime } from "@/lib/format";
import type { StrategySlot } from "@/mocks/dashboardMocks";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

const chartConfig = {
  cumulativePnl: {
    label: "Cumulative P&L",
    color: "#60a5fa",
  },
} satisfies ChartConfig;

const ranges = [
  { label: "7D", value: 7 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
  { label: "ALL", value: null },
] as const;

function formatDateLabel(dateString: string) {
  return new Date(dateString).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function StrategySlotCard({ slot, index }: { slot: StrategySlot; index: number }) {
  const [selectedRange, setSelectedRange] = useState<(typeof ranges)[number]["label"]>("30D");
  const modeTone =
    slot.mode === "LIVE" ? "text-emerald-300 border-emerald-400/40" : slot.mode === "SHADOW" ? "text-sky-300 border-sky-400/40" : "text-amber-300 border-amber-400/40";

  const sortedTrades = useMemo(
    () => [...slot.positions].sort((a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime()),
    [slot.positions],
  );

  const chartData = useMemo(() => {
    const latestTradeTime = sortedTrades.length
      ? new Date(sortedTrades[sortedTrades.length - 1].closedAt).getTime()
      : Date.now();
    const rangeConfig = ranges.find((item) => item.label === selectedRange);
    const cutoffTime =
      rangeConfig?.value == null ? null : latestTradeTime - rangeConfig.value * 24 * 60 * 60 * 1000;

    const visibleTrades =
      cutoffTime == null ? sortedTrades : sortedTrades.filter((trade) => new Date(trade.closedAt).getTime() >= cutoffTime);
    const effectiveTrades = visibleTrades.length ? visibleTrades : sortedTrades;
    const firstTime = effectiveTrades.length ? new Date(effectiveTrades[0].closedAt).getTime() : null;

    const baseline = slot.startBalance + sortedTrades
      .filter((trade) => (firstTime == null ? false : new Date(trade.closedAt).getTime() < firstTime))
      .reduce((sum, trade) => sum + trade.pnl, 0);

    let equity = baseline;
    return effectiveTrades.map((trade) => {
      equity += trade.pnl;
      return {
        date: trade.closedAt,
        dateLabel: formatDateLabel(trade.closedAt),
        equity,
        cumulativePnl: equity - baseline,
        tradePnl: trade.pnl,
      };
    });
  }, [selectedRange, slot.startBalance, sortedTrades]);

  return (
    <article className="rounded-3xl border border-border bg-card p-5">
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Badge variant="outline" className={modeTone}>
            {slot.mode}
          </Badge>
          <h3 className="mt-3 text-2xl font-semibold">{slot.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Independent 50K simulation track built from strategy logs and execution-aware replay.
          </p>
        </div>
        <Badge variant="outline">Slot {index + 1}</Badge>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Start Balance</div>
          <div className="mt-2 text-2xl font-semibold">{formatMoney(slot.startBalance)}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">End Balance</div>
          <div className="mt-2 text-2xl font-semibold">{formatMoney(slot.endBalance)}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Continuous P&L</div>
          <div className={`mt-2 text-2xl font-semibold ${slot.continuousPnl >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
            {formatMoney(slot.continuousPnl)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Trades</div>
          <div className="mt-2 text-2xl font-semibold">{slot.trades}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_0.85fr]">
        <div className="rounded-2xl border border-white/10 bg-muted/70 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Equity Curve (Closed Trades)</div>
            <div className="flex flex-wrap gap-2">
              {ranges.map((range) => (
                <Button
                  key={range.label}
                  size="sm"
                  variant={selectedRange === range.label ? "default" : "outline"}
                  onClick={() => setSelectedRange(range.label)}
                  className="h-7 rounded-full px-3"
                >
                  {range.label}
                </Button>
              ))}
            </div>
          </div>
          <ChartContainer
            config={chartConfig}
            className="h-64 w-full overflow-hidden rounded-xl border border-white/10 bg-linear-to-b from-slate-900/80 to-slate-950"
          >
            <LineChart accessibilityLayer data={chartData} margin={{ left: 8, right: 14, top: 12, bottom: 12 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="dateLabel"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={18}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { date?: string } | undefined;
                      return row?.date ? formatTime(row.date) : "Trade";
                    }}
                    formatter={(_, __, item) => {
                    const payload = item.payload as { equity: number; cumulativePnl: number; tradePnl: number };
                      return (
                        <div className="grid gap-1 text-xs">
                        <span className="font-mono tabular-nums">P&L (base 50K): {formatMoney(payload.cumulativePnl)}</span>
                        <span className="font-mono tabular-nums text-muted-foreground">Equity: {formatMoney(payload.equity)}</span>
                          <span className={`font-mono tabular-nums ${payload.tradePnl >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                            Trade P&L: {formatMoney(payload.tradePnl)}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Line
                dataKey="cumulativePnl"
                type="natural"
                stroke="var(--color-cumulativePnl)"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: "var(--color-cumulativePnl)", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        </div>
        <div className="rounded-2xl border border-white/10 bg-muted/70 p-4">
          <div className="mb-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">Status Table</div>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-1 text-muted-foreground">Contracts</td><td>{slot.contracts} MES</td></tr>
              <tr><td className="py-1 text-muted-foreground">Position</td><td>{slot.position}</td></tr>
              <tr><td className="py-1 text-muted-foreground">Closed P&L</td><td>{formatMoney(slot.closedPnl)}</td></tr>
              <tr><td className="py-1 text-muted-foreground">Open P&L</td><td>{formatMoney(slot.openPnl)}</td></tr>
              <tr><td className="py-1 text-muted-foreground">Win Rate</td><td>{formatPercent(slot.winRate)}</td></tr>
              <tr><td className="py-1 text-muted-foreground">Profit Factor</td><td>{slot.profitFactor.toFixed(2)}</td></tr>
              <tr><td className="py-1 text-muted-foreground">Max Drawdown</td><td>{formatMoney(slot.maxDrawdown)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-muted/70 p-4">
        <div className="mb-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">Weekly Equity Table</div>
        <ScrollArea className="w-full whitespace-nowrap">
          <table className="min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 pr-3">Week</th>
                <th className="pb-2 pr-3">Start</th>
                <th className="pb-2 pr-3">End</th>
                <th className="pb-2 pr-3">P&L</th>
              </tr>
            </thead>
            <tbody>
              {slot.weeklyRows.map((row) => (
                <tr key={row.week}>
                  <td className="py-1 pr-3">{row.week}</td>
                  <td className="py-1 pr-3">{formatMoney(row.startBalance)}</td>
                  <td className="py-1 pr-3">{formatMoney(row.endBalance)}</td>
                  <td className={`py-1 pr-3 ${row.pnl >= 0 ? "text-emerald-400" : "text-amber-400"}`}>{formatMoney(row.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-muted/70 p-4">
        <div className="mb-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">Closed Positions</div>
        <ScrollArea className="w-full whitespace-nowrap">
          <table className="min-w-[700px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 pr-3">Closed At</th>
                <th className="pb-2 pr-3">Side</th>
                <th className="pb-2 pr-3">Duration</th>
                <th className="pb-2 pr-3">Contract</th>
                <th className="pb-2 pr-3">Exit</th>
                <th className="pb-2 pr-3">P&L</th>
              </tr>
            </thead>
            <tbody>
              {slot.positions.map((row, rowIndex) => (
                <tr key={`${slot.key}-${rowIndex}`}>
                  <td className="py-1 pr-3">{formatTime(row.closedAt)}</td>
                  <td className="py-1 pr-3">{row.side}</td>
                  <td className="py-1 pr-3">{row.duration}</td>
                  <td className="py-1 pr-3">{row.contracts} MES</td>
                  <td className="py-1 pr-3">{row.exit}</td>
                  <td className={`py-1 pr-3 ${row.pnl >= 0 ? "text-emerald-400" : "text-amber-400"}`}>{formatMoney(row.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </article>
  );
}
