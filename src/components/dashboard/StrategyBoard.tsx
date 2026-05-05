import { StrategySlotCard } from "@/components/dashboard/StrategySlotCard";
import type { StrategySlot } from "@/mocks/dashboardMocks";

type Props = {
  slots: StrategySlot[];
  loading?: boolean;
};

export function StrategyBoard({ slots, loading }: Props) {
  return (
    <section id="strategies" className="mt-8">
      <h2 className="text-3xl font-semibold">Strategy board</h2>
      <p className="mt-3 max-w-4xl text-muted-foreground">
        Um cartão por estratégia, com métricas e trades recentes devolvidos pelo backend (paridade com{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">StrategySimulator.simulate_all</code>).
      </p>
      {loading && slots.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">A carregar estratégias…</p>
      ) : null}
      {!loading && slots.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Sem slots no payload (ou erro ao carregar).</p>
      ) : null}
      <div className="mt-5 grid gap-5">
        {slots.map((slot, index) => (
          <StrategySlotCard key={slot.key} slot={slot} index={index} />
        ))}
      </div>
    </section>
  );
}
