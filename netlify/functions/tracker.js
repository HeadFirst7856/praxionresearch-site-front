/**
 * Praxion — military tracker proxy (Netlify function).
 * Route: /api/v1/tracker
 *
 * AIRCRAFT: OpenSky Network states API (keyless). Filters for notable traffic:
 * military tankers/recon/VIP (callsign patterns), high-altitude tracks.
 * SHIPS: AIS via AISHub when AISHUB_USER/AISHUB_PASS env vars are set (naval
 * prefix + military type filter). Ships layer stays offline until the key lands.
 */

const OPENSKY_URL =
  "https://opensky-network.org/api/states/all?lamin=28&lomin=-118&lamax=47&lomax=-75";

// Notable callsign prefixes — tankers, recon, VIP, specials (case-insensitive)
const NOTABLE_PATTERNS = [
  { re: /^(RCH|GOLD|HOMER|STEEL)\d*/i, cat: "TANKER/CARGO", w: 3 },
  { re: /^SAM\d*/i, cat: "VIP", w: 3 },
  { re: /^(VENUS|SPAR|COP|DUKE|JENA|ONA|UAF|GORDO|MACE|JAKE|DIXIE|BLUE|SNOOP|NIGHT)\d*/i, cat: "SPECIAL", w: 3 },
  { re: /^(E4|E6|RC|RQ|U2|B2|B52|F15|F16|F18|F22|F35|KC135|KC46|C17|C5|C130|P8|P3|EP3|EA18|E3)\d*[- ]?[A-Z0-9]*/i, cat: "MILITARY", w: 3 },
  { re: /^FORTE\d*/i, cat: "AIRBORNE C2", w: 3 },
  { re: /^(RCH|JAKE|NIGHT|DIXIE|COBRA|HAWK|VIPER|RAZOR|SHARK|GHOST)\d*/i, cat: "MILITARY", w: 2 },
  { re: /^(UAE|AUF|BAF|IAF|EAF|KAF|QAF|PAF|SAF|RSAF|TUAF|USAF)\d*/i, cat: "MILITARY", w: 2 },
];

const MILITARY_SQUAWKS = new Set(["3000", "3001", "3002", "3003", "3004", "3005", "3006", "7777", "7401"]);

const cache = { aircraft: null, ships: null, at: 0 };
const TTL = 30000; // refresh attempt window
const SUCCESS_TTL = 300000; // keep serving good data 5 min even if a poll fails

function notableScore(state) {
  const callsign = String(state[1] ?? "").trim();
  const squawk = String(state[14] ?? "");
  let best = { cat: null, w: 0 };
  for (const p of NOTABLE_PATTERNS) {
    if (p.re.test(callsign) && p.w > best.w) best = { cat: p.cat, w: p.w };
  }
  if (best.w === 0 && MILITARY_SQUAWKS.has(squawk)) {
    best = { cat: "MILITARY SQUAWK", w: 2 };
  }
  if (best.w === 0 && callsign && !/^[A-Z]{2}\d{4,}$/.test(callsign) && callsign.length >= 3) {
    best = { cat: "UNUSUAL CALLSIGN", w: 1 };
  }
  return best;
}

async function fetchAircraft() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(OPENSKY_URL, {
        headers: { "User-Agent": "PraxionTerminal/1.0 (research desk)" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const states = json?.states ?? [];
      if (states.length === 0) throw new Error("empty states");
    const out = [];
    for (const s of states) {
      const { cat, w } = notableScore(s);
      if (!cat) continue;
      const onGround = !!s[8];
      if (onGround) continue; // airborne tracks only
      out.push({
        icao: s[0],
        callsign: String(s[1] ?? "").trim(),
        country: s[2],
        lat: s[6],
        lon: s[5],
        altFt: Math.round((s[7] ?? 0) * 3.28084),
        speedKt: Math.round((s[9] ?? 0) * 1.94384),
        track: s[10],
        squawk: s[14],
        category: cat,
        weight: w,
      });
    }
    out.sort((a, b) => b.weight - a.weight || b.altFt - a.altFt);
    return out.slice(0, 60);
      } catch (e) {
        console.error("opensky error (attempt " + (attempt + 1) + "):", e?.message ?? e);
        if (attempt < 1) await new Promise((r) => setTimeout(r, 1000));
      }
  }
  return cache.aircraft?.items ?? [];
}

// Naval name prefixes + AIS military type codes (35-37 = military ops)
const NAVAL_PREFIX = /^(USS|HMS|INS|RFA|ESPS|FGS|JS|ROKS|KRI|PNS|ITS|ARC|SPS|TCG|HSwMS|HDMS|KNM|ORP|BNS|PAT|KDB|KD|BAP|ARV|RSS|BRP|KRI|HTMS|JDS|ROC|CNS|PLAN|FS|LSS|RMAS|RFA)\s/i;

async function fetchShips() {
  const user = process.env.AISHUB_USER;
  const pass = process.env.AISHUB_PASS;
  if (!user || !pass) return { online: false, items: [] };
  try {
    const url = `https://data.aishub.net/ws/1.0/station/station.php?format=json&username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
    const res = await fetch(url, { headers: { "User-Agent": "PraxionTerminal/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const vessels = json?.data ?? json?.vessels ?? [];
    const out = [];
    for (const v of vessels) {
      const name = String(v.NAME ?? v.name ?? "").trim();
      const type = Number(v.TYPE_ID ?? v.typeId ?? -1);
      const military = NAVAL_PREFIX.test(name) || [35, 36, 37].includes(type);
      if (!military) continue;
      out.push({
        name,
        mmsi: v.MMSI ?? v.mmsi,
        lat: Number(v.LAT ?? v.lat ?? 0),
        lon: Number(v.LON ?? v.lon ?? 0),
        speedKt: Math.round(Number(v.SPEED ?? v.speed ?? 0)),
        course: Number(v.COURSE ?? v.course ?? 0),
        type,
        flag: v.FLAG ?? v.flag ?? "",
        category: "NAVAL",
      });
    }
    out.sort((a, b) => b.speedKt - a.speedKt);
    return { online: true, items: out.slice(0, 60) };
  } catch (e) {
    console.error("ais error:", e?.message ?? e);
    return { online: true, items: cache.ships?.items ?? [] };
  }
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
  if (!cache.aircraft || now - cache.at > TTL) {
    const [aircraft, ships] = await Promise.all([fetchAircraft(), fetchShips()]);
    if (aircraft.length > 0 || !cache.aircraft) {
      cache.aircraft = { items: aircraft, at: now };
    }
    cache.ships = ships;
    cache.at = now;
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      generatedAt: new Date().toISOString(),
      aircraft: cache.aircraft.items,
      ships: cache.ships,
      note: cache.ships.online
        ? "AIS ONLINE"
        : "SHIP LAYER OFFLINE — set AISHUB_USER/AISHUB_PASS env to enable",
    }),
  };
}

export { handler };
