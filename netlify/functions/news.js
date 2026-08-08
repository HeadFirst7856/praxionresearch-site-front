/**
 * Praxion Terminal — news proxy (Netlify function).
 *
 * Fetches market/finance RSS feeds server-side (avoids CORS), normalizes items,
 * and best-effort geo-tags each story so the terminal globe can place dots.
 *
 * Geo resolution order:
 *   1. Explicit keyword/city match in title + description (major financial centers)
 *   2. Source default location
 *   3. null (dot omitted)
 *
 * Route: /api/v1/news  (netlify.toml redirect -> /.netlify/functions/news)
 */

const FEEDS = [
  {
    name: "CNBC",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    fallback: "New York, USA",
    loc: [40.7128, -74.006],
  },
  {
    name: "BBC",
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
    fallback: "London, UK",
    loc: [51.5074, -0.1278],
  },
  {
    name: "MARKETWATCH",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    fallback: "New York, USA",
    loc: [40.7128, -74.006],
  },
  {
    name: "YAHOO",
    url: "https://finance.yahoo.com/news/rssindex",
    fallback: "New York, USA",
    loc: [40.7128, -74.006],
  },
];

// Major financial centers keyword -> [lat, lng]
const LOCATIONS = [
  { keys: ["washington", "white house", "fed", "federal reserve", "senate", "congress", "treasury"], loc: [38.9072, -77.0369], label: "Washington DC" },
  { keys: ["new york", "wall street", "manhattan", "nyse", "nasdaq"], loc: [40.7128, -74.006], label: "New York" },
  { keys: ["london", "ftse", "city of london", "boe", "bank of england"], loc: [51.5074, -0.1278], label: "London" },
  { keys: ["beijing", "china", "pboc", "chinese"], loc: [39.9042, 116.4074], label: "Beijing" },
  { keys: ["tokyo", "japan", "boj", "nikkei"], loc: [35.6762, 139.6503], label: "Tokyo" },
  { keys: ["frankfurt", "germany", "dax", "bundesbank", "european central bank", "ecb"], loc: [50.1109, 8.6821], label: "Frankfurt" },
  { keys: ["paris", "france", "cac"], loc: [48.8566, 2.3522], label: "Paris" },
  { keys: ["hong kong", "hkex", "hang seng"], loc: [22.3193, 114.1694], label: "Hong Kong" },
  { keys: ["singapore", "mas singapore"], loc: [1.3521, 103.8198], label: "Singapore" },
  { keys: ["sydney", "australia", "rba", "asx"], loc: [-33.8688, 151.2093], label: "Sydney" },
  { keys: ["mumbai", "india", "rbi", "sensex", "nifty"], loc: [19.076, 72.8777], label: "Mumbai" },
  { keys: ["seoul", "south korea", "kospi", "bank of korea"], loc: [37.5665, 126.978], label: "Seoul" },
  { keys: ["moscow", "russia", "cbr", "ruble"], loc: [55.7558, 37.6173], label: "Moscow" },
  { keys: ["brussels", "belgium", "eu ", "european union", "european commission"], loc: [50.8503, 4.3517], label: "Brussels" },
  { keys: ["zurich", "switzerland", "snb", "swiss"], loc: [47.3769, 8.5417], label: "Zurich" },
  { keys: ["toronto", "canada", "bank of canada", "tsx"], loc: [43.6532, -79.3832], label: "Toronto" },
  { keys: ["sao paulo", "brazil", "bovespa", "copom"], loc: [-23.5505, -46.6333], label: "Sao Paulo" },
  { keys: ["dubai", "uae", "adx", "dubai financial"], loc: [25.2048, 55.2708], label: "Dubai" },
  { keys: ["saudi", "riyadh", "aramco", "sama"], loc: [24.7136, 46.6753], label: "Riyadh" },
  { keys: ["oslo", "norway", "norges bank"], loc: [59.9139, 10.7522], label: "Oslo" },
  { keys: ["amsterdam", "netherlands", "dutch"], loc: [52.3676, 4.9041], label: "Amsterdam" },
  { keys: ["madrid", "spain", "iban", "banco de espana"], loc: [40.4168, -3.7038], label: "Madrid" },
  { keys: ["milan", "italy", "ftse mib", "banca d'italia"], loc: [45.4642, 9.19], label: "Milan" },
  { keys: ["kuala lumpur", "malaysia", "bursa"], loc: [3.139, 101.6869], label: "Kuala Lumpur" },
  { keys: ["bangkok", "thailand", "set index", "bank of thailand"], loc: [13.7563, 100.5018], label: "Bangkok" },
  { keys: ["mexico city", "mexico", "banxico", "ipc"], loc: [19.4326, -99.1332], label: "Mexico City" },
  { keys: ["johannesburg", "south africa", "sarb", "jse"], loc: [-26.2041, 28.0473], label: "Johannesburg" },
];

function stripHtml(input) {
  return String(input ?? "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRss(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const grab = (tag) => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const hit = re.exec(block);
      return hit ? stripHtml(hit[1]) : "";
    };
    const pubRaw = grab("pubDate") || grab("date");
    items.push({
      title: grab("title"),
      link: grab("link"),
      pub: pubRaw,
      desc: grab("description").slice(0, 300),
    });
  }
  return items;
}

function geoTag(item, feed) {
  const haystack = `${item.title} ${item.desc}`.toLowerCase();
  for (const entry of LOCATIONS) {
    if (entry.keys.some((k) => haystack.includes(k))) {
      return { lat: entry.loc[0], lng: entry.loc[1], label: entry.label };
    }
  }
  if (feed.loc) {
    return { lat: feed.loc[0], lng: feed.loc[1], label: feed.fallback };
  }
  return null;
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

  const timeoutMs = 9000;
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "Mozilla/5.0 (PraxionTerminal/1.0)" },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const parsed = parseRss(xml);
        return parsed.map((item) => ({
          source: feed.name,
          title: item.title,
          link: item.link,
          desc: item.desc,
          pub: item.pub,
          geo: geoTag(item, feed),
        }));
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  let items = [];
  for (const r of results) {
    if (r.status === "fulfilled") items = items.concat(r.value);
    else console.error("news feed error:", r.reason?.message ?? r.reason);
  }

  // Dedupe by title, newest first, cap at 60.
  // Sort by parsed epoch — feeds mix RFC-822 and ISO-8601 pubDate formats,
  // so string comparison would silently strand one feed at the bottom.
  const seen = new Set();
  items = items
    .filter((i) => {
      const key = i.title.toLowerCase().slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const ta = Date.parse(a.pub) || 0;
      const tb = Date.parse(b.pub) || 0;
      return tb - ta;
    })
    .slice(0, 60);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ generatedAt: new Date().toISOString(), items }),
  };
}
