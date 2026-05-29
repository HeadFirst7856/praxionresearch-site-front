import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney, formatPercent, formatTime } from "@/lib/format";
import type { PositionRow, StrategySlot } from "@/mocks/dashboardMocks";
import { ChevronDown } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import { cn } from "@/lib/utils";

const chartConfig = {
  cumulativePnl: {
    label: "P&L",
    color: "#60a5fa",
  },
} satisfies ChartConfig;

const TABLE_PAGE_SIZE = 10;

type StrategySlotCardProps = {
  slot: StrategySlot;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  contractInput?: string;
  onContractInputChange?: (value: string) => void;
};

function parseTimeMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatDurationMs(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function durationForRow(row: PositionRow, nowMs: number): string {
  const entryMs = parseTimeMs(row.entryTime);
  const exitMs = parseTimeMs(row.exitTime);
  const endMs = exitMs ?? (row.isOpen ? nowMs : null);
  if (entryMs == null || endMs == null || endMs < entryMs) {
    return row.duration || "—";
  }
  return formatDurationMs(endMs - entryMs);
}

function DurationCell({ row, nowMs }: { row: PositionRow; nowMs: number }) {
  const [open, setOpen] = useState(false);
  const duration = durationForRow(row, nowMs);
  const exitLabel = row.exitTime ? formatTime(row.exitTime) : row.isOpen ? "-" : "n/a";

  return (
    <Tooltip disableHoverablePopup open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        type="button"
        delay={100}
        closeDelay={80}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="cursor-help border-b border-dotted border-muted-foreground/50 font-mono tabular-nums underline-offset-4"
      >
        {duration}
      </TooltipTrigger>
      <TooltipContent side="top" align="start" sideOffset={8} className="grid w-64 gap-2">
        <div className="font-medium text-foreground">Trade timing</div>
        <div className="grid gap-1">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Entry Time</span>
            <span className="font-mono tabular-nums text-right">{formatTime(row.entryTime)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Exit Time</span>
            <span className="font-mono tabular-nums text-right">{exitLabel}</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function ContractSizeInput({
  value,
  instrument,
  disabled = false,
  onChange,
  className,
}: {
  value: string;
  instrument: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("flex w-full max-w-[190px] items-stretch text-sm", className)}>
      <span className="sr-only">Contracts</span>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-9 rounded-r-none border-r-0 bg-background/70 text-right font-mono tabular-nums disabled:opacity-70"
      />
      <span className="flex h-9 min-w-14 items-center justify-center rounded-r-md border border-input bg-muted px-3 text-xs font-semibold text-muted-foreground">
        {instrument}
      </span>
    </label>
  );
}

function StrategySlotSummary({
  slot,
  index,
  expanded,
  onToggle,
  contractInput = "1",
  onContractInputChange,
}: StrategySlotCardProps) {
  const modeTone =
    slot.mode === "LIVE"
      ? "text-emerald-300 border-emerald-400/40"
      : slot.mode === "SHADOW"
        ? "text-sky-300 border-sky-400/40"
        : "text-amber-300 border-amber-400/40";
  const contractLocked =
    slot.key === "orb-martingale-1" || slot.key === "orb-martingale-2" || slot.key === "orb-martingale-3";

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <Badge variant="outline" className={modeTone}>
            {slot.mode}
          </Badge>
          <div className="mt-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              className="min-w-0 cursor-pointer text-left"
              onClick={onToggle}
              aria-expanded={expanded}
            >
              <h3 className="truncate text-2xl font-semibold">{slot.title}</h3>
            </button>
            <ContractSizeInput
              value={contractLocked ? String(slot.contracts || 1) : contractInput}
              instrument={slot.instrument}
              disabled={contractLocked}
              onChange={contractLocked ? undefined : onContractInputChange}
              className="sm:w-[170px]"
            />
          </div>
          {slot.description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{slot.description}</p> : null}
          <button type="button" className="mt-2 cursor-pointer text-left" onClick={onToggle} aria-expanded={expanded}>
            <p className="text-sm text-muted-foreground">
              Independent 50K simulation track · click to {expanded ? "collapse" : "expand"} details
            </p>
          </button>
        </div>
        <button
          type="button"
          className="flex cursor-pointer items-start gap-2 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <Badge variant="outline">Slot {index + 1}</Badge>
          <ChevronDown
            className={cn("mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      <button
        type="button"
        className="mt-4 grid w-full cursor-pointer gap-3 text-left sm:grid-cols-2 xl:grid-cols-4"
        onClick={onToggle}
        aria-expanded={expanded}
      >
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
          <div
            className={`mt-2 text-2xl font-semibold ${slot.continuousPnl >= 0 ? "text-emerald-400" : "text-amber-400"}`}
          >
            {formatMoney(slot.continuousPnl)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Trades</div>
          <div className="mt-2 text-2xl font-semibold">{slot.trades}</div>
        </div>
      </button>
    </div>
  );
}

function StrategySlotDetails({ slot }: { slot: StrategySlot }) {
  const [visibleTradeRows, setVisibleTradeRows] = useState(TABLE_PAGE_SIZE);
  const [highlightFromRow, setHighlightFromRow] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const newestTrades = useMemo(
    () => [...slot.positions].sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()),
    [slot.positions],
  );
  const visibleTrades = newestTrades.slice(0, visibleTradeRows);
  const hasMoreTrades = visibleTradeRows < newestTrades.length;
  const remainingTrades = Math.max(newestTrades.length - visibleTradeRows, 0);

  const chartData = useMemo(() => {
    if (slot.equityCurve.length > 0) {
      const baseline = slot.equityCurve[0]?.equity ?? slot.startBalance;
      return slot.equityCurve.map((point) => ({
        date: point.t,
        dateLabel: point.t ? formatTime(point.t) : "—",
        equity: point.equity,
        cumulativePnl: point.equity - baseline,
      }));
    }
    let equity = slot.startBalance;
    const sorted = [...slot.positions].sort(
      (a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime(),
    );
    return sorted.map((trade) => {
      equity += trade.pnl;
      return {
        date: trade.closedAt,
        dateLabel: formatTime(trade.closedAt),
        equity,
        cumulativePnl: equity - slot.startBalance,
      };
    });
  }, [slot.equityCurve, slot.positions, slot.startBalance]);

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.65fr_0.85fr]">
        <div className="min-w-0 rounded-2xl border border-white/10 bg-muted/70 p-4">
          <div className="mb-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">P&L Curve</div>
          <ChartContainer
            config={chartConfig}
            className="h-64 w-full overflow-hidden rounded-xl border border-white/10 bg-linear-to-b from-slate-900/80 to-slate-950"
          >
            <LineChart accessibilityLayer data={chartData} margin={{ left: 8, right: 14, top: 12, bottom: 12 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} tick={false} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { date?: string | null } | undefined;
                      return row?.date ? formatTime(row.date) : "Point";
                    }}
                    formatter={(_, __, item) => {
                      const payload = item.payload as { equity: number; cumulativePnl: number };
                      return (
                        <div className="grid gap-1 text-xs">
                          <span className="font-mono tabular-nums">P&L vs start: {formatMoney(payload.cumulativePnl)}</span>
                          <span className="font-mono tabular-nums text-muted-foreground">
                            Equity: {formatMoney(payload.equity)}
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
              <tr>
                <td className="py-1 text-muted-foreground">Contracts</td>
                <td>
                  {slot.contracts} {slot.instrument}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-muted-foreground">Position</td>
                <td>{slot.position}</td>
              </tr>
              <tr>
                <td className="py-1 text-muted-foreground">Closed P&L</td>
                <td>{formatMoney(slot.closedPnl)}</td>
              </tr>
              <tr>
                <td className="py-1 text-muted-foreground">Open P&L</td>
                <td>{formatMoney(slot.openPnl)}</td>
              </tr>
              <tr>
                <td className="py-1 text-muted-foreground">Win Rate</td>
                <td>{formatPercent(slot.winRate)}</td>
              </tr>
              <tr>
                <td className="py-1 text-muted-foreground">Profit Factor</td>
                <td>{slot.profitFactor.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-1 text-muted-foreground">Max Drawdown</td>
                <td>{formatMoney(slot.maxDrawdown)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-muted/70 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Positions</div>
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
                <th className="pb-2 pr-3">Time</th>
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
                  <td className="py-1 pr-3">
                    <DurationCell row={row} nowMs={nowMs} />
                  </td>
                  <td className="py-1 pr-3">
                    {row.contracts} {slot.instrument}
                  </td>
                  <td className={`py-1 pr-3 ${row.isOpen ? "text-sky-300" : ""}`}>{row.exit}</td>
                  <td className={`py-1 pr-3 ${row.pnl >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                    {formatMoney(row.pnl)}
                  </td>
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
    </div>
  );
}

export function StrategySlotCard({
  slot,
  index,
  expanded,
  onToggle,
  contractInput = "1",
  onContractInputChange,
}: StrategySlotCardProps) {
  return (
    <article className="min-w-0 overflow-hidden rounded-3xl border border-border bg-card p-5">
      <StrategySlotSummary
        slot={slot}
        index={index}
        expanded={expanded}
        onToggle={onToggle}
        contractInput={contractInput}
        onContractInputChange={onContractInputChange}
      />
      {expanded ? <StrategySlotDetails slot={slot} /> : null}
    </article>
  );
}
