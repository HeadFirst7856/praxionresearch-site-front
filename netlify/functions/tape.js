/**
 * Praxion Terminal — market tape proxy (Netlify function).
 * Fetches a watchlist of quotes from Yahoo Finance chart API (no key needed),
 * normalizes to tape items for the bottom scrolling tape.
 * Route: /api/v1/tape
 */

const WATCHLIST = [
  { sym: "NQ=F", label: "NQ" },
  { sym: "ES=F", label: "ES" },
  { sym: "YM=F", label: "YM" },
  { sym: "RTY=F", label: "RTY" },
  { sym: "GC=F", label: "GC" },
  { sym: "CL=F", label: "CL" },
  { sym: "6E=F", label: "6E" },
  { sym: "BTC-USD", label: "BTC" },
  { sym: "ETH-USD", label: "ETH" },
  { sym: "^VIX", label: "VIX" },
  { sym: "DX-Y.NYB", label: "DXY" },
  { sym: "^TNX", label: "TNX" },
];

async function fetchQuote(item) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.sym)}?interval=1d&range=1d`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (PraxionTerminal/1.0)" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error("no meta");
    const last = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? last;
    return {
      sym: item.sym,
      label: item.label,
      last,
      change: last - prev,
      changePct: prev ? ((last - prev) / prev) * 100 : 0,
    };
  } catch (e) {
    return { sym: item.sym, label: item.label, last: null, change: null, changePct: null, error: e?.message ?? "err" };
  } finally {
    clearTimeout(timer);
  }
}

export async function handler(event) {
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

  const quotes = await Promise.all(WATCHLIST.map(fetchQuote));
  const ok = quotes.filter((q) => q.last != null);
  const failed = quotes.length - ok.length;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ generatedAt: new Date().toISOString(), quotes: ok, failed }),
  };
}
