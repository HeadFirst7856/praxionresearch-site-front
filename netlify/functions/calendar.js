/**
 * Praxion — market calendar proxy (Netlify function).
 * Route: /api/v1/calendar
 *
 * Returns this week's market-moving events: FOMC meetings (Fed's public JSON),
 * recurring US data releases (rule-based, ET times, impact-rated), quad witching,
 * earnings-season windows, and US market holidays. "expected to move the market"
 * is expressed as an impact tag: HIGH / MED / LOW / CLOSED.
 */

const NYSE_HOLIDAYS = [
  { m: 0, d: 1 },   // New Year's
  { m: 0, d: 19 },  // MLK (3rd Mon Jan — approx; fine-tuned below)
  { m: 1, d: 16 },  // Presidents (3rd Mon Feb — approx)
  { m: 4, d: 25 },  // Memorial (last Mon May — approx)
  { m: 6, d: 4 },   // Juneteenth
  { m: 6, d: 3 },   // Independence (observed Fri if 4th is Sat)
  { m: 8, d: 7 },   // Labor (1st Mon Sep — approx)
  { m: 10, d: 27 }, // Thanksgiving (4th Thu Nov — approx)
  { m: 11, d: 25 }, // Christmas
];

const IMPACT = { HIGH: "HIGH", MED: "MED", LOW: "LOW", CLOSED: "CLOSED" };

// Keyword -> impact boost used by the app for news ranking; kept here for reference.
const ET = "America/New_York";

function zonedDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Date(d.toLocaleString("en-US", { timeZone: ET }));
}

function startOfWeek(base) {
  const d = new Date(base);
  const day = d.getDay(); // 0 Sun
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nthWeekday(year, month, weekday, n) {
  // month: 0-based; weekday: 0=Sun..6=Sat; n: 1..5 (5 = last)
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return new Date(year, month, day);
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

// ---- Recurring US data releases (ET times, impact) -------------------------
function recurringEvents(year, month, list) {
  const out = [];
  for (const ev of list) {
    let d = null;
    if (ev.rule === "nth") d = nthWeekday(year, month, ev.weekday, ev.n);
    else if (ev.rule === "last") d = lastWeekday(year, month, ev.weekday);
    else if (ev.rule === "fixed") d = new Date(year, month, ev.day);
    if (d) {
      out.push({
        date: isoDay(d),
        key: keyOf(d),
        time: ev.time,
        title: ev.title,
        impact: ev.impact,
        source: ev.source ?? "BLS",
        approx: !!ev.approx,
      });
    }
  }
  return out;
}

const MONTHLY_EVENTS = [
  { rule: "nth", weekday: 5, n: 1, time: "08:30", title: "Employment Situation (NFP / Unemployment)", impact: IMPACT.HIGH, source: "BLS" },
  { rule: "fixed", day: 10, time: "08:30", title: "CPI (Consumer Price Index)", impact: IMPACT.HIGH, source: "BLS", approx: true },
  { rule: "fixed", day: 14, time: "08:30", title: "PPI (Producer Price Index)", impact: IMPACT.MED, source: "BLS", approx: true },
  { rule: "last", weekday: 5, time: "08:30", title: "PCE Price Index (Fed's inflation gauge)", impact: IMPACT.HIGH, source: "BEA", approx: true },
  { rule: "last", weekday: 4, time: "08:30", title: "GDP (advance/2nd/final estimate)", impact: IMPACT.MED, source: "BEA", approx: true },
  { rule: "fixed", day: 16, time: "08:30", title: "Retail Sales", impact: IMPACT.MED, source: "Census", approx: true },
  { rule: "fixed", day: 16, time: "10:00", title: "NAHB Housing Market Index", impact: IMPACT.LOW, source: "NAHB", approx: true },
  { rule: "nth", weekday: 4, n: 1, time: "10:00", title: "ISM Manufacturing PMI", impact: IMPACT.MED, source: "ISM" },
];

// ---- US market holidays (rule-based; observed) -----------------------------
function holidaysIn(year, month) {
  const out = [];
  const mlk = nthWeekday(year, 0, 1, 3);
  const pres = nthWeekday(year, 1, 1, 3);
  const memorial = lastWeekday(year, 4, 1);
  const juneteenth = new Date(year, 5, 19);
  const indep = new Date(year, 6, 4);
  const labor = nthWeekday(year, 8, 1, 1);
  const thanks = nthWeekday(year, 10, 4, 4);
  const xmas = new Date(year, 11, 25);
  const nyd = new Date(year, 0, 1);
  const all = [nyd, mlk, pres, memorial, juneteenth, indep, labor, thanks, xmas];
  for (const h of all) {
    // observe Saturday holidays on Friday, Sunday on Monday
    let obs = h;
    if (h.getDay() === 6) obs = new Date(h.getFullYear(), h.getMonth(), h.getDate() - 1);
    if (h.getDay() === 0) obs = new Date(h.getFullYear(), h.getMonth(), h.getDate() + 1);
    if (obs.getMonth() === month && obs.getFullYear() === year) {
      out.push({ date: isoDay(obs), key: keyOf(obs), time: "—", title: "US Market CLOSED (holiday)", impact: IMPACT.CLOSED, source: "NYSE", approx: false });
    }
  }
  return out;
}

// ---- FOMC (Fed public JSON, falling back to announced schedule) -------------
// Statement dates, 14:00 ET. The Fed's public JSON endpoint was retired; the
// schedule below is the announced 2026 calendar (rest of year).
const FOMC_FALLBACK = ["2026-09-16", "2026-10-28", "2026-12-09"];

async function fetchFomc() {
  try {
    const res = await fetch("https://www.federalreserve.gov/json/ne-fin-json/FOMC.json", {
      headers: { "User-Agent": "PraxionTerminal/1.0 (research desk)" },
    });
    if (res.ok) {
      const json = await res.json();
      const out = [];
      for (const m of json?.meetings ?? []) {
        const ds = m?.dates ?? [];
        if (ds.length) {
          const d = new Date(ds[0]);
          if (!isNaN(d.getTime())) {
            out.push({
              date: d.toISOString().slice(0, 10),
              key: keyOf(d),
              time: "14:00",
              title: `FOMC Decision + Statement${m.press_conference ? " + Press Conference" : ""}`,
              impact: IMPACT.HIGH,
              source: "FEDERAL RESERVE",
              approx: false,
            });
          }
        }
      }
      if (out.length) return out;
    }
  } catch (e) {
    console.error("fomc fetch error:", e?.message ?? e);
  }
  return FOMC_FALLBACK.map((dstr) => {
    const d = new Date(dstr + "T00:00:00Z");
    return {
      date: dstr,
      key: keyOf(d),
      time: "14:00",
      title: "FOMC Decision + Statement",
      impact: IMPACT.HIGH,
      source: "FEDERAL RESERVE",
      approx: false,
    };
  });
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

  const now = zonedDate();
  const weekStart = startOfWeek(now);
  const year = weekStart.getFullYear();
  const month = weekStart.getMonth();

  const events = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    events.push({
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

  const byKey = new Map(events.map((e) => [e.key, e]));
  const inWeek = (k) => byKey.has(k);

  const rec = recurringEvents(year, month, MONTHLY_EVENTS);
  for (const ev of rec) if (inWeek(ev.key)) byKey.get(ev.key).items.push(ev);

  for (const ev of holidaysIn(year, month)) {
    if (inWeek(ev.key)) byKey.get(ev.key).items.push(ev);
  }

  // FOMC minutes 3 weeks after each meeting (approx), quad witching, earnings windows
  const fomc = await fetchFomc();
  for (const m of fomc) {
    if (inWeek(m.key)) byKey.get(m.key).items.push(m);
  }
  for (const m of fomc) {
    const d = new Date(m.date + "T14:00:00Z");
    d.setDate(d.getDate() + 21);
    const min = {
      date: d.toISOString().slice(0, 10),
      key: keyOf(d),
      time: "14:00",
      title: "FOMC Minutes (3 weeks post-meeting)",
      impact: IMPACT.MED,
      source: "FEDERAL RESERVE",
      approx: true,
    };
    if (inWeek(min.key)) byKey.get(min.key).items.push(min);
  }

  // Quad witching: 3rd Friday of Mar/Jun/Sep/Dec — 16:00 (options/futures expiry)
  for (const qm of [2, 5, 8, 11]) {
    const w = nthWeekday(year, qm, 5, 3);
    const ev = {
      date: isoDay(w),
      key: keyOf(w),
      time: "16:00",
      title: "Quad Witching — options & futures expiry (elevated volume)",
      impact: IMPACT.MED,
      source: "CME/OPEX",
      approx: false,
    };
    if (inWeek(ev.key)) byKey.get(ev.key).items.push(ev);
  }

  // Earnings season kickoffs (bank-heavy windows) — impact MED
  for (const [em, ed] of [[0, 14], [3, 14], [6, 15], [9, 14]]) {
    const w = nthWeekday(year, em, 5, 3); // ~3rd Friday of window month
    const ev = {
      date: isoDay(w),
      key: keyOf(w),
      time: "09:30",
      title: `Earnings season window opens (Q${em / 3 + 1} reports ramp up)`,
      impact: IMPACT.MED,
      source: "EARNINGS",
      approx: true,
    };
    if (inWeek(ev.key)) byKey.get(ev.key).items.push(ev);
  }

  // Weekly recurring: jobless claims (Thu 08:30), crude inventories (Wed 10:30)
  for (const d of events) {
    const dt = new Date(d.date + "T12:00:00Z");
    const dow = dt.getUTCDay();
    if (dow === 4) {
      d.items.push({ date: d.date, key: d.key, time: "08:30", title: "Initial Jobless Claims", impact: IMPACT.LOW, source: "DOL", approx: false });
    }
    if (dow === 3) {
      d.items.push({ date: d.date, key: d.key, time: "10:30", title: "EIA Crude Oil Inventories", impact: IMPACT.LOW, source: "EIA", approx: false });
    }
  }

  // Sort each day's items by time, then by impact weight
  const impactRank = { HIGH: 0, MED: 1, LOW: 2, CLOSED: 3 };
  for (const e of events) {
    e.items.sort((a, b) => (a.time.localeCompare(b.time) || (impactRank[a.impact] ?? 9) - (impactRank[b.impact] ?? 9)));
  }
  events.sort((a, b) => a.date.localeCompare(b.date));

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ generatedAt: new Date().toISOString(), weekStart: isoDay(weekStart), events }),
  };
}

export { handler };
