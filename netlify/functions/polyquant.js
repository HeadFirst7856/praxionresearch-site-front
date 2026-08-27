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
 *
 * v3 (2026-08-27): persistent candidate pool + leaderboard snapshot in Netlify
 * Blobs. The recent tape alone never contains enough profitable wallets per
 * category (only ~12% of active wallets are net-positive), so we accumulate
 * discovered wallets across refreshes and prioritise previously-profitable
 * ones. Output is a stable 10-minute snapshot, not a per-request reshuffle.
 */

import { connectLambda, getStore } from "@netlify/blobs";

const DATA_API = "https://data-api.polymarket.com";
const UA = "PraxionPolyquant/1.0 (research desk)";

const BLOB_NAME = "praxion-polyquant";
const POOL_KEY = "pool-v1";
const SNAP_KEY = "snap-v1";

// Spread the trade-tape sample across offset windows (limit=200 per call).
const TAPE_LIMIT = 200;
const TAPE_WINDOWS = [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800];
// Selection: previously-profitable wallets always refetched, then top notional,
// then a few random explorations to surface quiet whales.
const PREV_QUAL_FETCH = 60;
const TOP_SCORE_FETCH = 80;
const EXPLORE_FETCH = 30;
// Wallets fetched concurrently per batch (positions API is fast, keep bounded).
const BATCH = 20;
// Number of traders surfaced per category in the final output.
const PER_CATEGORY = 10;
// Below this many qualifying traders, a category reports status "warming".
const MIN_CATEGORY = 3;
// Pool cap (oldest/lowest-scoring wallets are dropped beyond this).
const POOL_CAP = 2500;

const TTL = 300000; // 5 min between full refresh attempts
const SNAP_TTL = 600000; // serve blob snapshot up to 10 min old
const SUCCESS_TTL = 1800000; // serve last good result up to 30 min on failure
const BUILD_DEADLINE = 9000; // fall back to stale instead of 502 if build stalls

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

function classify(slug, title) {
  const hay = `${slug ?? ""} ${title ?? ""}`;
  for (const c of CATEGORIES) {
    if (c.re.test(hay)) return c.id;
  }
  return "other";
}

const CATEGORY_ORDER = ["sports", "crypto", "politics", "geopolitics", "other"];

// ------------------------------------------------------------------ blob store --
// Mirrors chat.js: decode Lambda-compat blob context, fall back to explicit
// siteID + token, and degrade gracefully to in-memory when no store exists
// (e.g. local test runs).
let _store = null;
let _storeTried = false;

function getBlobStore() {
  if (_storeTried) return _store;
  _storeTried = true;
  try {
    _store = getStore({ name: BLOB_NAME });
  } catch {
    try {
      const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
      const token = process.env.NETLIFY_FUNCTIONS_TOKEN;
      if (siteID && token) _store = getStore({ name: BLOB_NAME, siteID, token });
    } catch {
      _store = null;
    }
  }
  return _store;
}

async function blobGet(key) {
  const store = getBlobStore();
  if (!store) return null;
  try {
    return (await store.get(key, { type: "json" })) ?? null;
  } catch {
    return null;
  }
}

async function blobSet(key, value) {
  const store = getBlobStore();
  if (!store) return;
  try {
    await store.set(key, JSON.stringify(value), { type: "application/json" });
  } catch {
    /* non-fatal */
  }
}

// In-memory fallbacks (also the primary read layer).
const memory = { pool: null, snap: null, data: null, at: 0 };

// ------------------------------------------------------------------ data fetchers --
async function fetchTrades(limit, offset = 0) {
  const res = await fetch(`${DATA_API}/trades?limit=${limit}&offset=${offset}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`trades HTTP ${res.status}`);
  return (await res.json()) ?? [];
}

async function fetchPositions(user) {
  // Data API intermittently 400s on some wallets (transient); retry twice.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${DATA_API}/positions?user=${encodeURIComponent(user)}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          continue;
        }
        throw new Error(`positions HTTP ${res.status}`);
      }
      return (await res.json()) ?? [];
    } catch (e) {
      if (attempt < 2 && e?.name !== "AbortError") {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  return [];
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

/** Merge freshly discovered tape wallets into the persistent pool. */
function mergeIntoPool(pool, candidates, now) {
  const byWallet = new Map(pool.wallets.map((w) => [w.w, w]));
  for (const c of candidates) {
    let rec = byWallet.get(c.wallet);
    if (!rec) {
      rec = { w: c.wallet, name: c.name, pseudonym: c.pseudonym, firstSeen: now, lastSeen: now, score: 0, n: 0, qual: 0 };
      byWallet.set(c.wallet, rec);
      pool.wallets.push(rec);
    }
    if (!rec.name && c.name) rec.name = c.name;
    if (!rec.pseudonym && c.pseudonym) rec.pseudonym = c.pseudonym;
    rec.score += c.score;
    rec.n += 1;
    rec.lastSeen = now;
  }
  // Keep the strongest wallets (score + profitability bonus), drop the tail.
  pool.wallets.sort((a, b) => b.score + Math.max(0, b.qual || 0) * 5 - (a.score + Math.max(0, a.qual || 0) * 5));
  if (pool.wallets.length > POOL_CAP) pool.wallets.length = POOL_CAP;
}

/** Pick the fetch list: previously-profitable, top notional, plus exploration.
 *  `deep` (young pool) sweeps harder to seed categories on the first builds. */
function selectFetchList(pool, deep) {
  const now = Date.now();
  const prevQual = pool.wallets
    .filter((w) => (w.qual || 0) > 0)
    .sort((a, b) => (b.qual || 0) - (a.qual || 0))
    .slice(0, PREV_QUAL_FETCH);
  const picked = new Set(prevQual.map((w) => w.w));
  const byScore = pool.wallets
    .filter((w) => !picked.has(w.w))
    .sort((a, b) => b.score - a.score);
  const topScore = byScore.slice(0, deep ? 150 : TOP_SCORE_FETCH);
  for (const w of topScore) picked.add(w.w);
  const rest = byScore.slice(deep ? 150 : TOP_SCORE_FETCH);
  // Deterministic-ish exploration: stable shuffle keyed by wallet, then recency.
  const explore = rest
    .sort((a, b) => (hashWallet(a.w) % 1000) - (hashWallet(b.w) % 1000) || b.lastSeen - a.lastSeen)
    .slice(0, deep ? 50 : EXPLORE_FETCH);
  return [...prevQual, ...topScore, ...explore];
}

function hashWallet(w) {
  let h = 0;
  for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
  return h;
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
  const totalPnl = realizedPnl + unrealizedPnl;

  return { realizedPnl, unrealizedPnl, totalPnl, largestSize, largestValue, openCount, bets };
}

// ------------------------------------------------------------------ display names --
// Raw proxy-wallet display names come back as hex (sometimes with a -<unix_ms>
// suffix). Don't show those as a trader's name; fall back to pseudonym / null.
const PROXY_NAME_RE = /^0x[a-fA-F0-9]{40}(-\d{13})?$/;

function cleanTraderName(name, pseudonym) {
  const n = (name ?? "").trim();
  if (!n || PROXY_NAME_RE.test(n)) return pseudonym || null;
  return n.replace(/-\d{13}$/, "");
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

async function build() {
  const now = Date.now();

  // 1. Load persistent pool (blob) or fall back to in-memory.
  let pool = memory.pool;
  if (!pool) {
    const fromBlob = await blobGet(POOL_KEY);
    pool = fromBlob && Array.isArray(fromBlob.wallets) ? fromBlob : { wallets: [], updatedAt: now };
  }

  // 2. Discover candidates from several offset windows of the trade tape.
  const windows = await Promise.all(
    TAPE_WINDOWS.map((off) => fetchTrades(TAPE_LIMIT, off).catch(() => [])),
  );
  const trades = windows.flat();
  if (trades.length === 0) throw new Error("empty trade tape");

  // 3. Merge into the pool, then pick who to fetch positions for.
  //    Young pools get a deep sweep to seed categories fast.
  const deep = pool.wallets.length < 300;
  mergeIntoPool(pool, discoverCandidates(trades), now);
  const fetchList = selectFetchList(pool, deep);

  // 4. Fetch positions concurrently, bounded by batches (small delay between
  //    batches to stay polite to the Data API and avoid burst rate-limits).
  const scored = [];
  for (let i = 0; i < fetchList.length; i += BATCH) {
    const batch = fetchList.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (c) => {
        try {
          const positions = await fetchPositions(c.w);
          const s = scorePositions(positions);
          c.qual = Math.round(s.totalPnl * 100) / 100;
          c.lastSeen = now;
          return { ...c, ...s, positions: positions.length };
        } catch {
          return null;
        }
      }),
    );
    for (const r of results) if (r) scored.push(r);
    if (i + BATCH < fetchList.length) await new Promise((r) => setTimeout(r, 150));
  }

  // 5. Gate: only genuinely profitable, active wallets qualify for "top" lists.
  const qualifiers = scored.filter((s) => s.totalPnl > 0 && (s.openPositions > 0 || s.realizedPnl > 0));

  // 6. Rank: profitability (totalPnl) desc, then largest open position desc.
  qualifiers.sort((a, b) => b.totalPnl - a.totalPnl || b.largestValue - a.largestValue);

  // 7. Bucket by category and take the top PER_CATEGORY per category.
  const byCategory = {};
  for (const id of CATEGORY_ORDER) byCategory[id] = [];
  for (const s of qualifiers) {
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

  // 8. Persist pool + snapshot (best-effort), and cache in memory.
  pool.updatedAt = now;
  memory.pool = pool;
  await blobSet(POOL_KEY, pool);

  const data = {
    generatedAt: new Date(now).toISOString(),
    methodology:
      "Ranked by realized + unrealized P&L (totalPnl) among profitable tracked wallets, " +
      "tie-broken by largest open position. Trader appears once, under their dominant " +
      "category by bet count. Wallets with negative net P&L are excluded from ranking. " +
      "Tracked wallets accumulate over time from the public trade tape.",
    tracked: scored.length,
    poolSize: pool.wallets.length,
    traders: qualifiers.slice(0, 60).map((s) => ({
      wallet: s.wallet,
      name: cleanTraderName(s.name, s.pseudonym),
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
    categories: CATEGORY_ORDER.map((id) => {
      const list = byCategory[id] ?? [];
      return {
        id,
        label: CATEGORIES.find((c) => c.id === id)?.label ?? id,
        status: list.length >= MIN_CATEGORY ? "ready" : "warming",
        traders: list.map((s) => ({
          wallet: s.wallet,
          name: cleanTraderName(s.name, s.pseudonym),
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
      };
    }),
  };

  const snap = { data, at: now };
  memory.snap = snap;
  await blobSet(SNAP_KEY, snap);

  return data;
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

  // Decode the Lambda-compat blob context (event.blobs) into the store env.
  try {
    if (event.blobs) connectLambda(event);
  } catch {
    /* fall through to explicit paths */
  }

  const now = Date.now();

  // Fast path: in-memory fresh.
  if (memory.data && now - memory.at < TTL) {
    return ok(memory.data);
  }

  // Snapshot path: blob snapshot fresh (stable output across cold starts).
  if (!memory.snap) memory.snap = await blobGet(SNAP_KEY);
  if (memory.snap && now - memory.snap.at < SNAP_TTL) {
    memory.data = memory.snap.data;
    memory.at = now;
    return ok(memory.snap.data);
  }

  // Build path: refresh the snapshot.
  try {
    const data = await Promise.race([
      build(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("build timeout")), BUILD_DEADLINE)),
    ]);
    memory.data = data;
    memory.at = now;
    return ok(data);
  } catch (e) {
    console.error("polyquant build error:", e?.message ?? e);
    if (memory.snap && now - memory.snap.at < SUCCESS_TTL) {
      // Serve last good result, flagged stale.
      return ok({ ...memory.snap.data, stale: true, generatedAt: memory.snap.data.generatedAt });
    }
    if (memory.data && now - memory.at < SUCCESS_TTL) {
      return ok({ ...memory.data, stale: true, generatedAt: memory.data.generatedAt });
    }
    return err(502, `polyquant unavailable: ${e?.message ?? e}`);
  }
}

export { handler };
