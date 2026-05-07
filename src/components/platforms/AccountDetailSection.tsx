import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { OverviewAccount } from "@/api/me";
import { deletePlatform, fetchAccountPositions, type AccountPositionsPayload } from "@/api/platforms";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

const PAGE_SIZE = 12;
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

/** Trade.side from TopstepX: labels match platform UI (0 ↔ sell, 1 ↔ buy on fills). */
function sideLabel(side: number | null | undefined): string {
  if (side === 0) return "Sell";
  if (side === 1) return "Buy";
  if (side == null) return "—";
  return String(side);
}

function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function formatRatio(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(2);
}

function inferStartingBalanceFromName(accountName: string): number | null {
  const m = accountName.match(/(\d+)\s*K(?:TC)?/i);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v * 1000;
}

function asNumericId(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return 0;
}

function toneByValue(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "text-slate-200";
  if (v > 0) return "text-emerald-300";
  if (v < 0) return "text-rose-300";
  return "text-slate-200";
}

/** UTC ISO → mm/dd/yyyy hh:mm in America/New_York (24h). */
function formatTradeTimeNy(iso: string | null | undefined, withSeconds = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return withSeconds
    ? `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`
    : `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

function displaySymbol(row: { symbol?: string | null; contract_id?: string | null }): string {
  return row.symbol?.trim() || row.contract_id?.trim() || "—";
}

/** Hold span as hh:mm:ss from duration_minutes (backend FIFO). */
function formatDurationHms(row: { duration_minutes?: number | null }): string {
  const n = row.duration_minutes;
  if (n == null || Number.isNaN(n) || n < 0) return "—";
  let totalSeconds = Math.round(n * 60);
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function typeBadge(t: string) {
  const c =
    t === "funded"
      ? "border-amber-400/40 text-amber-200"
      : t === "combine"
        ? "border-sky-400/40 text-sky-100"
        : t === "practice"
          ? "border-emerald-400/35 text-emerald-100"
          : t === "express"
            ? "border-violet-400/40 text-violet-100"
            : "border-white/15 text-slate-300";
  return (
    <Badge variant="outline" className={`rounded-sm text-[10px] uppercase tracking-wider ${c}`}>
      {t}
    </Badge>
  );
}

export type AccountDetailSectionProps = {
  platformId: number;
  account: OverviewAccount;
  onPositionsUpdated: (platformId: number, accountId: number, payload: AccountPositionsPayload) => void;
  onDismiss: () => void;
  onPlatformRemoved: (platformId: number) => Promise<void> | void;
};

export function AccountDetailSection({
  platformId,
  account,
  onPositionsUpdated,
  onDismiss,
  onPlatformRemoved,
}: AccountDetailSectionProps) {
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selectedRange, setSelectedRange] = useState<(typeof ranges)[number]["label"]>("30D");
  const inferredStartBalance = useMemo(() => inferStartingBalanceFromName(account.name), [account.name]);

  const trades = useMemo(() => account.closed_trades_90d ?? [], [account.closed_trades_90d]);
  const ascendingTrades = useMemo(
    () =>
      [...trades].sort((a, b) => {
        const tsCmp = new Date(String(a.creation_timestamp ?? 0)).getTime() - new Date(String(b.creation_timestamp ?? 0)).getTime();
        if (tsCmp !== 0) return tsCmp;
        const orderCmp = asNumericId(a.order_id) - asNumericId(b.order_id);
        if (orderCmp !== 0) return orderCmp;
        return asNumericId(a.id) - asNumericId(b.id);
      }),
    [trades],
  );

  const sortedTrades = useMemo(
    () =>
      [...trades].sort((a, b) => {
        const tsCmp = String(b.creation_timestamp ?? "").localeCompare(String(a.creation_timestamp ?? ""));
        if (tsCmp !== 0) return tsCmp;
        const orderCmp = asNumericId(b.order_id) - asNumericId(a.order_id);
        if (orderCmp !== 0) return orderCmp;
        return asNumericId(b.id) - asNumericId(a.id);
      }),
    [trades],
  );
  const pageCount = Math.max(1, Math.ceil(sortedTrades.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = sortedTrades.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const chartData = useMemo(() => {
    const latestTradeTime = ascendingTrades.length
      ? new Date(String(ascendingTrades[ascendingTrades.length - 1].creation_timestamp ?? "")).getTime()
      : 0;
    const rangeConfig = ranges.find((item) => item.label === selectedRange);
    const cutoffTime = rangeConfig?.value == null ? null : latestTradeTime - rangeConfig.value * 24 * 60 * 60 * 1000;

    const inRange =
      cutoffTime == null
        ? ascendingTrades
        : ascendingTrades.filter((trade) => new Date(String(trade.creation_timestamp ?? "")).getTime() >= cutoffTime);
    const effectiveTrades = inRange.length ? inRange : ascendingTrades;
    const firstTime = effectiveTrades.length
      ? new Date(String(effectiveTrades[0].creation_timestamp ?? "")).getTime()
      : null;

    const net = (t: (typeof ascendingTrades)[number]) => {
      const pnl = typeof t.pnl === "number" ? t.pnl : 0;
      const fees = typeof t.fees === "number" ? t.fees : 0;
      const commissions = typeof t.commissions === "number" ? t.commissions : 0;
      return pnl - fees - commissions;
    };

    const baseline = inferredStartBalance ?? 0;
    const carriedBeforeWindow = ascendingTrades
      .filter((trade) => (firstTime == null ? false : new Date(String(trade.creation_timestamp ?? "")).getTime() < firstTime))
      .reduce((sum, trade) => sum + net(trade), 0);

    const reduced = effectiveTrades.reduce(
      (acc, trade) => {
        const grossTradePnl = typeof trade.pnl === "number" ? trade.pnl : 0;
        const tradePnlFee = net(trade);
        const nextEquity = acc.equity + tradePnlFee;
        acc.rows.push({
          pointId: `${trade.creation_timestamp ?? "na"}-${trade.order_id ?? "na"}-${trade.id ?? "na"}-${acc.rows.length}`,
          date: trade.creation_timestamp ?? "",
          dateLabel: formatTradeTimeNy(trade.creation_timestamp, true),
          equity: nextEquity,
          cumulativePnl: nextEquity - baseline,
          tradePnl: grossTradePnl,
          tradePnlFee,
        });
        return { equity: nextEquity, rows: acc.rows };
      },
      {
        equity: baseline + carriedBeforeWindow,
        rows: [] as Array<{
          pointId: string;
          date: string;
          dateLabel: string;
          equity: number;
          cumulativePnl: number;
          tradePnl: number;
          tradePnlFee: number;
        }>,
      },
    );
    return reduced.rows;
  }, [ascendingTrades, selectedRange, inferredStartBalance]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchAccountPositions(platformId, account.id, 90, true);
      onPositionsUpdated(platformId, account.id, data);
      toast.success("Account data refreshed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [account.id, onPositionsUpdated, platformId]);

  const onDelete = useCallback(async () => {
    setRemoving(true);
    try {
      await deletePlatform(platformId);
      await onPlatformRemoved(platformId);
      toast.success("Platform removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove platform");
    } finally {
      setRemoving(false);
    }
  }, [onPlatformRemoved, platformId]);

  return (
    <div className="rounded-lg border border-sky-500/20 bg-[#070d18]/90">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 px-4 py-4 sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight text-sky-50">{account.name}</h3>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-rose-300/85 hover:bg-rose-500/15 hover:text-rose-200"
                  disabled={removing}
                  aria-label="Remove platform"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure you want to remove this platform?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action will remove the platform connection from your account and hide all data in this panel.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void onDelete()} disabled={removing}>
                    {removing ? "Removing..." : "Confirm"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span>Balance {formatMoney(account.balance)}</span>
            {typeBadge(account.inferred_type)}
            {account.fetch_error ? (
              <span className="text-amber-300/90">Partial data: {account.fetch_error}</span>
            ) : null}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button
            type="button"
            className="rounded-md bg-sky-500/25 text-sky-50 hover:bg-sky-500/35"
            disabled={refreshing}
            onClick={() => void onRefresh()}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button type="button" variant="outline" className="border-white/15" onClick={onDismiss}>
            Close
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <section className="rounded-xl border border-sky-400/20 bg-linear-to-b from-sky-500/8 to-transparent p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <h4 className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-sky-200/80">Performance Summary</h4>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-950/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-emerald-200/75">P&L Net Day</div>
              <div className={`mt-1 text-xl font-semibold ${toneByValue(account.pnl_day_net)}`}>{formatMoney(account.pnl_day_net)}</div>
            </div>
            <div className="rounded-lg border border-sky-400/25 bg-sky-950/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-sky-200/75">P&L Net Week</div>
              <div className={`mt-1 text-xl font-semibold ${toneByValue(account.pnl_week_net)}`}>{formatMoney(account.pnl_week_net)}</div>
            </div>
            <div className="rounded-lg border border-violet-400/25 bg-violet-950/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-violet-200/75">P&L Net Month</div>
              <div className={`mt-1 text-xl font-semibold ${toneByValue(account.pnl_month_net)}`}>{formatMoney(account.pnl_month_net)}</div>
            </div>

            <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Win Rate</div>
              <div className="mt-1 text-xl font-semibold text-slate-100">{formatPct(account.win_rate)}</div>
            </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Payoff Ratio / Profit Factor</div>
              <div className="mt-1 text-xl font-semibold text-slate-100">
                {formatRatio(account.payoff_ratio)} <span className="text-slate-500">/</span> {formatRatio(account.profit_factor)}
              </div>
            </div>
            <div className="rounded-lg border border-amber-400/25 bg-amber-950/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-amber-200/75">Operational Cost</div>
              <div className="mt-1 text-xl font-semibold text-amber-100">{formatMoney(account.operational_cost?.total)}</div>
              <div className="mt-1 text-[11px] text-amber-200/70">
                Fees {formatMoney(account.operational_cost?.fees_total)} + Comm {formatMoney(account.operational_cost?.commissions_total)}
              </div>
            </div>

            <div className="rounded-lg border border-rose-400/25 bg-rose-950/20 p-3 sm:col-span-2">
              <div className="text-[10px] uppercase tracking-wider text-rose-200/75">Intrinsic Risk</div>
              <div className="mt-1 grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-rose-200/70">Max Loss:</span>{" "}
                  <span className={`font-semibold ${toneByValue(account.intrinsic_risk?.max_loss)}`}>{formatMoney(account.intrinsic_risk?.max_loss)}</span>
                </div>
                <div>
                  <span className="text-rose-200/70">Max Gain:</span>{" "}
                  <span className={`font-semibold ${toneByValue(account.intrinsic_risk?.max_gain)}`}>{formatMoney(account.intrinsic_risk?.max_gain)}</span>
                </div>
                <div>
                  <span className="text-rose-200/70">Max Losing Streak:</span>{" "}
                  <span className="font-semibold text-rose-100">{account.intrinsic_risk?.max_consecutive_losses ?? "—"}</span>
                </div>
              </div>
            </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/8 bg-slate-950/45 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Equity Curve (Closed Trades)</h4>
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
            <LineChart data={chartData} margin={{ left: 8, right: 14, top: 12, bottom: 12 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="pointId" tickLine={false} axisLine={false} tick={false} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { date?: string } | undefined;
                      return row?.date ? formatTradeTimeNy(row.date, true) : "Trade";
                    }}
                    formatter={(_, __, item) => {
                      const payload = item.payload as {
                        equity: number;
                        cumulativePnl: number;
                        tradePnl: number;
                        tradePnlFee: number;
                      };
                      return (
                        <div className="grid gap-1 text-xs">
                          <span className="font-mono tabular-nums">Cumulative P&L: {formatMoney(payload.cumulativePnl)}</span>
                          <span className="font-mono tabular-nums text-muted-foreground">Equity: {formatMoney(payload.equity)}</span>
                          <span className={`font-mono tabular-nums ${payload.tradePnl >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                            Trade P&L: {formatMoney(payload.tradePnl)}
                          </span>
                          <span className={`font-mono tabular-nums ${payload.tradePnlFee >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                            P&L Fee: {formatMoney(payload.tradePnlFee)}
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
        </section>

        <section className="min-h-0">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Trades — last 90 days</h4>
          <ScrollArea className="h-[min(48vh,420px)] rounded-md border border-white/5">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-950/95 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-2 font-medium">Time</th>
                  <th className="p-2 font-medium">Symbol</th>
                  <th className="p-2 font-medium">Duration</th>
                  <th className="p-2 font-medium">Side</th>
                  <th className="p-2 font-medium">Sz</th>
                  <th className="p-2 font-medium">Price</th>
                  <th className="p-2 font-medium">P&amp;L</th>
                  <th className="p-2 font-medium">Fees</th>
                </tr>
              </thead>
              <tbody>
                {slice.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-500">
                      No trades in the last 90 days
                    </td>
                  </tr>
                ) : (
                  slice.map((row, i) => (
                    <tr
                      key={`${row.id ?? "na"}-${row.order_id ?? "na"}-${row.creation_timestamp ?? "na"}-${i}`}
                      className="border-t border-white/5"
                    >
                      <td className="p-2 text-[11px] text-slate-400">{formatTradeTimeNy(row.creation_timestamp)}</td>
                      <td className="p-2 font-mono text-[11px] text-slate-200">{displaySymbol(row)}</td>
                      <td className="p-2 font-mono text-slate-400">{formatDurationHms(row)}</td>
                      <td className="p-2 text-slate-300">{sideLabel(row.side ?? undefined)}</td>
                      <td className="p-2 text-slate-300">{row.size ?? "—"}</td>
                      <td className="p-2 text-slate-300">{formatMoney(row.price ?? null)}</td>
                      <td className={`p-2 ${(row.pnl ?? 0) >= 0 ? "text-emerald-300/90" : "text-rose-300/90"}`}>
                        {formatMoney(row.pnl ?? null)}
                      </td>
                      <td className="p-2 text-slate-400">{formatMoney(row.fees ?? null)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollArea>
          {sortedTrades.length > PAGE_SIZE ? (
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page {safePage + 1} / {pageCount} • Showing {slice.length} of {sortedTrades.length}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-white/10"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-white/10"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        {(account.open_positions?.length ?? 0) > 0 ? (
          <section>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Open positions</h4>
            <ScrollArea className="h-[min(36vh,280px)] rounded-md border border-white/5">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-950/95 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="p-2 font-medium">Symbol</th>
                    <th className="p-2 font-medium">Size</th>
                    <th className="p-2 font-medium">Type</th>
                    <th className="p-2 font-medium">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {account.open_positions.map((row, i) => (
                    <tr key={row.id ?? `${row.contract_id}-${i}`} className="border-t border-white/5">
                      <td className="p-2 font-mono text-[11px] text-slate-200">{displaySymbol(row)}</td>
                      <td className="p-2 text-slate-300">{row.size ?? "—"}</td>
                      <td className="p-2 text-slate-400">{row.type ?? "—"}</td>
                      <td className="p-2 text-slate-300">{formatMoney(row.average_price ?? null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </section>
        ) : null}
      </div>
    </div>
  );
}
