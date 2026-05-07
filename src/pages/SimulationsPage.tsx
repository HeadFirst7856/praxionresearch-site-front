import { useEffect, useMemo, useState } from "react";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { StrategyBoard } from "@/components/dashboard/StrategyBoard";
import { fetchSimulationDashboard } from "@/api/simulationDashboard";
import { mapSimulationDashboard } from "@/lib/mapSimulationDashboard";
import type { StrategySlot } from "@/mocks/dashboardMocks";
import type { DashboardOverviewData } from "@/lib/mapSimulationDashboard";

const emptyOverview: DashboardOverviewData = {
  strategyName: "—",
  strategySubtitle: "—",
  accountBalance: null,
  accountStatus: "—",
  totalSimPnl: 0,
};

export function SimulationsPage() {
  const [slots, setSlots] = useState<StrategySlot[] | null>(null);
  const [overview, setOverview] = useState<DashboardOverviewData>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSimulationDashboard()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const mapped = mapSimulationDashboard(payload);
        setSlots(mapped.slots);
        setOverview(mapped.overview);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setSlots([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const safeSlots = useMemo(() => slots ?? [], [slots]);

  return (
    <div className="page-container overflow-x-hidden py-14">
      <h1 className="text-[clamp(2.2rem,6vw,3.9rem)] leading-tight font-semibold">Simulations</h1>

      {error ? (
        <div
          className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          <p className="font-medium">Could not load simulations</p>
          <p className="mt-1 font-mono text-xs text-amber-200/90">{error}</p>
        </div>
      ) : null}

      <div className="mt-7">
        <DashboardOverview overview={overview} slots={safeSlots} />
      </div>
      <StrategyBoard slots={safeSlots} loading={loading} />
    </div>
  );
}
