import { extractApiError } from "@/api/auth";
import type {
  AccountIntrinsicRisk,
  AccountOperationalCost,
  OverviewClosedTrade,
  OverviewOpenPosition,
} from "@/api/me";
import { apiFetch } from "@/lib/api";

export type CredentialFieldSchema = {
  name: string;
  label: string;
  type: string;
  secret: boolean;
};

export type PlatformTypeSchema = {
  type: string;
  display_name: string;
  fields: CredentialFieldSchema[];
};

export type UserPlatformRow = {
  id: number;
  platform_type: string;
  label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  selected_account_ids: number[];
};

export type AccountSummary = {
  id: number;
  name: string;
  balance: number | null;
  can_trade: boolean;
  is_visible: boolean;
  inferred_type: string;
};

export type AccountPositionsPayload = {
  open_positions: OverviewOpenPosition[];
  closed_trades: OverviewClosedTrade[];
  days: number;
  trades_count: number;
  trades_pnl_total: number;
  pnl_90d_net: number;
  pnl_day_net: number;
  pnl_week_net: number;
  pnl_month_net: number;
  win_rate: number | null;
  payoff_ratio: number | null;
  profit_factor: number | null;
  operational_cost: AccountOperationalCost;
  intrinsic_risk: AccountIntrinsicRisk;
};

export async function listPlatformTypes(): Promise<PlatformTypeSchema[]> {
  const res = await apiFetch("/api/v1/platforms/types");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${extractApiError(text)}`);
  }
  return (await res.json()) as PlatformTypeSchema[];
}

export async function listPlatforms(): Promise<UserPlatformRow[]> {
  const res = await apiFetch("/api/v1/platforms/");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${extractApiError(text)}`);
  }
  return (await res.json()) as UserPlatformRow[];
}

export type CreatePlatformPayload = {
  platform_type: string;
  label: string;
  credentials: Record<string, string>;
  selected_account_ids?: number[];
};

export type TopstepSearchAccountsPayload = {
  user_name: string;
  api_key: string;
};

export async function searchTopstepAccounts(payload: TopstepSearchAccountsPayload): Promise<AccountSummary[]> {
  const res = await apiFetch("/api/v1/platforms/topstep/search-accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${extractApiError(text)}`);
  }
  return (await res.json()) as AccountSummary[];
}

export async function createPlatform(payload: CreatePlatformPayload): Promise<UserPlatformRow> {
  const res = await apiFetch("/api/v1/platforms/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${extractApiError(text)}`);
  }
  return (await res.json()) as UserPlatformRow;
}

export async function deletePlatform(platformId: number): Promise<void> {
  const res = await apiFetch(`/api/v1/platforms/${platformId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`${res.status}: ${extractApiError(text)}`);
  }
}

export async function fetchAccountPositions(
  platformId: number,
  accountId: number,
  days = 90,
  refresh = false,
): Promise<AccountPositionsPayload> {
  const qs = new URLSearchParams({ days: String(days), refresh: String(refresh) });
  const res = await apiFetch(`/api/v1/platforms/${platformId}/accounts/${accountId}/positions?${qs.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${extractApiError(text)}`);
  }
  return (await res.json()) as AccountPositionsPayload;
}
