import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export type LiveAccountSummary = {
  balance: number | null;
  pnl_day: number | null;
  pnl_week: number | null;
  pnl_month: number | null;
  pnl_90d: number | null;
  open_positions: number;
  trades_90d: number;
  platforms: number;
  fetched_at: string | null;
  from_cache: boolean;
  offline: boolean;
  error: string | null;
};

const EMPTY: LiveAccountSummary = {
  balance: null, pnl_day: null, pnl_week: null, pnl_month: null, pnl_90d: null,
  open_positions: 0, trades_90d: 0, platforms: 0, fetched_at: null,
  from_cache: false, offline: true, error: null,
};

/** Poll the live account overview (backend /api/v1/me/overview). */
export function useLiveAccount(intervalMs = 60_000): LiveAccountSummary {
  const [state, setState] = useState<LiveAccountSummary>(EMPTY);
  const timer = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/me/overview", {}, true);
      if (!res.ok) {
        setState((s) => ({ ...s, offline: true, error: `HTTP ${res.status}` }));
        return;
      }
      const data = (await res.json()) as {
        fetched_at?: string; from_cache?: boolean;
        platforms?: Array<{ platform_type: string; label: string; accounts: Array<{
          balance?: number | null; pnl_day_net?: number | null; pnl_week_net?: number | null;
          pnl_month_net?: number | null; pnl_90d_net?: number | null;
          open_positions?: unknown[]; trades_count?: number;
        }> }>;
      };
      let balance: number | null = null;
      let pnl_day: number | null = null, pnl_week: number | null = null;
      let pnl_month: number | null = null, pnl_90d: number | null = null;
      let open_positions = 0, trades_90d = 0, platforms = 0;
      for (const pl of data.platforms ?? []) {
        platforms += 1;
        for (const a of pl.accounts ?? []) {
          if (a.balance != null) balance = (balance ?? 0) + a.balance;
          if (a.pnl_day_net != null) pnl_day = (pnl_day ?? 0) + a.pnl_day_net;
          if (a.pnl_week_net != null) pnl_week = (pnl_week ?? 0) + a.pnl_week_net;
          if (a.pnl_month_net != null) pnl_month = (pnl_month ?? 0) + a.pnl_month_net;
          if (a.pnl_90d_net != null) pnl_90d = (pnl_90d ?? 0) + a.pnl_90d_net;
          open_positions += (a.open_positions ?? []).length;
          trades_90d += a.trades_count ?? 0;
        }
      }
      setState({
        balance, pnl_day, pnl_week, pnl_month, pnl_90d, open_positions,
        trades_90d, platforms,
        fetched_at: data.fetched_at ?? null,
        from_cache: Boolean(data.from_cache),
        offline: false, error: null,
      });
    } catch (e) {
      setState((s) => ({ ...s, offline: true, error: e instanceof Error ? e.message : "fetch failed" }));
    }
  }, []);

  useEffect(() => {
    void poll();
    timer.current = window.setInterval(() => void poll(), intervalMs);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [poll, intervalMs]);

  return state;
}
