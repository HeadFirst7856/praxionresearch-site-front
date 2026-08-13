/**
 * Praxion — strategies summary proxy (Netlify function).
 * Route: /api/v1/strategies
 * Slims the 26MB dashboard-data.json into per-strategy cards: pnl, PF, win
 * rate, max DD, trades, yearly P&L, date range, equity curve (downsampled).
 */
const DASH_URL = "https://praxionresearch-site.netlify.app/data/dashboard-data.json";

async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: "",
    };
  }
  try {
    const res = await fetch(DASH_URL, { headers: { "User-Agent": "PraxionTerminal/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const slots = d?.slots ?? {};
    const out = [];
    for (const [key, s] of Object.entries(slots)) {
      const eq = s?.equity_curve ?? [];
      // downsample equity curve to ~120 points
      const step = Math.max(1, Math.floor(eq.length / 120));
      const curve = eq.filter((_, i) => i % step === 0 || i === eq.length - 1).map((p) => ({
        t: p?.t ?? null,
        e: Math.round(p?.equity ?? 0),
      }));
      out.push({
        key,
        title: s?.title ?? key,
        instrument: s?.instrument ?? "",
        mode: s?.mode ?? "",
        status: s?.status ?? "",
        pnl: Math.round(s?.continuous_pnl ?? 0),
        endingBalance: Math.round(s?.ending_balance ?? 0),
        trades: s?.metrics?.trades ?? s?.trades_total ?? 0,
        winRate: s?.metrics?.win_rate ?? null,
        profitFactor: s?.metrics?.profit_factor ?? null,
        maxDrawdown: Math.round(s?.metrics?.max_drawdown ?? 0),
        from: s?.max_date_range?.from ?? null,
        to: s?.max_date_range?.to ?? null,
        lastBar: s?.last_bar_time ?? null,
        yearly: (s?.yearly_rows ?? []).map((y) => ({
          period: y?.period,
          pnl: Math.round(y?.pnl_dollars ?? 0),
          trades: y?.closed_trades ?? 0,
          winRate: y?.win_rate ?? null,
          profitFactor: y?.profit_factor ?? null,
        })),
        equityCurve: curve,
      });
    }
    out.sort((a, b) => b.pnl - a.pnl);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ generatedAt: new Date().toISOString(), strategies: out }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: String(e?.message ?? e) }),
    };
  }
}

export { handler };
