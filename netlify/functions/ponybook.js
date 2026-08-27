/**
 * Praxion — /ponybook data source (Netlify function).
 * Route: /api/v1/ponybook
 *
 * Horse racing odds + results for a free-to-play "pony picks" platform.
 * Data: The Odds API (v4) — FREE tier (500 credits/mo), no gambling license needed.
 *
 * Config: set ODDS_API_KEY in Netlify env vars. No key is ever hardcoded here.
 * The free tier gives fixed-odds bookmaker markets + results; NOT live US
 * pari-mutuel tote (that requires a paid tote/ADW license — a Phase 2 unlock).
 */

const ODDS_API = "https://api.the-odds-api.com/v4";

// Sports keys to try — horse racing varies by region; we probe at runtime.
const HORSE_SPORT_KEYS = ["horse_racing", "horseracing", "horse_racing_au", "horse_racing_gb", "horse_racing_ie", "horse_racing_us", "horse_racing_za"];

const UA = "PraxionPonybook/1.0 (research desk)";

const cache = { data: null, at: 0 };
const TTL = 120000;          // 2 min refresh window
const SUCCESS_TTL = 600000;  // serve last-good up to 10 min on failure

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

async function findHorseSportKey(apiKey) {
  const res = await fetch(`${ODDS_API}/sports/?apiKey=${encodeURIComponent(apiKey)}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`sports HTTP ${res.status}`);
  const sports = (await res.json()) ?? [];
  const keys = new Set(sports.map((s) => s.key));
  for (const k of HORSE_SPORT_KEYS) {
    if (keys.has(k)) return k;
  }
  // fallback: any key containing "horse" or "racing"
  const found = sports.find((s) => /horse|racing/i.test(s.key));
  if (found) return found.key;
  throw new Error("horse racing not offered for this API account/region");
}

function classifyMarket(event) {
  // horse racing odds are mostly h2h (head-to-head) per runner; keep raw.
  return event;
}

async function build(apiKey) {
  const sportKey = await findHorseSportKey(apiKey);

  // Fetch odds (upcoming) + scores (results) in parallel.
  const [oddsRes, scoresRes] = await Promise.all([
    fetch(
      `${ODDS_API}/odds/?apiKey=${encodeURIComponent(apiKey)}&sport=${encodeURIComponent(sportKey)}&regions=uk,eu,us&markets=h2h,winner`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) },
    ),
    fetch(
      `${ODDS_API}/scores/?apiKey=${encodeURIComponent(apiKey)}&sport=${encodeURIComponent(sportKey)}&daysFrom=3`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) },
    ),
  ]);

  let odds = [];
  let oddsError = null;
  if (oddsRes.ok) {
    odds = (await oddsRes.json()) ?? [];
  } else {
    oddsError = `odds HTTP ${oddsRes.status}`;
  }

  let results = [];
  let resultsError = null;
  if (scoresRes.ok) {
    results = (await scoresRes.json()) ?? [];
  } else {
    resultsError = `scores HTTP ${scoresRes.status}`;
  }

  // Normalize odds -> a flat "race card" of runners + best price.
  const races = [];
  for (const ev of odds) {
    const runners = [];
    for (const bm of (ev.bookmakers ?? [])) {
      for (const mk of (bm.markets ?? [])) {
        for (const out of (mk.outcomes ?? [])) {
          let rec = runners.find((r) => r.name === out.name);
          if (!rec) {
            rec = { name: out.name, bestPrice: null, books: [] };
            runners.push(rec);
          }
          const price = Number(out.price);
          if (!Number.isFinite(price)) continue;
          if (rec.bestPrice === null || price > rec.bestPrice) rec.bestPrice = price;
          rec.books.push({ book: bm.title, price, point: out.point ?? null });
        }
      }
    }
    runners.sort((a, b) => (a.bestPrice ?? 0) - (b.bestPrice ?? 0));
    races.push({
      id: ev.id,
      sportKey: ev.sport_key,
      commenceTime: ev.commence_time,
      homeTeam: ev.home_team,
      awayTeam: ev.away_team,
      runners,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    sportKey,
    provider: "The Odds API (free tier)",
    races,
    results,
    errors: { odds: oddsError, results: resultsError },
    note:
      "Free-tier fixed-odds bookmaker prices. Live US pari-mutuel tote + real-money " +
      "wagering require a paid tote/ADW license (Phase 2: BetMakers/Equibase).",
  };
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

  const apiKey = process.env.ODDS_API_KEY || event.queryStringParameters?.apiKey;
  if (!apiKey) {
    return err(500, "ODDS_API_KEY not configured. Set it in Netlify env vars (free key at the-odds-api.com).");
  }

  const now = Date.now();
  if (cache.data && now - cache.at < TTL) {
    return ok(cache.data);
  }

  try {
    const data = await build(apiKey);
    cache.data = data;
    cache.at = now;
    return ok(data);
  } catch (e) {
    console.error("ponybook build error:", e?.message ?? e);
    if (cache.data && now - cache.at < SUCCESS_TTL) {
      return ok({ ...cache.data, stale: true });
    }
    return err(502, `ponybook unavailable: ${e?.message ?? e}`);
  }
}

export { handler };
