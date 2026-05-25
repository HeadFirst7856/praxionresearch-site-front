import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarDays, CalendarIcon, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  defaultLastYearRange,
  formatRangeLabel,
  presetDateRange,
  simulationDateRangePresets,
  toIsoDate,
  type DateRangeValue,
  type SimulationDateRangePreset,
} from "@/lib/simulationDateRange";
import { cn } from "@/lib/utils";

export type AppliedDateRange = {
  from: string;
  to: string;
};

type Props = {
  appliedRange: AppliedDateRange | null;
  loading?: boolean;
  onApply: (range: AppliedDateRange) => void;
};

function toPickerRange(range: DateRangeValue): DateRange {
  return { from: range.from, to: range.to };
}

function fromPickerRange(range: DateRange | undefined): DateRangeValue | null {
  if (!range?.from || !range?.to) {
    return null;
  }
  return { from: range.from, to: range.to };
}

function isPreset(value: unknown): value is SimulationDateRangePreset {
  return typeof value === "string" && simulationDateRangePresets.some((preset) => preset.value === value);
}

export function SimulationDateRangeFilter({ appliedRange, loading, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<SimulationDateRangePreset | null>(null);
  const [draft, setDraft] = useState<DateRange | undefined>(() => toPickerRange(defaultLastYearRange()));

  useEffect(() => {
    if (appliedRange) {
      setDraft({
        from: new Date(`${appliedRange.from}T12:00:00`),
        to: new Date(`${appliedRange.to}T12:00:00`),
      });
    }
  }, [appliedRange?.from, appliedRange?.to]);

  const draftValue = fromPickerRange(draft);
  return (
    <div
      className={cn(
        "sticky top-18 z-40 -mx-4 mt-6 border-y border-slate-500/25 bg-[#060d18]/92 px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.26)] backdrop-blur-xl",
        "supports-[backdrop-filter]:bg-[#060d18]/78",
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-slate-200/20" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-black/80" />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-200">
            <CalendarDays className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100">Date Filter</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(11rem,12rem)_minmax(14rem,auto)_auto] sm:items-center">
          <Select
            value={selectedPreset}
            onValueChange={(value: unknown) => {
              if (!isPreset(value)) {
                return;
              }
              const range = presetDateRange(value);
              setSelectedPreset(value);
              setDraft(toPickerRange(range));
              onApply({ from: toIsoDate(range.from), to: toIsoDate(range.to) });
            }}
            disabled={loading}
          >
            <SelectTrigger
              aria-label="Preset date range"
              size="sm"
              className="h-9 border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]"
            >
              <SelectValue placeholder="Preset range" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0b1424] text-slate-100" positionerClassName="z-[110]">
              {simulationDateRangePresets.map((preset) => (
                <SelectItem key={preset.value} value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger className="inline-flex w-full sm:w-auto">
              <Button
                variant="outline"
                size="lg"
                className="h-9 w-full justify-start gap-2 border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08] sm:w-auto"
                disabled={loading}
                type="button"
              >
                <CalendarIcon className="h-4 w-4" />
                <span className="truncate">{draftValue ? formatRangeLabel(draftValue) : "Pick dates"}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                defaultMonth={draft?.from}
                selected={draft}
                onSelect={(range) => {
                  setSelectedPreset(null);
                  setDraft(range);
                }}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
              />
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            className="gap-2"
            disabled={loading || !draftValue}
            onClick={() => {
              if (!draftValue) {
                return;
              }
              onApply({ from: toIsoDate(draftValue.from), to: toIsoDate(draftValue.to) });
              setOpen(false);
            }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
