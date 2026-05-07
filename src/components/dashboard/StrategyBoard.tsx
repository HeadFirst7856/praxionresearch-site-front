import { StrategySlotCard } from "@/components/dashboard/StrategySlotCard";
import type { StrategySlot } from "@/mocks/dashboardMocks";

type Props = {
  slots: StrategySlot[];
  loading?: boolean;
};

export function StrategyBoard({ slots, loading }: Props) {
  return (
    <section id="strategies" className="mt-8 overflow-x-hidden">
      <h2 className="text-3xl font-semibold">Strategy board</h2>
      {loading && slots.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading strategies…</p>
      ) : null}
      {!loading && slots.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No strategies in the response (or failed to load).</p>
      ) : null}
      <div className="mt-5 grid gap-5">
        {slots.map((slot, index) => (
          <StrategySlotCard key={slot.key} slot={slot} index={index} />
        ))}
      </div>
    </section>
  );
}
