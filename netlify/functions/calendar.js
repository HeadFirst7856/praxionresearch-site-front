/**
 * Praxion — market calendar proxy (Netlify function).
 * Route: /api/v1/calendar
 *
 * This week's market-moving events (Mon–Fri, ET times, impact-rated):
 *  - Real BLS release dates (CPI / NFP / PPI) from the published 2026 schedule
 *  - FOMC decisions (Fed announced 2026 dates)
 *  - Rule-based approximations for PCE / GDP / Retail Sales / ISM (marked ~)
 *  - Weekly recurring (jobless claims, crude inventories), quad witching,
 *    earnings windows, US market holidays (CLOSED)
 */

const IMPACT = { HIGH: "HIGH", MED: "MED", LOW: "LOW", CLOSED: "CLOSED" };

// ---- REAL BLS 2026 release dates (from bls.gov/schedule/news_release) --------
const BLS_DATES = [
  // CPI (8:30 ET)
  { date: "2026-08-12", time: "08:30", title: "CPI (Consumer Price Index)", impact: IMPACT.HIGH, source: "BLS" },
  { date: "2026-09-11", time: "08:30", title: "CPI (Consumer Price Index)", impact: IMPACT.HIGH, source: "BLS" },
  { date: "2026-10-14", time: "08:30", title: "CPI (Consumer Price Index)", impact: IMPACT.HIGH, source: "BLS" },
  { date: "2026-11-10", time: "08:30", title: "CPI (Consumer Price Index)", impact: IMPACT.HIGH, source: "BLS" },
  { date: "2026-12-10", time: "08:30", title: "CPI (Consumer Price Index)", impact: IMPACT.HIGH, source: "BLS" },
  // Employment Situation / NFP (8:30 ET)
  { date: "2026-09-04", time: "08:30", title: "Employment Situation (NFP / Unemployment)", impact: IMPACT.HIGH, source: "BLS" },
  { date: "2026-10-02", time: "08:30", title: "Employment Situation (NFP / Unemployment)", impact: IMPACT.HIGH, source: "BLS" },
  { date: "2026-11-06", time: "08:30", title: "Employment Situation (NFP / Unemployment)", impact: IMPACT.HIGH, source: "BLS" },
  { date: "2026-12-04", time: "08:30", title: "Employment Situation (NFP / Unemployment)", impact: IMPACT.HIGH, source: "BLS" },
  // PPI (8:30 ET)
  { date: "2026-08-13", time: "08:30", title: "PPI (Producer Price Index)", impact: IMPACT.MED, source: "BLS" },
  { date: "2026-09-10", time: "08:30", title: "PPI (Producer Price Index)", impact: IMPACT.MED, source: "BLS" },
  { date: "2026-10-15", time: "08:30", title: "PPI (Producer Price Index)", impact: IMPACT.MED, source: "BLS" },
  { date: "2026-11-13", time: "08:30", title: "PPI (Producer Price Index)", impact: IMPACT.MED, source: "BLS" },
  { date: "2026-12-15", time: "08:30", title: "PPI (Producer Price Index)", impact: IMPACT.MED, source: "BLS" },
];

// ---- Rule-based approximations (BEA/Census/ISM don't publish machine-read schedules) --
function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}
function lastWeekday(year, month, weekday) {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}
function isoDay(d) {
  return d.toISOString().slice(0, 10);
}
function keyOf(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function parseLocal(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d); // local (ET)
}

function approxEvents(year, month) {
  const out = [];
  const push = (d, time, title, impact, source) => {
    if (d.getMonth() === month && d.getFullYear() === year) {
      out.push({ date: isoDay(d), key: keyOf(d), time, title, impact, source, approx: true });
    }
  };
  push(lastWeekday(year, month, 5), "08:30", "PCE Price Index (Fed's inflation gauge)", IMPACT.HIGH, "BEA");
  push(lastWeekday(year, month, 4), "08:30", "GDP (advance/2nd/final estimate)", IMPACT.MED, "BEA");
  push(new Date(year, month, 16), "08:30", "Retail Sales", IMPACT.MED, "Census");
  push(nthWeekday(year, month, 4, 1), "10:00", "ISM Manufacturing PMI", IMPACT.MED, "ISM");
  return out;
}

// ---- US market holidays (rule-based; observed) -------------------------------
function holidaysIn(year, month) {
  const out = [];
  const all = [
    new Date(year, 0, 1),
    nthWeekday(year, 0, 1, 3),
    nthWeekday(year, 1, 1, 3),
    lastWeekday(year, 4, 1),
    new Date(year, 5, 19),
    new Date(year, 6, 4),
    nthWeekday(year, 8, 1, 1),
    nthWeekday(year, 10, 4, 4),
    new Date(year, 11, 25),
  ];
  for (const h of all) {
    let obs = h;
    if (h.getDay() === 6) obs = new Date(h.getFullYear(), h.getMonth(), h.getDate() - 1);
    if (h.getDay() === 0) obs = new Date(h.getFullYear(), h.getMonth(), h.getDate() + 1);
    if (obs.getMonth() === month && obs.getFullYear() === year) {
      out.push({ date: isoDay(obs), key: keyOf(obs), time: "—", title: "US Market CLOSED (holiday)", impact: IMPACT.CLOSED, source: "NYSE", approx: false });
    }
  }
  return out;
}

// ---- FOMC (announced 2026 schedule, 14:00 ET) --------------------------------
const FOMC_DATES = ["2026-09-16", "2026-10-28", "2026-12-09"];
const FOMC_MINUTES_OFFSET_DAYS = 21;

function fomcEvents() {
  return FOMC_DATES.map((dstr) => ({
    date: dstr,
    key: keyOf(parseLocal(dstr)),
    time: "14:00",
    title: "FOMC Decision + Statement",
    impact: IMPACT.HIGH,
    source: "FEDERAL RESERVE",
    approx: false,
  }));
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

  // Trading week: Monday..Friday, ET
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const diff = (day + 6) % 7;
  const mon = new Date(et.getFullYear(), et.getMonth(), et.getDate() - diff);

  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    days.push({
      date: isoDay(d),
      key: keyOf(d),
      dow: d.toLocaleDateString("en-US", { weekday: "short" }),
      time: "—",
      title: "Regular trading session",
      impact: "—",
      source: "NYSE",
      approx: false,
      items: [],
    });
  }
  const byKey = new Map(days.map((e) => [e.key, e]));
  const inWeek = (k) => byKey.has(k);

  const add = (ev) => {
    if (inWeek(ev.key)) byKey.get(ev.key).items.push(ev);
  };

  for (const ev of BLS_DATES) {
    add({ ...ev, key: keyOf(parseLocal(ev.date)), approx: false });
  }

  for (const ev of approxEvents(mon.getFullYear(), mon.getMonth())) add(ev);
  for (const ev of holidaysIn(mon.getFullYear(), mon.getMonth())) add(ev);

  for (const ev of fomcEvents()) add(ev);
  for (const m of FOMC_DATES) {
    const d = parseLocal(m);
    d.setDate(d.getDate() + FOMC_MINUTES_OFFSET_DAYS);
    add({ date: isoDay(d), key: keyOf(d), time: "14:00", title: "FOMC Minutes (3 weeks post-meeting)", impact: IMPACT.MED, source: "FEDERAL RESERVE", approx: true });
  }

  // Quad witching: 3rd Friday of Mar/Jun/Sep/Dec
  for (const qm of [2, 5, 8, 11]) {
    const w = nthWeekday(mon.getFullYear(), qm, 5, 3);
    add({ date: isoDay(w), key: keyOf(w), time: "16:00", title: "Quad Witching — options & futures expiry", impact: IMPACT.MED, source: "CME/OPEX", approx: false });
  }

  // Weekly recurring: claims (Thu 08:30), crude inventories (Wed 10:30)
  for (const d of days) {
    const dt = new Date(d.date + "T12:00:00Z");
    const dow = dt.getUTCDay();
    if (dow === 4) add({ date: d.date, key: d.key, time: "08:30", title: "Initial Jobless Claims", impact: IMPACT.LOW, source: "DOL", approx: false });
    if (dow === 3) add({ date: d.date, key: d.key, time: "10:30", title: "EIA Crude Oil Inventories", impact: IMPACT.LOW, source: "EIA", approx: false });
  }

  const impactRank = { HIGH: 0, MED: 1, LOW: 2, CLOSED: 3 };
  for (const e of days) {
    e.items.sort((a, b) => a.time.localeCompare(b.time) || (impactRank[a.impact] ?? 9) - (impactRank[b.impact] ?? 9));
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ generatedAt: new Date().toISOString(), weekStart: isoDay(mon), events: days }),
  };
}

export { handler };
