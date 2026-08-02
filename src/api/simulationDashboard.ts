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

  try {
    const res = await apiFetch(path);
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return await res.json();
  } catch {
    // Static-site fallback: the site ships daily-generated dashboard artifacts at
    // /data/dashboard-data.json, so the dashboard renders with zero backend.
    const staticRes = await fetch("/data/dashboard-data.json", { cache: "no-store" });
    if (!staticRes.ok) {
      throw new Error(`${staticRes.status} ${staticRes.statusText}: dashboard data unavailable`);
    }
    return staticRes.json();
  }
}
