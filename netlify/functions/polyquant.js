/**
 * Praxion — /polyquant data source (Netlify function).
 * Route: /api/v1/polyquant
 *
 * "Top 10 Polymarket traders + what they're betting on, by category."
 * Ranking: by realized profitability (P&L), tie-broken by largest open position.
 *
 * Data: Polymarket public Data API (no auth). Two hops:
 *   1. GET data-api.polymarket.com/trades  -> discover active wallets (by notional)
 *   2. GET data-api.polymarket.com/positions?user=<wallet> -> realizedPnl + open size
 * No server-side database. Optional best-effort Blob cache to keep the list warm
 * and reduce calls to the Data API; in-memory cache is always the primary layer.
 */

const DATA_API = "https://data-api.polymarket.com";
const UA = "PraxionPolyquant/1.0 (research desk)";

// How many distinct wallets to discover & score from the trade tape.
const CANDIDATE_COUNT = 120;
// How many of those we actually fetch detailed positions for (top-scoring subset).
const TOP_SCORE_FETCH = 60;
// Number of traders surfaced per category in the final output.
const PER_CATEGORY = 10;

// ------------------------------------------------------------------ categories --
// Coarse classification from slug + title. Order matters (first match wins).
const CATEGORIES = [
  {
    id: "sports",
    label: "Sports",
    re: /(mlb|nba|nfl|nhl|ucl|epl|uefa|liga|serie|bundesliga|mls|ncaa|fifa|world-cup|super-bowl|stanley|nba-finals|world-series|tennis|atp|wta|golf|pga|lpga|ufc|mma|boxing|f1|formula|nascar|indy|march-madness|champions-league|euro)\b/i,
  },
  {
    id: "crypto",
    label: "Crypto",
    re: /(btc|bitcoin|eth|ethereum|sol|solana|crypto|coinbase|binance|blackrock-ib|etf|xrp|doge|dogecoin|litecoin|chainlink|defi|stablecoin|tether|usdc)\b/i,
  },
  {
    id: "politics",
    label: "Politics",
    re: /(election|presiden|senate|house|governor|mayor|trump|biden|harris|primary|caucus|congress|democrat|republican|midterm|approval|resign|impeach|vote|ballot|cabinet|secretary|fed|powell|tariff|policy)\b/i,
  },
  {
    id: "geopolitics",
    label: "Geopolitics",
    re: /(russia|ukraine|china|taiwan|iran|israel|gaza|palestin|north-korea|korea|nato|war|ceasefire|sanction|missile|invasion|military|conflict|oil-prices|opec|oil|gas|crude|gold-price|recession|inflation|cpi|gdp|unemployment|rate-cut|rate-hike|fed-funds|stock-market|sp500|nasdaq|dow)\b/i,
  },
];

const GEOPOLITICS_ALSO = /(recession|inflation|cpi|gdp|unemployment|rate-cut|rate-hike|fed-funds|sp500|nasdaq|dow|oil|gas|crude|gold)\b/i;

function classify(slug, title) {
  const hay = `${slug ?? ""} ${title ?? ""}`;
  for (const c of CATEGORIES) {
    if (c.re.test(hay)) return c.id;
  }
  return "other";
}

const CATEGORY_ORDER = ["sports", "crypto", "politics", "geopolitics", "other"];

// ------------------------------------------------------------------ data fetchers --
async function fetchTrades(limit) {
  const res = await fetch(`${DATA_API}/trades?limit=${limit}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`trades HTTP ${res.status}`);
  return (await res.json()) ?? [];
}

async function fetchPositions(user) {
  const res = await fetch(`${DATA_API}/positions?user=${encodeURIComponent(user)}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`positions HTTP ${res.status}`);
  return (await res.json()) ?? [];
}

// ------------------------------------------------------------------ aggregation --
/**
 * Discover candidate wallets from the trade tape and score them by recent
 * notional (sum of size*price). Returns [{wallet, name, pseudonym, score}].
 */
function discoverCandidates(trades) {
  const map = new Map();
  for (const t of trades) {
    const w = t?.proxyWallet;
    if (!w) continue;
    const size = Math.max(0, Number(t.size) || 0);
    const price = Math.max(0, Number(t.price) || 0);
    const notional = size * price;
    let rec = map.get(w);
    if (!rec) {
      rec = {
        wallet: w,
        name: t.name || null,
        pseudonym: t.pseudonym || null,
        score: 0,
      };
      map.set(w, rec);
    }
    if (!rec.name && t.name) rec.name = t.name;
    if (!rec.pseudonym && t.pseudonym) rec.pseudonym = t.pseudonym;
    rec.score += notional;
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

/**
 * For a single wallet, sum realized P&L and compute largest open position.
 * Positions from the Data API carry realizedPnl (settled) and cashPnl (unrealized),
 * plus size / currentValue for the tie-break.
 */
function scorePositions(positions) {
  let realizedPnl = 0;
  let unrealizedPnl = 0;
  let largestSize = 0;
  let largestValue = 0;
  let openCount = 0;
  let bets = [];

  for (const p of positions) {
    const rp = Number(p.realizedPnl) || 0;
    const cp = Number(p.cashPnl) || 0;
    realizedPnl += rp;
    // Only count unrealized P&L on positions that aren't settled/resolved to 0
    // (resolved losers already moved into realizedPnl). Use size>0 as "still open".
    const size = Number(p.size) || 0;
    if (size > 0) {
      unrealizedPnl += cp;
      openCount += 1;
      largestSize = Math.max(largestSize, size);
      largestValue = Math.max(largestValue, Number(p.currentValue) || size * (Number(p.curPrice) || 0));
    }
    bets.push({
      title: p.title || null,
      slug: p.slug || null,
      outcome: p.outcome || null,
      size,
      avgPrice: Number(p.avgPrice) || null,
      curPrice: Number(p.curPrice) || null,
      cashPnl: cp,
      realizedPnl: rp,
      category: classify(p.slug, p.title),
    });
  }

  // "Profitability" score = realized (settled) + unrealized (open), a total return.
  // Realized is the honest, locked-in number; unrealized is mark-to-market.
  const totalPnl = realizedPnl + unrealizedPnl;

  return { realizedPnl, unrealizedPnl, totalPnl, largestSize, largestValue, openCount, bets };
}

// ------------------------------------------------------------------ handlers --
function ok(body) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

function err(statusCode, message) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ error: message }),
  };
}

// In-memory cache shared across warm invocations.
const cache = { data: null, at: 0 };
const TTL = 120000; // 2 min between full refresh attempts
const SUCCESS_TTL = 600000; // serve last good result up to 10 min on failure

async function build() {
  // 1. Discover candidates from a recent slice of the trade tape.
  //    Fetch a couple of page-windows to widen the wallet pool.
  const windows = [];
  const [t1, t2, t3] = await Promise.all([
    fetchTrades(200).catch(() => []),
    fetchTrades(200).catch(() => []),
    fetchTrades(200).catch(() => []),
  ]);
  const trades = [...t1, ...t2, ...t3];
  if (trades.length === 0) throw new Error("empty trade tape");

  const candidates = discoverCandidates(trades).slice(0, TOP_SCORE_FETCH);

  // 2. Fetch positions (realized P&L) for the top candidates, concurrently but
  //    bounded to avoid hammering the Data API.
  const scored = [];
  const BATCH = 10;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (c) => {
        try {
          const positions = await fetchPositions(c.wallet);
          const s = scorePositions(positions);
          return { ...c, ...s, positions: positions.length };
        } catch {
          return null;
        }
      }),
    );
    for (const r of results) if (r) scored.push(r);
  }

  // 3. Rank: profitability (totalPnl) desc, then largest open position desc.
  scored.sort((a, b) => b.totalPnl - a.totalPnl || b.largestValue - a.largestValue);

  // 4. Bucket by category and take the top PER_CATEGORY per category.
  const byCategory = {};
  for (const id of CATEGORY_ORDER) byCategory[id] = [];
  for (const s of scored) {
    // A trader's category = their single biggest category by number of bets
    // (so they appear once, under their dominant focus area).
    const counts = {};
    for (const b of s.bets) counts[b.category] = (counts[b.category] || 0) + 1;
    let dom = "other";
    let best = -1;
    for (const [cat, n] of Object.entries(counts)) {
      if (n > best) {
        best = n;
        dom = cat;
      }
    }
    if (byCategory[dom] && byCategory[dom].length < PER_CATEGORY) {
      byCategory[dom].push(s);
    } else if (byCategory.other.length < PER_CATEGORY) {
      byCategory.other.push(s);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    methodology:
      "Ranked by realized + unrealized P&L (totalPnl), tie-broken by largest open position. " +
      "Trader appears once, under their dominant category by bet count.",
    traders: scored.slice(0, 60).map((s) => ({
      wallet: s.wallet,
      name: s.name,
      pseudonym: s.pseudonym,
      realizedPnl: round2(s.realizedPnl),
      unrealizedPnl: round2(s.unrealizedPnl),
      totalPnl: round2(s.totalPnl),
      largestPosition: round2(s.largestValue),
      openPositions: s.openCount,
      positionsTracked: s.positions,
      bets: s.bets.slice(0, 20).map((b) => ({
        title: b.title,
        slug: b.slug,
        outcome: b.outcome,
        size: round4(b.size),
        avgPrice: b.avgPrice == null ? null : round4(b.avgPrice),
        curPrice: b.curPrice == null ? null : round4(b.curPrice),
        cashPnl: round2(b.cashPnl),
        category: b.category,
      })),
    })),
    categories: CATEGORY_ORDER.map((id) => ({
      id,
      label: CATEGORIES.find((c) => c.id === id)?.label ?? id,
      traders: (byCategory[id] ?? []).map((s) => ({
        wallet: s.wallet,
        name: s.name,
        pseudonym: s.pseudonym,
        realizedPnl: round2(s.realizedPnl),
        unrealizedPnl: round2(s.unrealizedPnl),
        totalPnl: round2(s.totalPnl),
        largestPosition: round2(s.largestValue),
        openPositions: s.openCount,
        bets: s.bets.slice(0, 6).map((b) => ({
          title: b.title,
          outcome: b.outcome,
          size: round4(b.size),
          cashPnl: round2(b.cashPnl),
        })),
      })),
    })),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

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

  const now = Date.now();
  if (cache.data && now - cache.at < TTL) {
    return ok(cache.data);
  }

  try {
    const data = await build();
    cache.data = data;
    cache.at = now;
    return ok(data);
  } catch (e) {
    console.error("polyquant build error:", e?.message ?? e);
    if (cache.data && now - cache.at < SUCCESS_TTL) {
      // Serve last good result, flagged stale.
      return ok({ ...cache.data, stale: true, generatedAt: cache.data.generatedAt });
    }
    return err(502, `polyquant unavailable: ${e?.message ?? e}`);
  }
}

export { handler };
