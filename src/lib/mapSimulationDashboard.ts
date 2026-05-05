import type { PositionRow, StrategyMode, StrategySlot, WeeklyRow } from "@/mocks/dashboardMocks";

export type DashboardOverviewData = {
  strategyName: string;
  strategySubtitle: string;
  accountBalance: number | null;
  accountStatus: string;
  totalSimPnl: number;
  barsProcessed?: number;
  closedTrades?: number;
  daysCovered?: string;
};

type ApiSlot = {
  key: string;
  title: string;
  mode?: string;
  contracts?: number;
  starting_balance?: number;
  ending_balance?: number;
  continuous_pnl?: number;
  closed_pnl?: number;
  open_pnl?: number;
  position?: string;
  metrics?: {
    trades?: number;
    win_rate?: number;
    profit_factor?: number;
    max_drawdown?: number;
  };
  weekly_rows?: Array<{
    week: string;
    start_balance: number;
    end_balance: number;
    pnl_dollars: number;
  }>;
  recent_trades?: Array<{
    strategy?: string;
    side?: string;
    entry_time?: string | null;
    exit_time?: string | null;
    exit_reason?: string | null;
    pnl_dollars?: number | null;
    size?: number;
    is_open?: boolean;
  }>;
};

type ApiDashboard = {
  summary?: {
    market?: { last_bar_time?: string | null; last_price?: number | null; regime?: string | null };
    totals?: {
      bars_processed?: number;
      closed_trades?: number;
      continuous_pnl_dollars?: number;
      days_covered?: number;
      covered_from?: string | null;
      covered_to?: string | null;
    };
    account?: { balance?: number | null; running_balance?: number | null; open_pnl?: number | null; position?: string | null };
  };
  slots?: Record<string, ApiSlot>;
};

const SLOT_ORDER = ["iq_trendshift", "fvg", "asia_meanrev", "opendrive", "inverted_orb", "orb"] as const;

function parseTime(value: string | null | undefined): number | null {
  if (!value || typeof value !== "string") {
    return null;
  }
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function formatDuration(entry: string | null | undefined, exit: string | null | undefined): string {
  const a = parseTime(entry);
  const b = parseTime(exit);
  if (a == null || b == null || b < a) {
    return "—";
  }
  const ms = b - a;
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function mapMode(raw: string | undefined): StrategyMode {
  const u = (raw || "SIMULATED").toUpperCase();
  if (u === "LIVE" || u === "SHADOW" || u === "SIMULATED") {
    return u;
  }
  return "SIMULATED";
}

function mapWeekly(rows: ApiSlot["weekly_rows"]): WeeklyRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((r) => ({
    week: r.week,
    startBalance: r.start_balance,
    endBalance: r.end_balance,
    pnl: r.pnl_dollars,
  }));
}

function mapPositions(recent: ApiSlot["recent_trades"]): PositionRow[] {
  if (!Array.isArray(recent)) {
    return [];
  }
  const closed = recent.filter((t) => !t.is_open && t.exit_time);
  return closed.map((t) => {
    const sideRaw = (t.side || "").toLowerCase();
    const side: "LONG" | "SHORT" = sideRaw === "long" ? "LONG" : "SHORT";
    return {
      closedAt: t.exit_time as string,
      side,
      duration: formatDuration(t.entry_time ?? null, t.exit_time ?? null),
      contracts: typeof t.size === "number" ? t.size : 0,
      exit: (t.exit_reason || "—").replace(/_/g, " "),
      pnl: typeof t.pnl_dollars === "number" ? t.pnl_dollars : 0,
    };
  });
}

function mapSlot(api: ApiSlot): StrategySlot {
  const m = api.metrics || {};
  return {
    key: api.key,
    title: api.title,
    mode: mapMode(api.mode),
    startBalance: api.starting_balance ?? 50_000,
    endBalance: api.ending_balance ?? 50_000,
    continuousPnl: api.continuous_pnl ?? 0,
    trades: typeof m.trades === "number" ? m.trades : 0,
    contracts: typeof api.contracts === "number" ? api.contracts : 0,
    position: api.position || "Flat",
    closedPnl: api.closed_pnl ?? 0,
    openPnl: api.open_pnl ?? 0,
    winRate: typeof m.win_rate === "number" ? m.win_rate : 0,
    profitFactor: typeof m.profit_factor === "number" ? m.profit_factor : 0,
    maxDrawdown: typeof m.max_drawdown === "number" ? m.max_drawdown : 0,
    weeklyRows: mapWeekly(api.weekly_rows),
    positions: mapPositions(api.recent_trades),
  };
}

export function mapSimulationDashboard(payload: unknown): {
  slots: StrategySlot[];
  overview: DashboardOverviewData;
} {
  const data = payload as ApiDashboard;
  const slotsRecord = data.slots && typeof data.slots === "object" ? data.slots : {};
  const slots: StrategySlot[] = [];
  for (const key of SLOT_ORDER) {
    const raw = slotsRecord[key];
    if (raw && typeof raw === "object") {
      slots.push(mapSlot(raw as ApiSlot));
    }
  }

  const s = data.summary || {};
  const market = s.market || {};
  const totals = s.totals || {};
  const account = s.account || {};
  const regime = market.regime ? ` · regime ${market.regime}` : "";
  const days =
    totals.covered_from && totals.covered_to
      ? `${totals.covered_from} → ${totals.covered_to}`
      : typeof totals.days_covered === "number"
        ? `${totals.days_covered} dia(s)`
        : "—";

  const overview: DashboardOverviewData = {
    strategyName: "Bar-core simulation (StrategySimulator)",
    strategySubtitle: `${market.last_bar_time || "—"}${regime} · ${days}`,
    accountBalance: account.balance ?? account.running_balance ?? null,
    accountStatus:
      account.balance != null || account.running_balance != null
        ? `Balance ${account.balance ?? "—"} · running ${account.running_balance ?? "—"} · open P&L ${account.open_pnl ?? "—"} · ${account.position ?? "—"}`
        : "Conta live não ligada a este modo (apenas simulação em bars persistidos).",
    totalSimPnl: typeof totals.continuous_pnl_dollars === "number" ? totals.continuous_pnl_dollars : 0,
    barsProcessed: totals.bars_processed,
    closedTrades: totals.closed_trades,
    daysCovered: days,
  };

  return { slots, overview };
}
