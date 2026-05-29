import type {
  DailyRow,
  EquityPoint,
  PositionRow,
  SimulationDateFilterMeta,
  StrategyMode,
  StrategySlot,
  WeeklyRow,
} from "@/mocks/dashboardMocks";
import { formatDate, formatTime } from "@/lib/format";

export type DashboardOverviewData = {
  strategyName: string;
  strategySubtitle: string;
  accountBalance: number | null;
  accountStatus: string;
  totalSimPnl: number;
  barsProcessed?: number;
  closedTrades?: number;
  daysCovered?: string;
  tradeDateRange?: string;
};

type PeriodRowApi = {
  week?: string;
  day?: string;
  period?: string;
  start_balance: number;
  end_balance: number;
  pnl_dollars: number;
  max_drawdown?: number;
};

type ApiSlot = {
  key: string;
  title: string;
  mode?: string;
  description?: string | null;
  contracts?: number;
  instrument?: string;
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
  weekly_rows?: PeriodRowApi[];
  daily_rows?: PeriodRowApi[];
  equity_curve?: Array<{ t: string | null; equity: number }>;
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
  all_trades?: ApiSlot["recent_trades"];
};

type ApiDashboard = {
  date_filter?: {
    from?: string;
    to?: string;
    default_applied?: boolean;
  };
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

const SLOT_ORDER = [
  "orb",
  "orb-martingale-1",
  "orb-martingale-2",
  "orb-martingale-3",
  "iq_trendshift",
  "fvg",
  "asia_meanrev",
  "opendrive",
] as const;

const MARTINGALE_SLOT_KEYS = new Set(["orb-martingale-1", "orb-martingale-2", "orb-martingale-3"]);
const MNQ_SLOT_KEYS = new Set(["orb", ...MARTINGALE_SLOT_KEYS]);

export function sanitizeContractInput(value: string): string {
  return value.replace(/\D/g, "");
}

export function effectiveContracts(value: string | number | null | undefined): number {
  const raw = typeof value === "number" ? String(value) : String(value ?? "");
  const digits = sanitizeContractInput(raw);
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function scalePeriodRows<T extends WeeklyRow | DailyRow>(rows: T[], contracts: number, startingBalance: number): T[] {
  let running = startingBalance;
  return rows.map((row) => {
    const pnl = roundMoney(row.pnl * contracts);
    const startBalance = roundMoney(running);
    const endBalance = roundMoney(startBalance + pnl);
    running = endBalance;
    return {
      ...row,
      startBalance,
      endBalance,
      pnl,
      maxDrawdown: row.maxDrawdown == null ? undefined : roundMoney(row.maxDrawdown * contracts),
    };
  });
}

export function projectSlotContracts(slot: StrategySlot, contracts: number): StrategySlot {
  if (MARTINGALE_SLOT_KEYS.has(slot.key)) {
    return slot;
  }
  const safeContracts = Math.max(1, Math.floor(contracts));
  const unitContinuousPnl = slot.unitContinuousPnl ?? slot.continuousPnl;
  const unitClosedPnl = slot.unitClosedPnl ?? slot.closedPnl;
  const unitOpenPnl = slot.unitOpenPnl ?? slot.openPnl;
  const unitMaxDrawdown = slot.unitMaxDrawdown ?? slot.maxDrawdown;
  const unitWeeklyRows = slot.unitWeeklyRows ?? slot.weeklyRows;
  const unitDailyRows = slot.unitDailyRows ?? slot.dailyRows;
  const unitEquityCurve = slot.unitEquityCurve ?? slot.equityCurve;
  const unitPositions = slot.unitPositions ?? slot.positions;
  const startBalance = slot.startBalance;

  const positions = unitPositions.map((position) => ({
    ...position,
    contracts: safeContracts,
    pnl: roundMoney((position.unitPnl ?? position.pnl) * safeContracts),
  }));
  const projectedPosition = slot.position.replace(/^([A-Z]+)\s+\d+\s+@/, `$1 ${safeContracts} @`);

  return {
    ...slot,
    contracts: safeContracts,
    continuousPnl: roundMoney(unitContinuousPnl * safeContracts),
    closedPnl: roundMoney(unitClosedPnl * safeContracts),
    openPnl: roundMoney(unitOpenPnl * safeContracts),
    endBalance: roundMoney(startBalance + unitContinuousPnl * safeContracts),
    maxDrawdown: roundMoney(unitMaxDrawdown * safeContracts),
    weeklyRows: scalePeriodRows(unitWeeklyRows, safeContracts, startBalance),
    dailyRows: scalePeriodRows(unitDailyRows, safeContracts, startBalance),
    equityCurve: unitEquityCurve.map((point) => ({
      ...point,
      equity: roundMoney(startBalance + (point.equity - startBalance) * safeContracts),
    })),
    positions,
    position: projectedPosition,
    unitContinuousPnl,
    unitClosedPnl,
    unitOpenPnl,
    unitMaxDrawdown,
    unitWeeklyRows,
    unitDailyRows,
    unitEquityCurve,
    unitPositions,
  };
}

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

function mapWeeklyRows(rows: PeriodRowApi[] | undefined): WeeklyRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((r) => ({
    week: r.week || r.period || "—",
    startBalance: r.start_balance,
    endBalance: r.end_balance,
    pnl: r.pnl_dollars,
    maxDrawdown: r.max_drawdown,
  }));
}

function mapDailyRows(rows: PeriodRowApi[] | undefined): DailyRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((r) => ({
    day: r.day || r.period || "—",
    startBalance: r.start_balance,
    endBalance: r.end_balance,
    pnl: r.pnl_dollars,
    maxDrawdown: r.max_drawdown,
  }));
}

function mapEquityCurve(rows: ApiSlot["equity_curve"]): EquityPoint[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .filter((row) => typeof row.equity === "number")
    .map((row) => ({
      t: row.t ?? null,
      equity: row.equity,
    }));
}

function mapPositions(recent: ApiSlot["recent_trades"]): PositionRow[] {
  if (!Array.isArray(recent)) {
    return [];
  }
  const displayable = recent.filter((t) => t.exit_time || (t.is_open && t.entry_time));
  return displayable.map((t) => {
    const sideRaw = (t.side || "").toLowerCase();
    const side: "LONG" | "SHORT" = sideRaw === "long" ? "LONG" : "SHORT";
    const isOpen = Boolean(t.is_open);
    return {
      closedAt: (t.exit_time || t.entry_time) as string,
      entryTime: t.entry_time ?? null,
      exitTime: t.exit_time ?? null,
      side,
      duration: formatDuration(t.entry_time ?? null, t.exit_time ?? null),
      contracts: typeof t.size === "number" ? t.size : 0,
      exit: (t.exit_reason || (isOpen ? "Live" : "—")).replace(/_/g, " "),
      pnl: typeof t.pnl_dollars === "number" ? t.pnl_dollars : 0,
      unitPnl: typeof t.pnl_dollars === "number" ? t.pnl_dollars : 0,
      isOpen,
    };
  });
}

function resolveInstrument(api: ApiSlot): string {
  const raw = (api.instrument || "").trim().toUpperCase();
  if (raw) {
    return raw;
  }
  return MNQ_SLOT_KEYS.has(api.key) ? "MNQ" : "MES";
}

function mapSlot(api: ApiSlot): StrategySlot {
  const m = api.metrics || {};
  const weeklyRows = mapWeeklyRows(api.weekly_rows);
  const dailyRows = mapDailyRows(api.daily_rows);
  const equityCurve = mapEquityCurve(api.equity_curve);
  const positions = mapPositions(api.all_trades ?? api.recent_trades);
  return {
    key: api.key,
    title: api.title,
    description: api.description ?? undefined,
    mode: mapMode(api.mode),
    instrument: resolveInstrument(api),
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
    weeklyRows,
    dailyRows,
    equityCurve,
    positions,
    unitContinuousPnl: api.continuous_pnl ?? 0,
    unitClosedPnl: api.closed_pnl ?? 0,
    unitOpenPnl: api.open_pnl ?? 0,
    unitMaxDrawdown: typeof m.max_drawdown === "number" ? m.max_drawdown : 0,
    unitWeeklyRows: weeklyRows,
    unitDailyRows: dailyRows,
    unitEquityCurve: equityCurve,
    unitPositions: positions,
  };
}

function mapDateFilter(raw: ApiDashboard["date_filter"]): SimulationDateFilterMeta | undefined {
  if (!raw?.from || !raw?.to) {
    return undefined;
  }
  return {
    from: raw.from,
    to: raw.to,
    defaultApplied: Boolean(raw.default_applied),
  };
}

export function mapSimulationDashboard(payload: unknown): {
  slots: StrategySlot[];
  overview: DashboardOverviewData;
  dateFilter?: SimulationDateFilterMeta;
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

  const dateFilter = mapDateFilter(data.date_filter);
  const s = data.summary || {};
  const market = s.market || {};
  const totals = s.totals || {};
  const account = s.account || {};
  const regime = market.regime ? ` · regime ${market.regime}` : "";
  const barCoverage =
    totals.covered_from && totals.covered_to
      ? `${formatDate(totals.covered_from)} → ${formatDate(totals.covered_to)}`
      : typeof totals.days_covered === "number"
        ? `${totals.days_covered} day(s)`
        : "—";
  const tradeRange = dateFilter ? `${dateFilter.from} → ${dateFilter.to}` : undefined;

  const overview: DashboardOverviewData = {
    strategyName: "Bar-core simulation (StrategySimulator)",
    strategySubtitle: `${formatTime(market.last_bar_time)}${regime} · bars ${barCoverage}${
      tradeRange ? ` · trades ${tradeRange}` : ""
    }`,
    accountBalance: account.balance ?? account.running_balance ?? null,
    accountStatus:
      account.balance != null || account.running_balance != null
        ? `Balance ${account.balance ?? "—"} · running ${account.running_balance ?? "—"} · open P&L ${account.open_pnl ?? "—"} · ${account.position ?? "—"}`
        : "Live account not wired to this mode (bar simulation from persisted data only).",
    totalSimPnl: typeof totals.continuous_pnl_dollars === "number" ? totals.continuous_pnl_dollars : 0,
    barsProcessed: totals.bars_processed,
    closedTrades: totals.closed_trades,
    daysCovered: barCoverage,
    tradeDateRange: tradeRange,
  };

  return { slots, overview, dateFilter };
}

export function dateFilterToRange(meta: SimulationDateFilterMeta): { from: Date; to: Date } {
  return {
    from: new Date(`${meta.from}T12:00:00`),
    to: new Date(`${meta.to}T12:00:00`),
  };
}
