import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

type Bet = {
  title: string | null;
  outcome: string | null;
  size: number;
  cashPnl: number;
};

type Trader = {
  wallet: string;
  name: string | null;
  pseudonym: string | null;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  largestPosition: number;
  openPositions: number;
  bets: Bet[];
};

type Category = {
  id: string;
  label: string;
  status?: "ready" | "warming";
  traders: Trader[];
};

type PolyquantData = {
  generatedAt: string;
  methodology: string;
  categories: Category[];
  stale?: boolean;
};

const CATEGORY_ACCENT: Record<string, string> = {
  sports: "text-emerald-300",
  crypto: "text-amber-300",
  politics: "text-rose-300",
  geopolitics: "text-sky-300",
  other: "text-slate-300",
};

function fmtPnl(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

const PROXY_NAME_RE = /^0x[a-fA-F0-9]{40}(-\d{13})?$/;

function traderLabel(t: Trader): string {
  // Server cleans these, but be defensive: never show a raw proxy-wallet hex as a name.
  const name = t.name ?? "";
  if (!name || PROXY_NAME_RE.test(name)) return t.pseudonym || shortWallet(t.wallet);
  return name;
}

function shortWallet(w: string): string {
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

function TraderCard({ t, rank }: { t: Trader; rank: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#091221]/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-semibold text-sky-200">
            {rank}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">{traderLabel(t)}</div>
            <div className="truncate text-xs text-slate-500">{shortWallet(t.wallet)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-semibold tabular-nums ${t.totalPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            {fmtPnl(t.totalPnl)}
          </div>
          <div className="text-[11px] text-slate-500">
            largest {t.largestPosition.toLocaleString(undefined, { maximumFractionDigits: 2 })} · {t.openPositions} open
          </div>
        </div>
      </div>

      {t.bets.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
          {t.bets.map((b, i) => (
            <div key={i} className="flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0 text-slate-300">
                <span className="text-slate-500">{b.outcome ?? "—"}</span> · <span className="line-clamp-1">{b.title ?? "—"}</span>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <span className="text-slate-400">×{b.size}</span>{" "}
                <span className={b.cashPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmtPnl(b.cashPnl)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PolyquantPage() {
  const [data, setData] = useState<PolyquantData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/v1/polyquant"));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PolyquantData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message ?? "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-container py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.16em] text-sky-300">Polyquant</p>
        <h1 className="mt-3 text-[clamp(2.2rem,5vw,4rem)] leading-[0.95] font-semibold tracking-tight text-slate-50">
          Top Polymarket traders, by category
        </h1>
        <p className="mt-3 max-w-3xl text-lg leading-relaxed text-slate-300">
          The ten most profitable traders in each category — ranked by realized + unrealized profit, tie-broken by
          largest live position — and what they're currently holding.
        </p>
      </div>

      {loading && <p className="text-slate-400">Loading market intelligence…</p>}

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          Could not load polyquant data: {error}
        </div>
      )}

      {data && (
        <>
          {data.stale && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
              Showing last good snapshot (live feed temporarily unavailable).
            </div>
          )}

          <div className="space-y-10">
            {data.categories.map((cat) => (
              <section key={cat.id}>
                <div className="mb-4 flex items-baseline gap-3">
                  <h2 className={`text-xl font-semibold ${CATEGORY_ACCENT[cat.id] ?? "text-slate-200"}`}>{cat.label}</h2>
                  <span className="text-xs text-slate-500">{cat.traders.length} traders</span>
                  {cat.status === "warming" && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
                      warming up
                    </span>
                  )}
                </div>
                {cat.traders.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {cat.status === "warming"
                      ? "Still scanning the tape for profitable traders in this category — check back shortly."
                      : "No traders in this category right now."}
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {cat.traders.map((t, i) => (
                      <TraderCard key={t.wallet} t={t} rank={i + 1} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          <p className="mt-10 text-xs leading-relaxed text-slate-600">
            {data.methodology} Data from Polymarket's public Data API. Updated {new Date(data.generatedAt).toLocaleString()}.
            Profitability is mark-to-market and may not reflect fully settled results; not investment advice.
          </p>
        </>
      )}
    </div>
  );
}
