import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

type Runner = { name: string; bestPrice: number | null; books: { book: string; price: number }[] };
type Race = { id: string; commenceTime: string; homeTeam: string; awayTeam: string; runners: Runner[] };
type PonybookData = {
  generatedAt: string;
  sportKey: string;
  provider: string;
  races: Race[];
  results: unknown[];
  errors: { odds: string | null; results: string | null };
  note: string;
  stale?: boolean;
};

function decOddsToAmerican(p: number): string {
  if (p >= 2) return `+${Math.round((p - 1) * 100)}`;
  return `${Math.round(-100 / (p - 1))}`;
}

function decOddsToFractional(p: number): string {
  const d = Math.round((p - 1) * 100) / 100;
  // simple fractional approximation to /1
  const n = Math.round(d * 10);
  const g = gcd(n, 10);
  return `${n / g}/${10 / g}`;
}
function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function RaceCard({ race }: { race: Race }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#091221]/70 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">
            {race.homeTeam}
            {race.awayTeam && race.awayTeam !== race.homeTeam ? ` vs ${race.awayTeam}` : ""}
          </div>
          <div className="text-xs text-sky-300">{fmtTime(race.commenceTime)}</div>
        </div>
      </div>
      <div className="space-y-1">
        {race.runners.length === 0 && <p className="text-xs text-slate-500">No odds yet.</p>}
        {race.runners.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-slate-200">{r.name}</span>
            <span className="shrink-0 tabular-nums text-slate-300">
              {r.bestPrice != null ? `${decOddsToAmerican(r.bestPrice)} · ${decOddsToFractional(r.bestPrice)}` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PonybookPage() {
  const [data, setData] = useState<PonybookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/v1/ponybook"));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PonybookData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message ?? "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page-container py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.16em] text-emerald-300">Ponybook</p>
        <h1 className="mt-3 text-[clamp(2.2rem,5vw,4rem)] leading-[0.95] font-semibold tracking-tight text-slate-50">
          Horse racing odds &amp; results
        </h1>
        <p className="mt-3 max-w-3xl text-lg leading-relaxed text-slate-300">
          Live fixed-odds horse markets for a free-to-play picks platform. No wagering license required.
        </p>
      </div>

      {loading && <p className="text-slate-400">Loading race cards…</p>}

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          Could not load ponybook data: {error}
        </div>
      )}

      {data && (
        <>
          {data.errors.odds && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
              Odds feed issue: {data.errors.odds} (sport key: {data.sportKey})
            </div>
          )}

          {data.races.length === 0 && !data.errors.odds ? (
            <p className="text-sm text-slate-500">No upcoming races right now. Check back closer to post time.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {data.races.map((r) => (
                <RaceCard key={r.id} race={r} />
              ))}
            </div>
          )}

          <p className="mt-10 text-xs leading-relaxed text-slate-600">
            {data.note} Provider: {data.provider}. Updated {new Date(data.generatedAt).toLocaleString()}.
            Odds shown are decimal → American / fractional. Not investment or wagering advice.
          </p>
        </>
      )}
    </div>
  );
}
