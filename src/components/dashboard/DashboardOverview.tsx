import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { DashboardOverviewData } from "@/lib/mapSimulationDashboard";

type Props = {
  overview: DashboardOverviewData;
  loading?: boolean;
};

export function DashboardOverview({ overview, loading }: Props) {
  return (
    <section id="overview" className="overflow-hidden rounded-3xl border border-border bg-[#080d18f0]">
      <div className="flex flex-col justify-between gap-4 border-b border-border px-5 py-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-2xl font-bold">dash.praxionresearch.com</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "A carregar dados do backend…" : "Dados do backend · simulação bar-core (bars persistidos)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Source: API</Badge>
          <Badge variant="outline">GET /api/v1/simulation/dashboard</Badge>
          <Badge variant="outline">Simulação: StrategySimulator</Badge>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-3">
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Resumo</div>
          <div className="mt-2 text-2xl font-semibold">{overview.strategyName}</div>
          <div className="mt-2 text-sm text-muted-foreground">{overview.strategySubtitle}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Conta (live)</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-400">
            {overview.accountBalance != null ? formatMoney(overview.accountBalance) : "—"}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">{overview.accountStatus}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">P&amp;L contínuo (sim · agregado)</div>
          <div
            className={`mt-2 text-2xl font-semibold ${overview.totalSimPnl >= 0 ? "text-sky-300" : "text-amber-400"}`}
          >
            {formatMoney(overview.totalSimPnl)}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {overview.barsProcessed != null ? `${overview.barsProcessed.toLocaleString("pt-BR")} bars · ` : ""}
            {overview.closedTrades != null ? `${overview.closedTrades} trades fechados` : "Métricas do summary"}
          </div>
        </div>
      </div>
    </section>
  );
}
