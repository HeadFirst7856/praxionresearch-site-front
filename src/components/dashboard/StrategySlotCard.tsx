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
import { ChevronDown } from "lucide-react";
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

const TABLE_PAGE_SIZE = 10;

function formatDateLabel(dateString: string) {
  return formatTime(dateString);
}

export function StrategySlotCard({ slot, index }: { slot: StrategySlot; index: number }) {
  const [selectedRange, setSelectedRange] = useState<(typeof ranges)[number]["label"]>("30D");
  const [visibleTradeRows, setVisibleTradeRows] = useState(TABLE_PAGE_SIZE);
  const [highlightFromRow, setHighlightFromRow] = useState<number | null>(null);
  const modeTone =
    slot.mode === "LIVE" ? "text-emerald-300 border-emerald-400/40" : slot.mode === "SHADOW" ? "text-sky-300 border-sky-400/40" : "text-amber-300 border-amber-400/40";

  const sortedTrades = useMemo(
    () => [...slot.positions].sort((a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime()),
    [slot.positions],
  );

  const newestTrades = useMemo(
    () => [...slot.positions].sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()),
    [slot.positions],
  );
  const visibleTrades = newestTrades.slice(0, visibleTradeRows);
  const hasMoreTrades = visibleTradeRows < newestTrades.length;
  const remainingTrades = Math.max(newestTrades.length - visibleTradeRows, 0);

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
    <article className="min-w-0 overflow-hidden rounded-3xl border border-border bg-card p-5">
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

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.65fr_0.85fr]">
        <div className="min-w-0 rounded-2xl border border-white/10 bg-muted/70 p-4">
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
                tick={false}
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
        <div className="min-w-0 rounded-2xl border border-white/10 bg-muted/70 p-4">
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
        <ScrollArea className="max-w-full overflow-hidden whitespace-nowrap">
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Closed Positions</div>
            <div className="mt-1 text-xs text-muted-foreground">Newest trades first</div>
          </div>
          <div className="rounded-full border border-white/10 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
            Showing {Math.min(visibleTradeRows, newestTrades.length)} of {newestTrades.length}
          </div>
        </div>
        <ScrollArea className="max-w-full overflow-hidden whitespace-nowrap">
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
              {visibleTrades.map((row, rowIndex) => (
                <tr
                  key={`${slot.key}-${row.closedAt}-${rowIndex}`}
                  className={
                    highlightFromRow != null && rowIndex >= highlightFromRow
                      ? "animate-in fade-in slide-in-from-top-1 duration-300"
                      : undefined
                  }
                >
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
        {hasMoreTrades ? (
          <div className="mt-4 flex flex-col items-center gap-2 border-t border-white/10 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setHighlightFromRow(visibleTradeRows);
                setVisibleTradeRows((value) => value + TABLE_PAGE_SIZE);
              }}
              className="group h-10 gap-3 border-sky-400/30 bg-sky-400/10 px-5 text-sky-100 shadow-[0_10px_30px_rgba(56,189,248,0.18)] hover:border-sky-300/60 hover:bg-sky-400/20 hover:shadow-[0_12px_36px_rgba(56,189,248,0.28)]"
            >
              <ChevronDown className="h-4 w-4 group-hover:animate-bounce" />
              Load more
              <span className="rounded-full bg-sky-300/15 px-2.5 py-1 text-[11px] text-sky-100">
                +{Math.min(TABLE_PAGE_SIZE, remainingTrades)}
              </span>
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
