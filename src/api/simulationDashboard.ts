import { apiFetch } from "@/lib/api";

export type SimulationDateRangeParams = {
  from?: string;
  to?: string;
};

export async function fetchSimulationDashboard(params?: SimulationDateRangeParams): Promise<unknown> {
  const search = new URLSearchParams();
  if (params?.from) {
    search.set("from", params.from);
  }
  if (params?.to) {
    search.set("to", params.to);
  }
  const qs = search.toString();
  const path = qs ? `/api/v1/simulation/dashboard?${qs}` : "/api/v1/simulation/dashboard";

  const res = await apiFetch(path);
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: unknown };
      if (j.detail != null) {
        detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
      }
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return res.json() as Promise<unknown>;
}
