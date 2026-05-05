export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  const amount = Number(value);
  const sign = amount > 0 ? "+" : "";
  return `${sign}$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "n/a";
  return value.replace("T", " ").replace("+00:00", " UTC");
}
