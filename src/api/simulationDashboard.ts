import { apiFetch } from "@/lib/api";

export async function fetchSimulationDashboard(): Promise<unknown> {
  const res = await apiFetch("/api/v1/simulation/dashboard");
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
