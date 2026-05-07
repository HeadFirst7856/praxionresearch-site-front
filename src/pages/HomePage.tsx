import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { fetchUserOverview, type OverviewAccount, type UserOverview } from "@/api/me";
import type { AccountPositionsPayload } from "@/api/platforms";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccountDetailSection } from "@/components/platforms/AccountDetailSection";
import { AddPlatformModal } from "@/components/platforms/AddPlatformModal";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PANEL_ANIM_MS = 220;

function PublicHome() {
  return (
    <div>
      <section className="py-24">
        <div className="page-container">
          <div className="glass-panel mx-auto max-w-5xl px-6 py-14 text-center md:px-12">
            <p className="mb-4 text-xs uppercase tracking-[0.14em] text-sky-300">Research-Driven Trading Infrastructure</p>
            <h1 className="mb-5 text-[clamp(3rem,8vw,5.8rem)] leading-[0.92] font-semibold tracking-tight">
              Modern systematic trading,
              <br />
              built with discipline.
            </h1>
            <p className="mx-auto max-w-3xl text-lg leading-relaxed text-slate-300">
              Praxion Research develops research-led trading systems, live monitoring, and execution infrastructure with
              an institutional standard for clarity, risk, and operational control.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/simulations"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "rounded-full bg-sky-500/20 px-4 text-sky-100 hover:bg-sky-500/30",
                )}
              >
                Simulations
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-8">
        <div className="page-container">
          <div className="glass-panel p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Approach", value: "Research First" },
                { label: "Focus", value: "Live Benchmarking" },
                { label: "Build", value: "Execution Stack" },
                { label: "Access", value: "Private Simulations", tone: "text-amber-300" },
              ].map((kpi) => (
                <div key={kpi.label} className="kpi-card">
                  <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{kpi.label}</div>
                  <div className={`mt-2 text-2xl font-semibold ${kpi.tone ?? ""}`}>{kpi.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function typeBadgeClass(t: string): string {
  if (t === "funded") return "border-amber-400/40 text-amber-200";
  if (t === "combine") return "border-sky-400/40 text-sky-100";
  if (t === "practice") return "border-emerald-400/35 text-emerald-100";
  if (t === "express") return "border-violet-400/40 text-violet-100";
  return "border-white/15 text-slate-300";
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

function applyPositionsToOverview(
  prev: UserOverview,
  platformId: number,
  accountId: number,
  data: AccountPositionsPayload,
): UserOverview {
  return {
    ...prev,
    platforms: prev.platforms.map((p) =>
      p.platform_id !== platformId
        ? p
        : {
            ...p,
            accounts: p.accounts.map((a) =>
              a.id !== accountId
                ? a
                : {
                    ...a,
                    open_positions: data.open_positions,
                    closed_trades_90d: data.closed_trades,
                    trades_count: data.trades_count,
                    trades_pnl_total: data.trades_pnl_total,
                    pnl_90d_net: data.pnl_90d_net,
                    pnl_day_net: data.pnl_day_net,
                    pnl_week_net: data.pnl_week_net,
                    pnl_month_net: data.pnl_month_net,
                    win_rate: data.win_rate,
                    payoff_ratio: data.payoff_ratio,
                    profit_factor: data.profit_factor,
                    operational_cost: data.operational_cost,
                    intrinsic_risk: data.intrinsic_risk,
                    fetch_error: null,
                  },
            ),
          },
    ),
  };
}

function AccountSummaryCard({
  account,
  onOpen,
  selected,
}: {
  account: OverviewAccount;
  onOpen: () => void;
  selected?: boolean;
}) {
  const inferredStart = inferStartingBalanceFromName(account.name);
  const balanceDelta = inferredStart != null && account.balance != null ? account.balance - inferredStart : null;
  const headlineValue = balanceDelta ?? account.pnl_90d_net ?? account.trades_pnl_total;
  const headlineLabel = balanceDelta != null ? "Net vs Start" : "P&L 90d Net";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group w-full rounded-lg border bg-[#0a1424]/80 p-4 text-left transition hover:border-sky-500/30 hover:bg-[#0c1829]/90",
        selected ? "border-sky-500/50 ring-1 ring-sky-500/30" : "border-white/8",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-slate-100">{account.name}</div>
          <Badge variant="outline" className={cn("mt-1 rounded-sm text-[10px] uppercase tracking-wider", typeBadgeClass(account.inferred_type))}>
            {account.inferred_type}
          </Badge>
        </div>
        <div className="text-right text-sm text-slate-400">
          <div className="text-slate-200">{formatMoney(account.balance)}</div>
          <div className="mt-1 text-[11px]">Bal</div>
        </div>
      </div>
      <div
        className={cn(
          "mt-3 grid gap-2 border-t border-white/5 pt-3 text-center text-[11px] uppercase tracking-wider text-slate-500",
          account.open_positions.length > 0 ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        <div>
          <div className="text-sm font-semibold text-slate-200">{account.trades_count}</div>
          <div>Trades 90d</div>
        </div>
        <div>
          <div className={`text-sm font-semibold ${headlineValue >= 0 ? "text-emerald-300/90" : "text-rose-300/90"}`}>
            {formatMoney(headlineValue)}
          </div>
          <div>{headlineLabel}</div>
        </div>
        {account.open_positions.length > 0 ? (
          <div>
            <div className="text-sm font-semibold text-amber-200/90">{account.open_positions.length}</div>
            <div>Open</div>
          </div>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/5 pt-2 text-[10px] text-slate-400">
        <div>
          D/W/M Net:{" "}
          <span className="text-slate-200">
            {formatMoney(account.pnl_day_net)} / {formatMoney(account.pnl_week_net)} / {formatMoney(account.pnl_month_net)}
          </span>
        </div>
        <div>
          Win: <span className="text-slate-200">{formatPct(account.win_rate)}</span>
        </div>
        <div>
          Payoff / PF:{" "}
          <span className="text-slate-200">
            {formatRatio(account.payoff_ratio)} / {formatRatio(account.profit_factor)}
          </span>
        </div>
        <div>
          Op. Cost: <span className="text-slate-200">{formatMoney(account.operational_cost?.total)}</span>
        </div>
        <div className="col-span-2">
          Risk:{" "}
          <span className="text-slate-200">
            Max Loss {formatMoney(account.intrinsic_risk?.max_loss)}, Max Gain {formatMoney(account.intrinsic_risk?.max_gain)},
            Losing Streak {account.intrinsic_risk?.max_consecutive_losses ?? "—"}
          </span>
        </div>
      </div>
      {account.fetch_error ? (
        <p className="mt-2 text-[11px] text-amber-300/90">Warning: {account.fetch_error}</p>
      ) : null}
      <p className="mt-2 text-[10px] text-slate-500 opacity-0 transition group-hover:opacity-100">
        {selected ? "Click again to collapse" : "View trades →"}
      </p>
    </button>
  );
}

function UserDashboard() {
  const { name } = useAuth();
  const [overview, setOverview] = useState<UserOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<{ platformId: number; account: OverviewAccount } | null>(null);
  const [visibleSelected, setVisibleSelected] = useState<{ platformId: number; account: OverviewAccount } | null>(null);
  const [panelClosing, setPanelClosing] = useState(false);
  const panelTimerRef = useRef<number | null>(null);
  const panelRafRef = useRef<number | null>(null);

  const loadOverview = useCallback(async (refresh = false) => {
    if (!refresh) {
      setLoading(true);
    }
    try {
      const data = await fetchUserOverview(refresh);
      setOverview(data);
      setLoadError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load overview";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  useEffect(
    () => () => {
      if (panelTimerRef.current != null) {
        window.clearTimeout(panelTimerRef.current);
      }
      if (panelRafRef.current != null) {
        window.cancelAnimationFrame(panelRafRef.current);
      }
    },
    [],
  );

  const playOpenAnimation = useCallback(() => {
    setPanelClosing(true);
    if (panelRafRef.current != null) {
      window.cancelAnimationFrame(panelRafRef.current);
    }
    panelRafRef.current = window.requestAnimationFrame(() => {
      setPanelClosing(false);
    });
  }, []);

  const transitionSelection = useCallback(
    (next: { platformId: number; account: OverviewAccount } | null) => {
      setSelected(next);
      const sameSelection =
        next &&
        visibleSelected &&
        next.platformId === visibleSelected.platformId &&
        next.account.id === visibleSelected.account.id;

      if ((next && !visibleSelected) || (!next && !visibleSelected) || sameSelection) {
        setVisibleSelected(next);
        if (next && !sameSelection) {
          playOpenAnimation();
        } else {
          setPanelClosing(false);
        }
        return;
      }

      setPanelClosing(true);
      if (panelTimerRef.current != null) {
        window.clearTimeout(panelTimerRef.current);
      }
      panelTimerRef.current = window.setTimeout(() => {
        setVisibleSelected(next);
        if (next) {
          playOpenAnimation();
        } else {
          setPanelClosing(false);
        }
      }, PANEL_ANIM_MS);
    },
    [playOpenAnimation, visibleSelected],
  );

  const onPositionsUpdated = useCallback((platformId: number, accountId: number, payload: AccountPositionsPayload) => {
    setOverview((prev) => (prev ? applyPositionsToOverview(prev, platformId, accountId, payload) : prev));
  }, []);

  return (
    <div className="pb-16 pt-10">
      <div className="page-container space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-sky-400/90">Your workspace</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-50 md:text-4xl">
              Welcome{name ? `, ${name}` : ""}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">Linked evaluation and funded accounts across your connected platforms.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/15 bg-white/5"
              disabled={loading}
              onClick={() => void loadOverview(true)}
            >
              Refresh
            </Button>
            <Button type="button" className="bg-sky-500/25 text-sky-50 hover:bg-sky-500/35" onClick={() => setAddOpen(true)}>
              Add platform
            </Button>
          </div>
        </div>

        {loading && !overview ? (
          <div className="glass-panel space-y-4 p-6">
            <div className="h-6 w-48 animate-pulse rounded-md bg-white/10" />
            <div className="h-32 animate-pulse rounded-lg bg-white/5" />
            <div className="h-32 animate-pulse rounded-lg bg-white/5" />
          </div>
        ) : null}

        {!loading && !overview && loadError ? (
          <div className="glass-panel flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-rose-200/90">{loadError}</p>
            <Button type="button" variant="outline" className="border-white/15" onClick={() => void loadOverview(false)}>
              Retry
            </Button>
          </div>
        ) : null}

        {!loading && overview && overview.platforms.length === 0 ? (
          <div className="glass-panel flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
            <p className="max-w-lg text-center text-xl font-medium tracking-tight text-slate-200 md:text-2xl">
              No platforms connected
            </p>
            <Button type="button" className="bg-sky-500/25 text-sky-50 hover:bg-sky-500/35" onClick={() => setAddOpen(true)}>
              Add platform
            </Button>
          </div>
        ) : null}

        {overview && overview.platforms.length > 0 ? (
          <div className="space-y-6">
            {overview.platforms.map((plat) => (
              <section key={plat.platform_id} className="glass-panel overflow-hidden">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-5 py-4">
                  <div>
                    <h2 className="text-lg font-medium text-slate-100">{plat.label || plat.platform_type}</h2>
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{plat.platform_type}</p>
                  </div>
                  {plat.status === "ok" ? (
                    <span className="text-xs font-medium uppercase tracking-wider text-emerald-400/90">Live</span>
                  ) : plat.status === "unsupported" ? (
                    <span className="text-xs text-amber-300/90">Unsupported</span>
                  ) : (
                    <span className="text-xs text-rose-300/90">Error</span>
                  )}
                </header>
                {plat.error ? <p className="border-b border-rose-500/20 bg-rose-950/20 px-5 py-2 text-sm text-rose-200/90">{plat.error}</p> : null}
                <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {plat.accounts.length === 0 && plat.status === "ok" ? (
                    <p className="text-sm text-slate-500">No accounts returned for this connection.</p>
                  ) : null}
                  {plat.accounts.map((acct) => {
                    const isSelected =
                      selected?.platformId === plat.platform_id && selected.account.id === acct.id;
                    return (
                      <AccountSummaryCard
                        key={acct.id}
                        account={acct}
                        selected={isSelected}
                        onOpen={() => {
                          const next =
                            selected?.platformId === plat.platform_id && selected.account.id === acct.id
                              ? null
                              : { platformId: plat.platform_id, account: acct };
                          transitionSelection(next);
                        }}
                      />
                    );
                  })}
                </div>
                {visibleSelected?.platformId === plat.platform_id && overview ? (
                  <div
                    className={cn(
                      "border-t border-white/5 px-5 pb-5 pt-5 transition-all duration-200 ease-out",
                      panelClosing ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100",
                    )}
                    style={{ transitionDuration: `${PANEL_ANIM_MS}ms` }}
                  >
                    <AccountDetailSection
                      key={visibleSelected.account.id}
                      platformId={plat.platform_id}
                      account={
                        overview.platforms
                          .find((p) => p.platform_id === plat.platform_id)
                          ?.accounts.find((a) => a.id === visibleSelected.account.id) ?? visibleSelected.account
                      }
                      onPositionsUpdated={onPositionsUpdated}
                      onPlatformRemoved={async () => {
                        transitionSelection(null);
                        await loadOverview(true);
                      }}
                      onDismiss={() => transitionSelection(null)}
                    />
                  </div>
                ) : null}
              </section>
            ))}
            {overview.from_cache ? (
              <p className="text-center text-[11px] uppercase tracking-wider text-slate-600">Showing cached snapshot — use Refresh to pull latest.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <AddPlatformModal open={addOpen} onOpenChange={setAddOpen} onCreated={() => void loadOverview(true)} />
    </div>
  );
}

export function HomePage() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <PublicHome />;
  }
  return <UserDashboard />;
}
