import { useState } from "react";
import { StrategySlotCard } from "@/components/dashboard/StrategySlotCard";
import type { StrategySlot } from "@/mocks/dashboardMocks";

type Props = {
  slots: StrategySlot[];
  loading?: boolean;
  contractInputs?: Record<string, string>;
  onContractInputChange?: (strategyKey: string, value: string) => void;
};

export function StrategyAccordion({ slots, loading, contractInputs = {}, onContractInputChange }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const toggleExpanded = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  if (loading && slots.length === 0) {
    return (
      <section className="mt-8">
        <h2 className="text-3xl font-semibold">Strategies</h2>
        <p className="mt-6 text-sm text-muted-foreground">Loading strategies…</p>
      </section>
    );
  }

  if (!loading && slots.length === 0) {
    return (
      <section className="mt-8">
        <h2 className="text-3xl font-semibold">Strategies</h2>
        <p className="mt-6 text-sm text-muted-foreground">No strategies in the response (or failed to load).</p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="mb-5 text-3xl font-semibold">Strategies</h2>
      <div className="flex flex-col gap-5">
        {slots.map((slot, index) => (
          <StrategySlotCard
            key={slot.key}
            slot={slot}
            index={index}
            expanded={expandedKey === slot.key}
            onToggle={() => toggleExpanded(slot.key)}
            contractInput={contractInputs[slot.key] ?? "1"}
            onContractInputChange={(value) => onContractInputChange?.(slot.key, value)}
          />
        ))}
      </div>
    </section>
  );
}
