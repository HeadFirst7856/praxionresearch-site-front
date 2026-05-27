import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  max,
  min,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";

export type DateRangeValue = {
  from: Date;
  to: Date;
};

export type SimulationDateRangePreset =
  | "this-week"
  | "last-week"
  | "last-2-weeks"
  | "this-month"
  | "last-month"
  | "last-3-months"
  | "last-6-months"
  | "this-year"
  | "last-year"
  | "all";

export const simulationDateRangePresets: Array<{ value: SimulationDateRangePreset; label: string }> = [
  { value: "this-week", label: "This week" },
  { value: "last-week", label: "Last week" },
  { value: "last-2-weeks", label: "Last 2 weeks" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "last-6-months", label: "Last 6 months" },
  { value: "this-year", label: "This year" },
  { value: "last-year", label: "Last year" },
  { value: "all", label: "All" },
];

export function toIsoDate(value: Date): string {
  return format(value, "yyyy-MM-dd");
}

export function defaultLastYearRange(reference = new Date()): DateRangeValue {
  return {
    from: subYears(reference, 1),
    to: reference,
  };
}

export function defaultThisYearRange(reference = new Date()): DateRangeValue {
  return presetDateRange("this-year", reference);
}

export function presetDateRange(preset: SimulationDateRangePreset, reference = new Date()): DateRangeValue {
  const today = reference;
  const sundayWeekOptions = { weekStartsOn: 0 as const };

  if (preset === "this-week") {
    return {
      from: startOfWeek(today, sundayWeekOptions),
      to: today,
    };
  }

  if (preset === "last-week") {
    const lastWeek = subWeeks(today, 1);
    return {
      from: startOfWeek(lastWeek, sundayWeekOptions),
      to: endOfWeek(lastWeek, sundayWeekOptions),
    };
  }

  if (preset === "last-2-weeks") {
    const previousWeek = subWeeks(today, 1);
    return {
      from: startOfWeek(subWeeks(today, 2), sundayWeekOptions),
      to: endOfWeek(previousWeek, sundayWeekOptions),
    };
  }

  if (preset === "this-month") {
    return {
      from: startOfMonth(today),
      to: today,
    };
  }

  if (preset === "last-month") {
    const lastMonth = subMonths(today, 1);
    return {
      from: startOfMonth(lastMonth),
      to: endOfMonth(lastMonth),
    };
  }

  if (preset === "last-3-months") {
    return {
      from: subMonths(today, 3),
      to: today,
    };
  }

  if (preset === "last-6-months") {
    return {
      from: subMonths(today, 6),
      to: today,
    };
  }

  if (preset === "this-year") {
    return {
      from: startOfYear(today),
      to: today,
    };
  }

  if (preset === "last-year") {
    const lastYear = subYears(today, 1);
    return {
      from: startOfYear(lastYear),
      to: endOfYear(lastYear),
    };
  }

  return {
    from: new Date("2020-01-01T12:00:00"),
    to: today,
  };
}

export function clampRangeToToday(range: DateRangeValue, reference = new Date()): DateRangeValue {
  return {
    from: min([range.from, reference]),
    to: max([min([range.to, reference]), min([range.from, reference])]),
  };
}

export function formatRangeLabel(range: DateRangeValue): string {
  return `${toIsoDate(range.from)} → ${toIsoDate(range.to)}`;
}
