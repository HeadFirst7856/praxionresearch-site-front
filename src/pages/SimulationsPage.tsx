import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { StrategyAccordion } from "@/components/dashboard/StrategyAccordion";
import {
  SimulationDateRangeFilter,
  type AppliedDateRange,
} from "@/components/dashboard/SimulationDateRangeFilter";
import { fetchSimulationDashboard } from "@/api/simulationDashboard";
import {
  effectiveContracts,
  mapSimulationDashboard,
  projectSlotContracts,
  sanitizeContractInput,
} from "@/lib/mapSimulationDashboard";
import { defaultThisYearRange, toIsoDate } from "@/lib/simulationDateRange";
import type { StrategySlot } from "@/mocks/dashboardMocks";
import type { DashboardOverviewData } from "@/lib/mapSimulationDashboard";

const emptyOverview: DashboardOverviewData = {
  strategyName: "—",
  strategySubtitle: "—",
  accountBalance: null,
  accountStatus: "—",
  totalSimPnl: 0,
};

function toAppliedRange(range = defaultThisYearRange()): AppliedDateRange {
  return {
    from: toIsoDate(range.from),
    to: toIsoDate(range.to),
  };
}

export function SimulationsPage() {
  const defaultRange = useMemo(() => toAppliedRange(), []);
  const [slots, setSlots] = useState<StrategySlot[] | null>(null);
  const [overview, setOverview] = useState<DashboardOverviewData>(emptyOverview);
  const [appliedRange, setAppliedRange] = useState<AppliedDateRange>(defaultRange);
  const [contractOverrides, setContractOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);

  const loadDashboard = useCallback(
    async (range: AppliedDateRange, options: { resetContracts?: boolean; silent?: boolean } = {}) => {
      if (refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = true;
      if (!options.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const payload = await fetchSimulationDashboard({ from: range.from, to: range.to });
        const mapped = mapSimulationDashboard(payload);
        setSlots(mapped.slots);
        if (options.resetContracts) {
          setContractOverrides({});
        }
        setOverview(mapped.overview);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        if (!options.silent) {
          setSlots([]);
        }
      } finally {
        refreshInFlightRef.current = false;
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadDashboard(defaultRange, { resetContracts: true });
  }, [defaultRange, loadDashboard]);

  const safeSlots = useMemo(() => slots ?? [], [slots]);
  const hasLiveTrade = useMemo(
    () =>
      safeSlots.some((slot) =>
        slot.positions.some((position) => position.isOpen || position.exit.toLowerCase() === "live"),
      ),
    [safeSlots],
  );
  const projectedSlots = useMemo(
    () => safeSlots.map((slot) => projectSlotContracts(slot, effectiveContracts(contractOverrides[slot.key]))),
    [contractOverrides, safeSlots],
  );
  const projectedOverview = useMemo(
    () => ({
      ...overview,
      totalSimPnl: projectedSlots.reduce((sum, slot) => sum + slot.continuousPnl, 0),
    }),
    [overview, projectedSlots],
  );

  const updateContractOverride = useCallback((strategyKey: string, value: string) => {
    const masked = sanitizeContractInput(value);
    setContractOverrides((current) => ({ ...current, [strategyKey]: masked }));
  }, []);

  useEffect(() => {
    if (!hasLiveTrade) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void loadDashboard(appliedRange, { silent: true });
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [appliedRange, hasLiveTrade, loadDashboard]);

  return (
    <div className="page-container py-14">
      <h1 className="text-[clamp(2.2rem,6vw,3.9rem)] leading-tight font-semibold">Simulations</h1>

      <SimulationDateRangeFilter
        appliedRange={appliedRange}
        loading={loading}
        onApply={(range) => {
          setAppliedRange(range);
          void loadDashboard(range);
        }}
      />

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
        <DashboardOverview overview={projectedOverview} slots={projectedSlots} />
      </div>
      <StrategyAccordion
        slots={projectedSlots}
        loading={loading}
        contractInputs={contractOverrides}
        onContractInputChange={updateContractOverride}
      />
    </div>
  );
}
