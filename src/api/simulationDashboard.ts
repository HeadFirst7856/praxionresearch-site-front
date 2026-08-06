import { apiFetch } from "@/lib/api";

export type SimulationDateRangeParams = {
  from?: string;
  to?: string;
};

export async function fetchSimulationDashboard(params?: SimulationDateRangeParams): Promise<unknown> {
  const search = new URLSearchParams();
  if (params?.from) {
    search.set("from", params.from);
  }
  if (params?.to) {
    search.set("to", params.to);
  }
  const qs = search.toString();
  const path = qs ? `/api/v1/simulation/dashboard?${qs}` : "/api/v1/simulation/dashboard";

  try {
    const res = await apiFetch(path);
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return await res.json();
  } catch {
    // Static-site fallback: the site ships daily-generated dashboard artifacts at
    // /data/dashboard-data.json, so the dashboard renders with zero backend.
    // The static artifact is full-window, so apply the date range CLIENT-SIDE
    // (daily rows carry per-day trades/wins/losses -> exact window recompute).
    const staticRes = await fetch("/data/dashboard-data.json", { cache: "no-store" });
    if (!staticRes.ok) {
      throw new Error(`${staticRes.status} ${staticRes.statusText}: dashboard data unavailable`);
    }
    const payload = await staticRes.json();
    return params?.from || params?.to ? filterDashboardPayload(payload, params) : payload;
  }
}

/**
 * Client-side date-window filter for the static dashboard artifact.
 * Recomputes per-slot metrics exactly from full-history daily_rows
 * (period, start/end_balance, pnl_dollars, closed_trades, wins, losses,
 * gross_profit, gross_loss) and re-aggregates summary totals.
 */
function filterDashboardPayload(payload: Record<string, unknown>, params: SimulationDateRangeParams): unknown {
  const fromTs = params.from ? Date.parse(`${params.from}T00:00:00`) : Number.NEGATIVE_INFINITY;
  const toTs = params.to ? Date.parse(`${params.to}T23:59:59.999`) : Number.POSITIVE_INFINITY;
  const inRange = (period?: string | null): boolean => {
    if (!period) return false;
    const t = Date.parse(period);
    return Number.isFinite(t) && t >= fromTs && t <= toTs;
  };

  const data = payload as Record<string, any>;
  const slotsIn = (data.slots && typeof data.slots === "object" ? data.slots : {}) as Record<string, any>;
  const slots: Record<string, any> = {};
  let sumPnl = 0;
  let sumTrades = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const [key, slot] of Object.entries(slotsIn)) {
    if (!slot || typeof slot !== "object") continue;
    const days = Array.isArray(slot.daily_rows) ? (slot.daily_rows as any[]).filter((r) => inRange(r?.period)) : [];
    let closedTrades = 0;
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let pnl = 0;
    let running: number | null = null;
    let peak: number | null = null;
    let maxDd = 0;
    let endBalance = slot.starting_balance ?? 50_000;
    for (const r of days) {
      closedTrades += Number(r.closed_trades) || 0;
      wins += Number(r.wins) || 0;
      losses += Number(r.losses) || 0;
      grossProfit += Number(r.gross_profit) || 0;
      grossLoss += Math.abs(Number(r.gross_loss)) || 0;
      pnl += Number(r.pnl_dollars) || 0;
      const start = Number.isFinite(Number(r.start_balance)) ? Number(r.start_balance) : running ?? endBalance;
      running = Number.isFinite(Number(r.end_balance)) ? Number(r.end_balance) : running;
      endBalance = running ?? endBalance;
      peak = peak == null ? start : Math.max(peak, start, running ?? start);
      const trough = Math.min(start, running ?? start);
      if (peak != null && trough < peak) maxDd = Math.max(maxDd, peak - trough);
      if (r.period) {
        if (!minDate || r.period < minDate) minDate = r.period;
        if (!maxDate || r.period > maxDate) maxDate = r.period;
      }
    }
    if (days.length) endBalance = days[days.length - 1].end_balance ?? endBalance;

    const trades = (slot.all_trades as any[]) || [];
    const allTrades = Array.isArray(trades) ? trades.filter((t) => inRange(t?.exit_time || t?.entry_time)) : [];
    const curve = Array.isArray(slot.equity_curve)
      ? (slot.equity_curve as any[]).filter((p) => inRange(p?.t))
      : [];

    slots[key] = {
      ...slot,
      continuous_pnl: Math.round(pnl * 100) / 100,
      closed_pnl: Math.round(pnl * 100) / 100,
      open_pnl: 0,
      ending_balance: Math.round(endBalance * 100) / 100,
      metrics: {
        trades: closedTrades,
        open_trades: 0,
        win_rate: closedTrades ? wins / (wins + losses) : 0,
        profit_factor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0,
        max_drawdown: Math.round(maxDd * 100) / 100,
      },
      daily_rows: days,
      equity_curve: curve,
      all_trades: allTrades,
      recent_trades: allTrades.slice(-10),
      trades_truncated: false,
      trades_total: closedTrades,
    };
    sumPnl += pnl;
    sumTrades += closedTrades;
  }

  const totals = { ...((data.summary as any)?.totals || {}) };
  totals.continuous_pnl_dollars = Math.round(sumPnl * 100) / 100;
  totals.closed_pnl_dollars = Math.round(sumPnl * 100) / 100;
  totals.closed_trades = sumTrades;
  totals.days_covered = minDate && maxDate ? Math.round((Date.parse(maxDate) - Date.parse(minDate)) / 86_400_000) + 1 : totals.days_covered;
  if (minDate) totals.covered_from = minDate;
  if (maxDate) totals.covered_to = maxDate;
  if (typeof totals.return_on_50k === "number") {
    totals.return_on_50k = Math.round((sumPnl / 50_000) * 10_000) / 10_000;
  }

  return {
    ...data,
    date_filter: {
      from: params.from ?? null,
      to: params.to ?? null,
      default_applied: true,
    },
    summary: {
      ...(data.summary || {}),
      totals,
    },
    slots,
  };
}
