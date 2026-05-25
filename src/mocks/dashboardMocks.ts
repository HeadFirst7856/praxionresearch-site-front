export type StrategyMode = "LIVE" | "SHADOW" | "SIMULATED";

export type WeeklyRow = {
  week: string;
  startBalance: number;
  endBalance: number;
  pnl: number;
};

export type DailyRow = {
  day: string;
  startBalance: number;
  endBalance: number;
  pnl: number;
};

export type EquityPoint = {
  t: string | null;
  equity: number;
};

export type PositionRow = {
  closedAt: string;
  side: "LONG" | "SHORT";
  duration: string;
  contracts: number;
  exit: string;
  pnl: number;
};

export type StrategySlot = {
  key: string;
  title: string;
  mode: StrategyMode;
  /** Futures symbol for contract size label (e.g. MES, MNQ). */
  instrument: string;
  startBalance: number;
  endBalance: number;
  continuousPnl: number;
  trades: number;
  contracts: number;
  position: string;
  closedPnl: number;
  openPnl: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  weeklyRows: WeeklyRow[];
  dailyRows: DailyRow[];
  equityCurve: EquityPoint[];
  positions: PositionRow[];
};

export type SimulationDateFilterMeta = {
  from: string;
  to: string;
  defaultApplied: boolean;
};

export const mockDashboardSummary = {
  strategyName: "IQ + TrendShift Core",
  strategySubtitle: "Independent 50K track, last bar 2026-05-02 15:35 UTC",
  accountBalance: 52432.33,
  accountStatus: "Live account running +$2,432.33 | open +$175.20 | position Flat",
  totalSimPnl: 9171.42,
};

export const mockStrategySlots: StrategySlot[] = [
  {
    key: "iq-trendshift",
    title: "IQ + TrendShift Core",
    mode: "LIVE",
    instrument: "MES",
    startBalance: 50000,
    endBalance: 52432.33,
    continuousPnl: 2432.33,
    trades: 18,
    contracts: 3,
    position: "Flat",
    closedPnl: 2257.13,
    openPnl: 175.2,
    winRate: 0.61,
    profitFactor: 1.74,
    maxDrawdown: 512.2,
    weeklyRows: [
      { week: "2026-W16", startBalance: 50000, endBalance: 50730, pnl: 730 },
      { week: "2026-W17", startBalance: 50730, endBalance: 51540, pnl: 810 },
      { week: "2026-W18", startBalance: 51540, endBalance: 52432.33, pnl: 892.33 },
    ],
    dailyRows: [],
    equityCurve: [],
    positions: [
      { closedAt: "2026-04-05T14:05:00+00:00", side: "LONG", duration: "42m", contracts: 2, exit: "target", pnl: 181.2 },
      { closedAt: "2026-04-08T15:40:00+00:00", side: "SHORT", duration: "39m", contracts: 1, exit: "stop", pnl: -96.7 },
      { closedAt: "2026-04-11T13:15:00+00:00", side: "LONG", duration: "51m", contracts: 2, exit: "target", pnl: 210.1 },
      { closedAt: "2026-04-15T16:10:00+00:00", side: "LONG", duration: "28m", contracts: 1, exit: "target", pnl: 124.8 },
      { closedAt: "2026-04-19T10:55:00+00:00", side: "SHORT", duration: "1h 05m", contracts: 2, exit: "stop", pnl: -112.4 },
      { closedAt: "2026-04-22T12:22:00+00:00", side: "LONG", duration: "33m", contracts: 2, exit: "target", pnl: 248.9 },
      { closedAt: "2026-04-26T17:05:00+00:00", side: "SHORT", duration: "47m", contracts: 1, exit: "target", pnl: 132.6 },
      { closedAt: "2026-04-29T13:33:00+00:00", side: "LONG", duration: "30m", contracts: 1, exit: "target", pnl: 159.7 },
      { closedAt: "2026-05-01T13:15:00+00:00", side: "SHORT", duration: "1h 10m", contracts: 1, exit: "stop", pnl: -94.5 },
      { closedAt: "2026-05-02T14:05:00+00:00", side: "LONG", duration: "42m", contracts: 2, exit: "target", pnl: 191.8 },
    ],
  },
  {
    key: "fvg-overlay",
    title: "FVG Overlay",
    mode: "SHADOW",
    instrument: "MES",
    startBalance: 50000,
    endBalance: 52187.59,
    continuousPnl: 2187.59,
    trades: 24,
    contracts: 2,
    position: "Active",
    closedPnl: 1945.02,
    openPnl: 242.57,
    winRate: 0.58,
    profitFactor: 1.52,
    maxDrawdown: 688.14,
    weeklyRows: [
      { week: "2026-W16", startBalance: 50000, endBalance: 50420, pnl: 420 },
      { week: "2026-W17", startBalance: 50420, endBalance: 51330, pnl: 910 },
      { week: "2026-W18", startBalance: 51330, endBalance: 52187.59, pnl: 857.59 },
    ],
    dailyRows: [],
    equityCurve: [],
    positions: [
      { closedAt: "2026-04-06T15:10:00+00:00", side: "LONG", duration: "27m", contracts: 1, exit: "target", pnl: 88.3 },
      { closedAt: "2026-04-09T10:40:00+00:00", side: "SHORT", duration: "55m", contracts: 1, exit: "target", pnl: 164.46 },
      { closedAt: "2026-04-13T12:05:00+00:00", side: "LONG", duration: "38m", contracts: 1, exit: "target", pnl: 122.4 },
      { closedAt: "2026-04-17T14:44:00+00:00", side: "SHORT", duration: "42m", contracts: 2, exit: "stop", pnl: -131.9 },
      { closedAt: "2026-04-21T11:27:00+00:00", side: "LONG", duration: "31m", contracts: 1, exit: "target", pnl: 143.7 },
      { closedAt: "2026-04-25T13:58:00+00:00", side: "SHORT", duration: "49m", contracts: 2, exit: "target", pnl: 211.2 },
      { closedAt: "2026-04-28T16:20:00+00:00", side: "LONG", duration: "35m", contracts: 1, exit: "target", pnl: 174.8 },
      { closedAt: "2026-05-01T10:40:00+00:00", side: "SHORT", duration: "55m", contracts: 1, exit: "target", pnl: 164.46 },
      { closedAt: "2026-05-02T15:10:00+00:00", side: "LONG", duration: "27m", contracts: 1, exit: "open", pnl: 78.11 },
    ],
  },
  {
    key: "asia-meanrev",
    title: "Asia Mean Reversion",
    mode: "SIMULATED",
    instrument: "MES",
    startBalance: 50000,
    endBalance: 54551.5,
    continuousPnl: 4551.5,
    trades: 32,
    contracts: 1,
    position: "Flat",
    closedPnl: 4551.5,
    openPnl: 0,
    winRate: 0.65,
    profitFactor: 2.01,
    maxDrawdown: 441.75,
    weeklyRows: [
      { week: "2026-W16", startBalance: 50000, endBalance: 51290, pnl: 1290 },
      { week: "2026-W17", startBalance: 51290, endBalance: 52710, pnl: 1420 },
      { week: "2026-W18", startBalance: 52710, endBalance: 54551.5, pnl: 1841.5 },
    ],
    dailyRows: [],
    equityCurve: [],
    positions: [
      { closedAt: "2026-04-04T22:10:00+00:00", side: "LONG", duration: "35m", contracts: 1, exit: "target", pnl: 115.2 },
      { closedAt: "2026-04-08T23:00:00+00:00", side: "SHORT", duration: "48m", contracts: 1, exit: "target", pnl: 138.5 },
      { closedAt: "2026-04-12T21:45:00+00:00", side: "LONG", duration: "40m", contracts: 1, exit: "target", pnl: 163.4 },
      { closedAt: "2026-04-16T23:20:00+00:00", side: "SHORT", duration: "53m", contracts: 1, exit: "stop", pnl: -97.1 },
      { closedAt: "2026-04-20T22:02:00+00:00", side: "LONG", duration: "27m", contracts: 1, exit: "target", pnl: 176.8 },
      { closedAt: "2026-04-24T23:33:00+00:00", side: "SHORT", duration: "1h 02m", contracts: 1, exit: "target", pnl: 222.9 },
      { closedAt: "2026-04-27T22:48:00+00:00", side: "LONG", duration: "36m", contracts: 1, exit: "target", pnl: 184.5 },
      { closedAt: "2026-04-30T23:00:00+00:00", side: "SHORT", duration: "48m", contracts: 1, exit: "target", pnl: 138.5 },
      { closedAt: "2026-05-01T22:10:00+00:00", side: "LONG", duration: "35m", contracts: 1, exit: "target", pnl: 115.2 },
    ],
  },
];
