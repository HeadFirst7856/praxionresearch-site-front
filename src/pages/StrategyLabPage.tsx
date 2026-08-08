import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  ZAxis,
} from "recharts";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SleeveKey = "rth" | "europe";

type HeadlineBlock = {
  noStackNetPnl2Mnq: number;
  noStackAvgMonth2Mnq: number;
  noStackAvgMonth6Mnq: number;
  noStackTrades: number;
  stackedTrades: number;
  skippedTrades: number;
  mcMedian24mNoWithdrawal: number;
  mcMedian24mWithWithdrawal: number;
};

type SleeveCard = {
  sleeve: SleeveKey;
  label: string;
  color: string;
  netPnl: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  trades: number;
};

type MonthlyComparisonRow = {
  month: string;
  noStackCombined: number;
  stackedCombined: number;
  rthNoStack: number;
  europeNoStack: number;
  tradesNoStack: number;
  stackingPenalty: number;
};

type MonteCarloRow = {
  month: number;
  medianNoWithdrawal: number;
  p10NoWithdrawal: number;
  p90NoWithdrawal: number;
  medianWithWithdrawal: number;
  p10WithWithdrawal: number;
  p90WithWithdrawal: number;
};

type DailyDot = {
  day: string;
  trades: number;
  pnl: number;
  avgProbability: number;
  medianProbability: number;
  avgContracts: number;
  avgRvwapZAbs: number;
  avgDurationMinutes: number;
  winRate: number;
  dominantSleeve: string;
  positiveTrades: number;
  negativeTrades: number;
  featureStress: number;
};

type DayXAxisKey = "avgProbability" | "medianProbability" | "featureStress" | "avgDurationMinutes" | "avgRvwapZAbs" | "winRate" | "trades";

type DayTrade = {
  tradeId: string;
  sleeve: SleeveKey;
  entryMinuteEt: number;
  entryTimeEt: string;
  exitTimeEt: string;
  probability: number;
  contracts2MnqBase: number;
  pnlDollars2MnqBase: number;
  rvwapZ: number;
  durationMinutes: number;
  side: string;
  exitReason: string;
  regime: string;
  dayRegime: string;
};

type TopFeature = {
  feature: string;
  strength: number;
  absStrength: number;
  family: string;
  sleeve: SleeveKey;
};

type FeatureFamily = {
  family: string;
  totalStrength: number;
  featureCount: number;
  topFeature?: string;
  topFeatureStrength?: number;
  color?: string;
  sleeves?: string[];
};

type BrainNode = {
  id: string;
  label: string;
  strength?: number;
  family?: string;
  score?: number;
};

type BrainEdge = {
  source: string;
  target: string;
  weight: number;
  absWeight: number;
};

type ArtifactView = {
  sleeve: SleeveKey;
  artifactRows: number;
  trainRows: number;
  validationRows: number;
  testRows: number;
  hiddenSize: number;
  numericFeatureCount: number;
  standardizedFeatureCount: number;
  thresholds: number[];
  sizeLadder: number[];
  validationNet: number;
  testNet: number;
  testProfitFactor: number;
  testWinRate: number;
  topFeatures: TopFeature[];
  featureFamilies: FeatureFamily[];
  brain: {
    inputNodes: BrainNode[];
    hiddenNodes: BrainNode[];
    outputNode: BrainNode;
    edgesInputHidden: BrainEdge[];
    edgesHiddenOutput: BrainEdge[];
  };
};

type SummaryBlock = {
  history: {
    trade_stats: {
      net_pnl: number;
      trades: number;
      win_rate: number;
      max_drawdown_closed_equity: number;
      profit_factor: number | null;
    };
    monthly_stats: {
      avg_month: number;
      median_month: number;
      positive_rate: number;
      best_month: number;
      worst_month: number;
    };
    filter_stats?: {
      original_trades: number;
      accepted_trades: number;
      skipped_trades: number;
    };
    actual_path_no_withdrawal: { end_balance: number; max_drawdown: number };
    actual_path_with_1200: { end_balance: number; max_drawdown: number };
  };
  monte_carlo: {
    no_withdrawal: {
      median_end_balance: number;
      p10_end_balance: number;
      p90_end_balance: number;
      prob_finish_busted: number;
      median_max_drawdown: number;
    };
    withdraw_1200: {
      median_end_balance: number;
      p10_end_balance: number;
      p90_end_balance: number;
      prob_finish_busted: number;
      median_max_drawdown: number;
    };
  };
};

type ChallengerContext = {
  strategy: string;
  selectedBranch: string;
  market: string;
  trades: number;
  winRate: number;
  profitFactor: number;
  totalPnlNative: number;
  maxDdNative: number;
} | null;

type PlaygroundPayload = {
  generatedAt: string;
  headline: HeadlineBlock;
  sleeveCards: SleeveCard[];
  monthlyComparison: MonthlyComparisonRow[];
  monteCarloCompare: MonteCarloRow[];
  dailyDots: DailyDot[];
  dayTrades: Record<string, DayTrade[]>;
  artifacts: Record<SleeveKey, ArtifactView>;
  combinedFeatureMap: {
    topFeatures: TopFeature[];
    featureFamilies: FeatureFamily[];
  };
  summaries: {
    stacked: SummaryBlock;
    noStack: SummaryBlock;
  };
  challengerContext: ChallengerContext;
  colors: Record<string, string>;
  dayDefaults: {
    bestDay: string | null;
    worstDay: string | null;
    latestDay: string | null;
  };
};

const dataUrl = "/data/strategy-playground-mlp.json";
const fallbackColors: Record<string, string> = {
  rth: "#38bdf8",
  europe: "#a78bfa",
  combined: "#22c55e",
  stacked: "#f59e0b",
  module48: "#f472b6",
  mixed: "#f59e0b",
};

const dayXAxisOptions: Array<{
  key: DayXAxisKey;
  label: string;
  axisLabel: string;
  tooltipLabel: string;
  format: (value: number) => string;
  getValue: (row: DailyDot) => number;
}> = [
  {
    key: "avgProbability",
    label: "Confidence, recommended",
    axisLabel: "Avg model confidence",
    tooltipLabel: "Avg confidence",
    format: (value) => `${Math.round(value * 100)}%`,
    getValue: (row) => row.avgProbability,
  },
  {
    key: "medianProbability",
    label: "Median probability",
    axisLabel: "Median model confidence",
    tooltipLabel: "Median confidence",
    format: (value) => `${Math.round(value * 100)}%`,
    getValue: (row) => row.medianProbability,
  },
  {
    key: "featureStress",
    label: "Feature stress",
    axisLabel: "Feature stress",
    tooltipLabel: "Feature stress",
    format: (value) => value.toFixed(2),
    getValue: (row) => row.featureStress,
  },
  {
    key: "avgDurationMinutes",
    label: "Avg hold time",
    axisLabel: "Avg duration (minutes)",
    tooltipLabel: "Avg duration",
    format: (value) => `${Math.round(value)}m`,
    getValue: (row) => row.avgDurationMinutes,
  },
  {
    key: "avgRvwapZAbs",
    label: "RVWAP stretch",
    axisLabel: "Avg |RVWAP z|",
    tooltipLabel: "Avg |RVWAP z|",
    format: (value) => value.toFixed(2),
    getValue: (row) => row.avgRvwapZAbs,
  },
  {
    key: "winRate",
    label: "Day win rate",
    axisLabel: "Day win rate",
    tooltipLabel: "Day win rate",
    format: (value) => `${Math.round(value * 100)}%`,
    getValue: (row) => row.winRate,
  },
  {
    key: "trades",
    label: "Trade count",
    axisLabel: "Trade count",
    tooltipLabel: "Trade count",
    format: (value) => Math.round(value).toLocaleString(),
    getValue: (row) => row.trades,
  },
];

function formatMoney(value: number, digits = 0): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatCompactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}m`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

function formatClock(minutesFromMidnight: number): string {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function shortFeatureLabel(value: string): string {
  return value.replace(/^ml_/, "").replace(/^seq_/, "seq ").replace(/_/g, " ");
}

function familyLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function dominantColor(key: string, colors: Record<string, string>): string {
  return colors[key] ?? fallbackColors[key] ?? "#94a3b8";
}

function PlaygroundCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
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

function MetricPill({ label, value, tone = "text-slate-100" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#091221]/80 p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className={cn("mt-2 text-3xl font-semibold", tone)}>{value}</div>
    </div>
  );
}

function NeuralBrain({ artifact, color }: { artifact: ArtifactView; color: string }) {
  const width = 720;
  const height = 360;
  const inputX = 90;
  const hiddenX = 360;
  const outputX = 620;
  const inputNodes = artifact.brain.inputNodes.map((node, index, all) => ({
    ...node,
    x: inputX,
    y: 40 + (index * (height - 80)) / Math.max(all.length - 1, 1),
  }));
  const hiddenNodes = artifact.brain.hiddenNodes.map((node, index, all) => ({
    ...node,
    x: hiddenX,
    y: 50 + (index * (height - 100)) / Math.max(all.length - 1, 1),
  }));
  const outputNode = { ...artifact.brain.outputNode, x: outputX, y: height / 2 };
  const lookup = new Map<string, { x: number; y: number }>();
  inputNodes.forEach((node) => lookup.set(node.id, { x: node.x, y: node.y }));
  hiddenNodes.forEach((node) => lookup.set(node.id, { x: node.x, y: node.y }));
  lookup.set(outputNode.id, { x: outputNode.x, y: outputNode.y });
  const maxIn = Math.max(...artifact.brain.edgesInputHidden.map((edge) => edge.absWeight), 0.0001);
  const maxOut = Math.max(...artifact.brain.edgesHiddenOutput.map((edge) => edge.absWeight), 0.0001);
  const animatedInputEdges = [...artifact.brain.edgesInputHidden].sort((a, b) => b.absWeight - a.absWeight).slice(0, 8);
  const animatedOutputEdges = [...artifact.brain.edgesHiddenOutput].sort((a, b) => b.absWeight - a.absWeight).slice(0, 5);

  return (
    <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.12),transparent_55%),linear-gradient(180deg,rgba(10,17,31,0.96),rgba(6,11,21,0.96))] p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-100">{artifact.sleeve.toUpperCase()} MLP node brain</div>
          <p className="mt-1 text-xs text-slate-400">Top inputs feed the strongest hidden neurons, then collapse into the win-probability output node.</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          {artifact.standardizedFeatureCount} standardized inputs, {artifact.hiddenSize} hidden nodes
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[360px] w-full overflow-visible">
        <defs>
          <linearGradient id={`brain-glow-${artifact.sleeve}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.8" />
            <stop offset="100%" stopColor="#f8fafc" stopOpacity="0.2" />
          </linearGradient>
          <filter id={`brain-shadow-${artifact.sleeve}`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={color} floodOpacity="0.4" />
          </filter>
        </defs>

        {artifact.brain.edgesInputHidden.map((edge) => {
          const source = lookup.get(edge.source);
          const target = lookup.get(edge.target);
          if (!source || !target) {
            return null;
          }
          const opacity = 0.12 + (edge.absWeight / maxIn) * 0.5;
          const pathId = `brain-path-in-${artifact.sleeve}-${edge.source}-${edge.target}`;
          return (
            <path
              id={pathId}
              key={`${edge.source}-${edge.target}`}
              d={`M ${source.x} ${source.y} C ${source.x + 80} ${source.y}, ${target.x - 80} ${target.y}, ${target.x} ${target.y}`}
              fill="none"
              stroke={`url(#brain-glow-${artifact.sleeve})`}
              strokeOpacity={opacity}
              strokeWidth={1 + (edge.absWeight / maxIn) * 3}
              strokeDasharray={`${6 + (edge.absWeight / maxIn) * 10} 18`}
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-34" dur={`${6.2 - Math.min(3.5, (edge.absWeight / maxIn) * 2.8)}s`} repeatCount="indefinite" />
            </path>
          );
        })}

        {animatedInputEdges.map((edge, index) => {
          const source = lookup.get(edge.source);
          const target = lookup.get(edge.target);
          if (!source || !target) {
            return null;
          }
          const pathId = `brain-path-in-${artifact.sleeve}-${edge.source}-${edge.target}`;
          return (
            <circle key={`pulse-in-${edge.source}-${edge.target}`} r={2.6 + (edge.absWeight / maxIn) * 2.2} fill="#f8fafc" fillOpacity="0.88">
              <animate attributeName="opacity" values="0;1;0" dur={`${2.6 + index * 0.28}s`} repeatCount="indefinite" begin={`${index * 0.18}s`} />
              <animateMotion dur={`${2.6 + index * 0.28}s`} repeatCount="indefinite" rotate="auto" begin={`${index * 0.18}s`}>
                <mpath href={`#${pathId}`} />
              </animateMotion>
            </circle>
          );
        })}

        {artifact.brain.edgesHiddenOutput.map((edge) => {
          const source = lookup.get(edge.source);
          const target = lookup.get(edge.target);
          if (!source || !target) {
            return null;
          }
          const opacity = 0.18 + (edge.absWeight / maxOut) * 0.55;
          const pathId = `brain-path-out-${artifact.sleeve}-${edge.source}-${edge.target}`;
          return (
            <path
              id={pathId}
              key={`${edge.source}-${edge.target}`}
              d={`M ${source.x} ${source.y} C ${source.x + 70} ${source.y}, ${target.x - 70} ${target.y}, ${target.x} ${target.y}`}
              fill="none"
              stroke="#f8fafc"
              strokeOpacity={opacity}
              strokeWidth={1 + (edge.absWeight / maxOut) * 4}
              strokeDasharray={`${5 + (edge.absWeight / maxOut) * 8} 16`}
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-26" dur={`${4.8 - Math.min(2.4, (edge.absWeight / maxOut) * 2)}s`} repeatCount="indefinite" />
            </path>
          );
        })}

        {animatedOutputEdges.map((edge, index) => {
          const source = lookup.get(edge.source);
          const target = lookup.get(edge.target);
          if (!source || !target) {
            return null;
          }
          const pathId = `brain-path-out-${artifact.sleeve}-${edge.source}-${edge.target}`;
          return (
            <circle key={`pulse-out-${edge.source}-${edge.target}`} r={3 + (edge.absWeight / maxOut) * 2.8} fill={color} fillOpacity="0.9">
              <animate attributeName="opacity" values="0;1;0" dur={`${2.1 + index * 0.22}s`} repeatCount="indefinite" begin={`${index * 0.14}s`} />
              <animateMotion dur={`${2.1 + index * 0.22}s`} repeatCount="indefinite" rotate="auto" begin={`${index * 0.14}s`}>
                <mpath href={`#${pathId}`} />
              </animateMotion>
            </circle>
          );
        })}

        {inputNodes.map((node) => (
          <g key={node.id} transform={`translate(${node.x},${node.y})`}>
            <circle r={8 + (node.strength ?? 0) * 30} fill={color} fillOpacity="0.22">
              <animate attributeName="r" values={`${8 + (node.strength ?? 0) * 30};${10 + (node.strength ?? 0) * 34};${8 + (node.strength ?? 0) * 30}`} dur="3.2s" repeatCount="indefinite" />
            </circle>
            <circle r={4 + (node.strength ?? 0) * 14} fill={color} filter={`url(#brain-shadow-${artifact.sleeve})`}>
              <animate attributeName="opacity" values="0.72;1;0.72" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <text x={18} y={4} fill="#cbd5e1" fontSize="11">{node.label}</text>
          </g>
        ))}

        {hiddenNodes.map((node) => (
          <g key={node.id} transform={`translate(${node.x},${node.y})`}>
            <circle r={10 + (node.score ?? 0) * 24} fill="#e2e8f0" fillOpacity="0.12">
              <animate attributeName="r" values={`${10 + (node.score ?? 0) * 24};${12 + (node.score ?? 0) * 28};${10 + (node.score ?? 0) * 24}`} dur="3.6s" repeatCount="indefinite" />
            </circle>
            <circle r={6 + (node.score ?? 0) * 12} fill="#e2e8f0" fillOpacity="0.82">
              <animate attributeName="fill-opacity" values="0.65;0.95;0.65" dur="2.7s" repeatCount="indefinite" />
            </circle>
            <text x={0} y={32} textAnchor="middle" fill="#94a3b8" fontSize="11">{node.label}</text>
          </g>
        ))}

        <g transform={`translate(${outputNode.x},${outputNode.y})`}>
          <circle r="30" fill={color} fillOpacity="0.16">
            <animate attributeName="r" values="30;34;30" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle r="18" fill={color} filter={`url(#brain-shadow-${artifact.sleeve})`}>
            <animate attributeName="opacity" values="0.78;1;0.78" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <text x="0" y="4" textAnchor="middle" fill="#e2e8f0" fontSize="11" fontWeight="600">Win</text>
          <text x="0" y="18" textAnchor="middle" fill="#e2e8f0" fontSize="11" fontWeight="600">Prob</text>
        </g>
      </svg>
    </div>
  );
}

export function StrategyPlaygroundPage() {
  const [payload, setPayload] = useState<PlaygroundPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSleeve, setSelectedSleeve] = useState<SleeveKey>("rth");
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [selectedDayXAxis, setSelectedDayXAxis] = useState<DayXAxisKey>("avgProbability");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(dataUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as PlaygroundPayload;
        if (!cancelled) {
          setPayload(data);
          setSelectedDay(data.dayDefaults.latestDay ?? data.dayDefaults.bestDay ?? "");
        }
      } catch (error) {
        console.error("Could not load strategy playground payload", error);
        if (!cancelled) {
          setPayload(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const colors = payload?.colors ?? fallbackColors;
  const artifact = payload?.artifacts[selectedSleeve] ?? null;
  const selectedDayTrades = useMemo(() => (selectedDay && payload ? payload.dayTrades[selectedDay] ?? [] : []), [payload, selectedDay]);
  const selectedDayRow = useMemo(
    () => payload?.dailyDots.find((item) => item.day === selectedDay) ?? payload?.dailyDots.at(-1) ?? null,
    [payload, selectedDay],
  );

  const familyScatter = useMemo(() => {
    const families = payload?.combinedFeatureMap.featureFamilies ?? [];
    return families.map((family, index) => ({
      ...family,
      axisX: index + 1,
      bubble: Math.max(10, family.featureCount * 18),
      color: family.sleeves?.includes("rth") && family.sleeves?.includes("europe") ? colors.combined : family.sleeves?.includes("rth") ? colors.rth : colors.europe,
    }));
  }, [payload, colors]);

  const topFeatureBars = useMemo(() => {
    const top = artifact?.topFeatures.slice(0, 10) ?? [];
    return top.map((item) => ({ ...item, label: shortFeatureLabel(item.feature) }));
  }, [artifact]);

  const riskMap = useMemo(
    () =>
      payload?.sleeveCards.map((item) => ({
        ...item,
        drawdown: Math.abs(item.maxDrawdown),
      })) ?? [],
    [payload],
  );

  const daySelectorOptions = useMemo(() => {
    if (!payload) {
      return [] as { label: string; value: string }[];
    }
    const priority = [payload.dayDefaults.latestDay, payload.dayDefaults.bestDay, payload.dayDefaults.worstDay].filter(Boolean) as string[];
    const seen = new Set<string>();
    const orderedDays = [...priority, ...payload.dailyDots.map((row) => row.day)].filter((day) => {
      if (seen.has(day)) return false;
      seen.add(day);
      return true;
    });
    return orderedDays.map((day) => ({
      value: day,
      label: day === payload.dayDefaults.latestDay ? `${day} · latest` : day === payload.dayDefaults.bestDay ? `${day} · best` : day === payload.dayDefaults.worstDay ? `${day} · worst` : day,
    }));
  }, [payload]);

  const selectedDayXAxisOption = useMemo(
    () => dayXAxisOptions.find((option) => option.key === selectedDayXAxis) ?? dayXAxisOptions[0],
    [selectedDayXAxis],
  );

  const dayScatterData = useMemo(
    () => payload?.dailyDots.map((row) => ({ ...row, xValue: selectedDayXAxisOption.getValue(row) })) ?? [],
    [payload, selectedDayXAxisOption],
  );

  const confidenceBuckets = useMemo(() => {
    const rows = payload?.dailyDots ?? [];
    if (!rows.length) {
      return [] as Array<{
        bucket: string;
        avgPnl: number;
        avgWinRate: number;
        avgStress: number;
        avgTrades: number;
        days: number;
      }>;
    }
    const min = Math.min(...rows.map((row) => row.avgProbability));
    const max = Math.max(...rows.map((row) => row.avgProbability));
    const bucketCount = 6;
    const width = Math.max((max - min) / bucketCount, 0.015);
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({
      low: min + index * width,
      high: index === bucketCount - 1 ? max : min + (index + 1) * width,
      rows: [] as DailyDot[],
    }));
    rows.forEach((row) => {
      const rawIndex = width <= 0 ? 0 : Math.floor((row.avgProbability - min) / width);
      const index = Math.max(0, Math.min(bucketCount - 1, rawIndex));
      buckets[index].rows.push(row);
    });
    return buckets
      .filter((bucket) => bucket.rows.length > 0)
      .map((bucket) => ({
        bucket: `${Math.round(bucket.low * 100)}-${Math.round(bucket.high * 100)}%`,
        avgPnl: bucket.rows.reduce((sum, row) => sum + row.pnl, 0) / bucket.rows.length,
        avgWinRate: bucket.rows.reduce((sum, row) => sum + row.winRate, 0) / bucket.rows.length,
        avgStress: bucket.rows.reduce((sum, row) => sum + row.featureStress, 0) / bucket.rows.length,
        avgTrades: bucket.rows.reduce((sum, row) => sum + row.trades, 0) / bucket.rows.length,
        days: bucket.rows.length,
      }));
  }, [payload]);

  const bestConfidenceBucket = useMemo(
    () => confidenceBuckets.reduce((best, bucket) => (!best || bucket.avgPnl > best.avgPnl ? bucket : best), confidenceBuckets[0]),
    [confidenceBuckets],
  );

  return (
    <div className="page-container py-14">
      <section className="rounded-[32px] border border-sky-500/20 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_42%),linear-gradient(180deg,rgba(9,18,32,0.98),rgba(7,12,23,0.98))] px-6 py-10 shadow-[0_30px_120px_rgba(2,6,23,0.45)] md:px-10">
        <div className="max-w-5xl">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-300">Strategy Playground</p>
          <h1 className="mt-3 text-[clamp(2.7rem,7vw,5rem)] leading-[0.92] font-semibold tracking-tight text-slate-50">
            Turn the RVWAP MLP into a visual research lab.
          </h1>
          <p className="mt-4 max-w-4xl text-lg leading-relaxed text-slate-300">
            This page is about the strategy itself: feature pressure, sleeve behavior, overlap distortion, neural structure, and day-level trade selection without the extra noise.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/simulations" className={cn(buttonVariants({ variant: "default" }), "rounded-full bg-sky-500/20 px-4 text-sky-100 hover:bg-sky-500/30")}>
              Open Simulations
            </Link>
            <a href="/regime.html" className={cn(buttonVariants({ variant: "outline" }), "rounded-full border-white/15 bg-transparent px-4 text-slate-100 hover:bg-white/5")}>
              Open Regime
            </a>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricPill label="No-stack net, 2 MNQ" value={payload ? formatMoney(payload.headline.noStackNetPnl2Mnq) : loading ? "Loading..." : "n/a"} tone="text-emerald-300" />
          <MetricPill label="Average month, 6 MNQ" value={payload ? formatMoney(payload.headline.noStackAvgMonth6Mnq) : loading ? "Loading..." : "n/a"} tone="text-sky-200" />
          <MetricPill label="Combined win rate" value={payload ? formatPercent(payload.summaries.noStack.history.trade_stats.win_rate) : loading ? "Loading..." : "n/a"} tone="text-slate-100" />
          <MetricPill label="Overlap trades removed" value={payload ? payload.headline.skippedTrades.toLocaleString() : loading ? "Loading..." : "n/a"} tone="text-amber-300" />
        </div>
      </section>

      {payload ? (
        <>
          <div className="mt-8 grid gap-6 xl:grid-cols-2">
            <PlaygroundCard
              title="Stacked vs no-stack reality"
              subtitle="This is the first graph I wanted in here, because it shows exactly how much overlap inflated the original replay."
            >
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={payload.monthlyComparison} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="playground-nostack" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={colors.combined} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={colors.combined} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="playground-stacked" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={colors.stacked} stopOpacity={0.22} />
                        <stop offset="95%" stopColor={colors.stacked} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                    <XAxis dataKey="month" stroke="#94a3b8" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={formatCompactMoney} />
                    <Tooltip
                      contentStyle={{ background: "#08101b", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }}
                      formatter={(value, name) => [formatMoney(Number(value ?? 0)), String(name)]}
                    />
                    <Area type="monotone" dataKey="stackedCombined" stroke={colors.stacked} fill="url(#playground-stacked)" strokeWidth={2} name="Stacked" />
                    <Area type="monotone" dataKey="noStackCombined" stroke={colors.combined} fill="url(#playground-nostack)" strokeWidth={2.5} name="No stack" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Accepted trades</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-100">{payload.summaries.noStack.history.filter_stats?.accepted_trades.toLocaleString()}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Skipped overlap</div>
                  <div className="mt-2 text-2xl font-semibold text-amber-300">{payload.summaries.noStack.history.filter_stats?.skipped_trades.toLocaleString()}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">No-stack max DD</div>
                  <div className="mt-2 text-2xl font-semibold text-rose-300">{formatMoney(payload.summaries.noStack.history.trade_stats.max_drawdown_closed_equity)}</div>
                </div>
              </div>
            </PlaygroundCard>

            <PlaygroundCard
              title="RTH vs Europe risk map"
              subtitle="Same MLP family, two sleeves. This view makes it obvious where the payoff and pain are coming from."
            >
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                    <XAxis type="number" dataKey="netPnl" stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={formatCompactMoney} name="Net P&L" />
                    <YAxis type="number" dataKey="drawdown" stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={formatCompactMoney} name="Max drawdown" />
                    <ZAxis type="number" dataKey="trades" range={[160, 880]} />
                    <Tooltip
                      cursor={{ strokeDasharray: "4 4" }}
                      contentStyle={{ background: "#08101b", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }}
                      formatter={(value, name) => {
                        const numeric = Number(value ?? 0);
                        if (name === "Net P&L") return [formatMoney(numeric), "Net P&L"];
                        if (name === "Max drawdown") return [formatMoney(-numeric), "Max drawdown"];
                        return [numeric.toLocaleString(), String(name)];
                      }}
                      labelFormatter={(_, payloadRows) => String(payloadRows?.[0]?.payload?.label ?? "Sleeve")}
                    />
                    <Scatter data={riskMap} name="Sleeves">
                      {riskMap.map((item) => (
                        <Cell key={item.sleeve} fill={item.color} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {payload.sleeveCards.map((item) => (
                  <div key={item.sleeve} className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-100">{item.label}</div>
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-slate-50">{formatMoney(item.netPnl)}</div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-400">
                      <div>WR {formatPercent(item.winRate)}</div>
                      <div>PF {item.profitFactor.toFixed(2)}</div>
                      <div>DD {formatCompactMoney(-item.maxDrawdown)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </PlaygroundCard>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <PlaygroundCard
              title="Feature family depth map"
              subtitle="This is the 3D-ish feature view. X is family slot, Y is total feature strength, bubble size is family density."
            >
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                    <XAxis type="number" dataKey="axisX" stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(value) => String(familyScatter[Math.max(0, Number(value) - 1)]?.family ?? value)} />
                    <YAxis type="number" dataKey="totalStrength" stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(value) => value.toFixed(2)} />
                    <ZAxis type="number" dataKey="bubble" range={[180, 1200]} />
                    <Tooltip
                      cursor={{ strokeDasharray: "4 4" }}
                      contentStyle={{ background: "#08101b", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }}
                      formatter={(value, name) => {
                        if (name === "totalStrength") return [Number(value ?? 0).toFixed(3), "Total strength"];
                        if (name === "bubble") return [Math.round(Number(value ?? 0) / 18), "Feature count"];
                        return [String(value), String(name)];
                      }}
                      labelFormatter={(_, payloadRows) => familyLabel(String(payloadRows?.[0]?.payload?.family ?? "family"))}
                    />
                    <Scatter data={familyScatter}>
                      {familyScatter.map((item) => (
                        <Cell key={item.family} fill={item.color} fillOpacity={0.88} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {familyScatter.slice(0, 3).map((item) => (
                  <div key={item.family} className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{familyLabel(item.family)}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-50">{item.totalStrength.toFixed(3)}</div>
                    <div className="mt-2 text-xs text-slate-400">{item.featureCount} heavy-hitter features across {item.sleeves?.join(" + ")}</div>
                  </div>
                ))}
              </div>
            </PlaygroundCard>

            <PlaygroundCard
              title="Feature rails"
              subtitle="Select a sleeve to inspect its strongest input features, thresholds, and ladder structure."
            >
              <div className="mb-4 flex flex-wrap gap-2">
                {(["rth", "europe"] as SleeveKey[]).map((sleeve) => (
                  <button
                    key={sleeve}
                    type="button"
                    onClick={() => setSelectedSleeve(sleeve)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition",
                      selectedSleeve === sleeve
                        ? "border-transparent bg-white/12 text-slate-50"
                        : "border-white/10 bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200",
                    )}
                  >
                    {sleeve === "rth" ? "RTH sleeve" : "Europe sleeve"}
                  </button>
                ))}
              </div>
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topFeatureBars} layout="vertical" margin={{ top: 10, right: 16, left: 30, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" horizontal={false} />
                    <XAxis type="number" stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(value) => Number(value).toFixed(2)} />
                    <YAxis type="category" dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} width={180} />
                    <Tooltip
                      contentStyle={{ background: "#08101b", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }}
                      formatter={(value) => [Number(value ?? 0).toFixed(3), "Abs strength"]}
                    />
                    <Bar dataKey="absStrength" radius={[0, 10, 10, 0]}>
                      {topFeatureBars.map((item) => (
                        <Cell key={item.feature} fill={dominantColor(item.family, colors)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {artifact ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Size ladder</div>
                    <div className="mt-2 text-lg font-semibold text-slate-100">{artifact.sizeLadder.join(" / ")}</div>
                    <div className="mt-2 text-xs text-slate-400">Thresholds {artifact.thresholds.map((value) => value.toFixed(2)).join(" · ")}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Hold-out snapshot</div>
                    <div className="mt-2 text-lg font-semibold text-slate-100">{formatMoney(artifact.testNet)}</div>
                    <div className="mt-2 text-xs text-slate-400">WR {formatPercent(artifact.testWinRate)} · PF {artifact.testProfitFactor.toFixed(2)}</div>
                  </div>
                </div>
              ) : null}
            </PlaygroundCard>
          </div>

          {artifact ? (
            <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <PlaygroundCard
                title="MLP node brain"
                subtitle="A visual of the selected sleeve’s most active inputs, strongest hidden neurons, and single output probability head."
              >
                <NeuralBrain artifact={artifact} color={selectedSleeve === "rth" ? colors.rth : colors.europe} />
              </PlaygroundCard>

              <PlaygroundCard
                title="Confidence ladder"
                subtitle="This keeps the focus on the strategy. As daily confidence rises, you can see how realized edge, win rate, and feature stress behave."
              >
                <div className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={confidenceBuckets} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis dataKey="bucket" stroke="#94a3b8" tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={formatCompactMoney} />
                      <Tooltip
                        contentStyle={{ background: "#08101b", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }}
                        formatter={(value, name) => {
                          const numeric = Number(value ?? 0);
                          if (name === "Avg daily P&L") return [formatMoney(numeric), "Avg daily P&L"];
                          if (name === "Avg win rate") return [formatPercent(numeric), "Avg win rate"];
                          return [numeric.toLocaleString(), String(name)];
                        }}
                      />
                      <Bar dataKey="avgPnl" radius={[10, 10, 0, 0]} name="Avg daily P&L">
                        {confidenceBuckets.map((bucket) => (
                          <Cell key={bucket.bucket} fill={bucket.avgPnl >= 0 ? colors.combined : "#fb7185"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Best confidence bucket</div>
                    <div className="mt-2 text-2xl font-semibold text-emerald-300">{bestConfidenceBucket ? bestConfidenceBucket.bucket : "n/a"}</div>
                    <div className="mt-2 text-xs text-slate-400">Avg day {bestConfidenceBucket ? formatMoney(bestConfidenceBucket.avgPnl) : "n/a"}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Avg bucket win rate</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-100">{bestConfidenceBucket ? formatPercent(bestConfidenceBucket.avgWinRate) : "n/a"}</div>
                    <div className="mt-2 text-xs text-slate-400">{bestConfidenceBucket ? `${bestConfidenceBucket.days} days, ${bestConfidenceBucket.avgTrades.toFixed(1)} trades/day` : "Strategy bucket stats unavailable"}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Avg feature stress</div>
                    <div className="mt-2 text-2xl font-semibold text-amber-300">{bestConfidenceBucket ? bestConfidenceBucket.avgStress.toFixed(2) : "n/a"}</div>
                    <div className="mt-2 text-xs text-slate-400">Useful for spotting when conviction comes with extra strain.</div>
                  </div>
                </div>
              </PlaygroundCard>
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <PlaygroundCard
              title="Daily dot plot, selectable"
              subtitle="Pick the X-axis that best answers your question. Confidence is the default, but stress, hold time, RVWAP stretch, and trade count are one click away."
            >
              <div className="mb-4 flex flex-wrap gap-3">
                <label className="flex min-w-[260px] flex-1 flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-slate-400">Selected day</span>
                  <select
                    value={selectedDay}
                    onChange={(event) => setSelectedDay(event.target.value)}
                    className="rounded-2xl border border-white/10 bg-[#091221] px-4 py-3 text-sm text-slate-100 outline-none"
                  >
                    {daySelectorOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[260px] flex-1 flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-slate-400">Suggested X-axis</span>
                  <select
                    value={selectedDayXAxis}
                    onChange={(event) => setSelectedDayXAxis(event.target.value as DayXAxisKey)}
                    className="rounded-2xl border border-white/10 bg-[#091221] px-4 py-3 text-sm text-slate-100 outline-none"
                  >
                    {dayXAxisOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2 self-end">
                  {[
                    [payload.dayDefaults.bestDay, "Best"],
                    [payload.dayDefaults.worstDay, "Worst"],
                    [payload.dayDefaults.latestDay, "Latest"],
                  ].map(([day, label]) =>
                    day ? (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"
                      >
                        {label}: {day}
                      </button>
                    ) : null,
                  )}
                </div>
              </div>
              <div className="h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                    <XAxis type="number" dataKey="xValue" stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(value) => selectedDayXAxisOption.format(Number(value))} name={selectedDayXAxisOption.axisLabel} />
                    <YAxis type="number" dataKey="pnl" stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={formatCompactMoney} name="Day P&L" />
                    <ZAxis type="number" dataKey="trades" range={[120, 900]} />
                    <Tooltip
                      cursor={{ strokeDasharray: "4 4" }}
                      contentStyle={{ background: "#08101b", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }}
                      formatter={(value, name) => {
                        const numeric = Number(value ?? 0);
                        if (name === selectedDayXAxisOption.axisLabel) return [selectedDayXAxisOption.format(numeric), selectedDayXAxisOption.tooltipLabel];
                        if (name === "Day P&L") return [formatMoney(numeric), "Day P&L"];
                        return [numeric.toLocaleString(), String(name)];
                      }}
                      labelFormatter={(_, payloadRows) => String(payloadRows?.[0]?.payload?.day ?? "Day")}
                    />
                    <Scatter
                      data={dayScatterData}
                      onClick={(point) => {
                        const day = (point?.payload as DailyDot | undefined)?.day;
                        if (day) {
                          setSelectedDay(day);
                        }
                      }}
                    >
                      {dayScatterData.map((day) => {
                        const color = day.dominantSleeve === "mixed" ? colors.mixed ?? colors.stacked : dominantColor(day.dominantSleeve, colors);
                        const active = day.day === selectedDay;
                        return <Cell key={day.day} fill={color} stroke={active ? "#f8fafc" : "transparent"} strokeWidth={active ? 2 : 0} />;
                      })}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </PlaygroundCard>

            <PlaygroundCard
              title={selectedDayRow ? `Day focus, ${selectedDayRow.day}` : "Day focus"}
              subtitle="This panel turns the selected dot into a readable trading day, with trade timing, confidence, sleeve mix, and realized outcome."
            >
              {selectedDayRow ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Day P&L</div>
                      <div className={cn("mt-2 text-2xl font-semibold", selectedDayRow.pnl >= 0 ? "text-emerald-300" : "text-rose-300")}>{formatMoney(selectedDayRow.pnl)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Avg confidence</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-100">{formatPercent(selectedDayRow.avgProbability)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Feature stress</div>
                      <div className="mt-2 text-2xl font-semibold text-amber-300">{selectedDayRow.featureStress.toFixed(2)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Trades</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-100">{selectedDayRow.trades}</div>
                    </div>
                  </div>
                  <div className="mt-4 h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                        <XAxis type="number" dataKey="entryMinuteEt" stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={formatClock} name="Entry time" domain={[120, 960]} />
                        <YAxis type="number" dataKey="probability" stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} name="Probability" domain={[0.45, 0.85]} />
                        <ZAxis type="number" dataKey="contracts2MnqBase" range={[150, 700]} />
                        <Tooltip
                          cursor={{ strokeDasharray: "4 4" }}
                          contentStyle={{ background: "#08101b", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }}
                          formatter={(value, name) => {
                            const numeric = Number(value ?? 0);
                            if (name === "Probability") return [formatPercent(numeric), "Probability"];
                            if (name === "Entry time") return [formatClock(numeric), "Entry ET"];
                            return [numeric.toLocaleString(), String(name)];
                          }}
                          labelFormatter={(_, payloadRows) => {
                            const item = payloadRows?.[0]?.payload as DayTrade | undefined;
                            return item ? `${item.sleeve.toUpperCase()} · ${item.side} · ${formatMoney(item.pnlDollars2MnqBase)}` : "Trade";
                          }}
                        />
                        <Scatter data={selectedDayTrades}>
                          {selectedDayTrades.map((trade) => (
                            <Cell key={trade.tradeId} fill={dominantColor(trade.sleeve, colors)} />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {selectedDayTrades.slice(0, 6).map((trade) => (
                      <div key={trade.tradeId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#091221]/60 px-4 py-3 text-sm">
                        <div className="flex items-center gap-3">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dominantColor(trade.sleeve, colors) }} />
                          <span className="font-medium text-slate-100">{trade.sleeve.toUpperCase()} {trade.side}</span>
                          <span className="text-slate-400">{formatClock(trade.entryMinuteEt)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-slate-300">
                          <span>{formatPercent(trade.probability)}</span>
                          <span>{trade.contracts2MnqBase} MNQ</span>
                          <span>{trade.exitReason}</span>
                          <span className={trade.pnlDollars2MnqBase >= 0 ? "text-emerald-300" : "text-rose-300"}>{formatMoney(trade.pnlDollars2MnqBase)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4 text-sm text-slate-400">No day payload available yet.</div>
              )}
            </PlaygroundCard>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
            <PlaygroundCard
              title="Why the MLP still matters"
              subtitle="A compact comparison between the current strategy model and the strongest public Pine challenger we found so far."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Strategy model, no stack</div>
                  <div className="mt-2 text-2xl font-semibold text-emerald-300">{formatMoney(payload.summaries.noStack.history.trade_stats.net_pnl)}</div>
                  <div className="mt-2 text-xs text-slate-400">
                    {payload.summaries.noStack.history.trade_stats.trades.toLocaleString()} trades · PF {payload.summaries.noStack.history.trade_stats.profit_factor?.toFixed(2)} · DD {formatCompactMoney(-payload.summaries.noStack.history.trade_stats.max_drawdown_closed_equity)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Public Pine challenger</div>
                  {payload.challengerContext ? (
                    <>
                      <div className="mt-2 text-2xl font-semibold text-fuchsia-300">{formatMoney(payload.challengerContext.totalPnlNative)}</div>
                      <div className="mt-2 text-xs text-slate-400">
                        {payload.challengerContext.strategy} · {payload.challengerContext.market} · PF {payload.challengerContext.profitFactor.toFixed(2)}
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 text-sm text-slate-400">No challenger context loaded.</div>
                  )}
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-[#091221]/60 p-4 text-sm leading-relaxed text-slate-300">
                The main point is not that the MLP wins every beauty contest. It is that once we remove overlap and look at the true strategy event stream, the model still gives us enough edge and enough structure to justify deeper feature and day-level diagnostics here in the Playground.
              </div>
            </PlaygroundCard>

            <PlaygroundCard
              title="What comes next"
              subtitle="This first MLP Playground pass is live data-driven, but there is room to push it much further."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    title: "Live feature tape",
                    body: "Wire the live runner's feature rows into this page so we can watch confidence, size ladder, and sleeve choice update bar by bar.",
                  },
                  {
                    title: "Real 3D surfaces",
                    body: "Promote the feature-family depth map into a proper Plotly or WebGL surface when we want strike-surface style interactivity for model manifolds.",
                  },
                  {
                    title: "Selected-day replay",
                    body: "Add a mini intraday replay strip for the chosen day, so clicking a dot lets you step trade by trade through the model's posture.",
                  },
                  {
                    title: "Parity drift overlay",
                    body: "Overlay local-runner vs reference-backend differences directly on the same day cloud so any future drift pops visually instead of hiding in logs.",
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-[#091221]/75 p-4">
                    <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to="/simulations" className={cn(buttonVariants({ variant: "outline" }), "border-white/15 bg-transparent text-slate-100 hover:bg-white/5")}>
                  Go to Simulations
                </Link>
                <Link to="/" className={cn(buttonVariants({ variant: "default" }), "bg-sky-500/20 text-sky-100 hover:bg-sky-500/30")}>
                  Back Home
                </Link>
              </div>
            </PlaygroundCard>
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-3xl border border-white/10 bg-[#07111f]/80 p-6 text-sm text-slate-400 shadow-[0_30px_90px_rgba(2,6,23,0.35)]">
          {loading ? "Loading the MLP playground payload..." : "Could not load the MLP playground payload yet."}
        </div>
      )}
    </div>
  );
}
