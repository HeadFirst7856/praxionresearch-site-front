import { extractApiError } from "@/api/auth";
import { apiFetch } from "@/lib/api";

export type OverviewOpenPosition = {
  id?: number | null;
  account_id?: number | null;
  contract_id?: string | null;
  /** Tradovate-style e.g. `/MES` when derivable from contract_id */
  symbol?: string | null;
  creation_timestamp?: string | null;
  type?: number | null;
  size?: number | null;
  average_price?: number | null;
};

export type OverviewClosedTrade = {
  id?: number | null;
  contract_id?: string | null;
  symbol?: string | null;
  /** Round-trip hold time in minutes (FIFO paired legs when API omits explicit duration). */
  duration_minutes?: number | null;
  /** Present only if TopstepX returns explicit entry/exit fields on the trade object. */
  entry_timestamp?: string | null;
  exit_timestamp?: string | null;
  creation_timestamp?: string | null;
  price?: number | null;
  pnl?: number | null;
  fees?: number | null;
  commissions?: number | null;
  side?: number | null;
  size?: number | null;
  voided?: boolean;
  order_id?: number | null;
};

export type AccountOperationalCost = {
  fees_total: number;
  commissions_total: number;
  total: number;
};

export type AccountIntrinsicRisk = {
  max_loss: number | null;
  max_gain: number | null;
  max_consecutive_losses: number;
};

export type OverviewAccount = {
  id: number;
  name: string;
  balance: number | null;
  can_trade: boolean;
  is_visible: boolean;
  inferred_type: string;
  open_positions: OverviewOpenPosition[];
  closed_trades_90d: OverviewClosedTrade[];
  trades_count: number;
  trades_pnl_total: number;
  pnl_90d_net?: number;
  pnl_day_net?: number;
  pnl_week_net?: number;
  pnl_month_net?: number;
  win_rate?: number | null;
  payoff_ratio?: number | null;
  profit_factor?: number | null;
  operational_cost?: AccountOperationalCost;
  intrinsic_risk?: AccountIntrinsicRisk;
  fetch_error: string | null;
};

export type OverviewPlatform = {
  platform_id: number;
  platform_type: string;
  label: string;
  status: string;
  error: string | null;
  accounts: OverviewAccount[];
};

export type UserOverview = {
  user: { id: number; username: string; name: string };
  platforms: OverviewPlatform[];
  fetched_at: string;
  from_cache: boolean;
};

export async function fetchUserOverview(refresh = false): Promise<UserOverview> {
  const qs = refresh ? "refresh=true" : "refresh=false";
  const res = await apiFetch(`/api/v1/me/overview?${qs}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${extractApiError(text)}`);
  }
  return (await res.json()) as UserOverview;
}
