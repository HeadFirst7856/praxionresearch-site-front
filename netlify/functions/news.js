/**
 * Praxion Terminal — feed proxy (Netlify function).
 *
 * Serves three feed groups for the terminal's collapsible columns:
 *   news   — market/finance RSS (CNBC, BBC, MarketWatch, Yahoo), geo-tagged for the globe
 *   reddit — r/wallstreetbets + r/stocks + r/investing hot posts (market sentiment)
 *   sec    — SEC EDGAR latest filings (8-K, 10-Q, 10-K, 4), via the browse-edgar atom feed
 *
 * All fetching is server-side to avoid CORS. Route: /api/v1/news
 */

const NEWS_FEEDS = [
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

const REDDIT_SUBS = [
  { name: "WALLSTREETBETS", sub: "wallstreetbets" },
  { name: "STOCKS", sub: "stocks" },
  { name: "INVESTING", sub: "investing" },
];

// Reddit rate-limits bursts (~1 req/45-60s per IP). We rotate one sub per poll
// and serve the others from cache, so each sub refreshes every ~3 polls.
const redditCache = new Map(); // sub -> { items, fetchedAt }
let redditRotation = 0;

const SEC_TYPES = ["8-K", "10-Q", "10-K", "4"];

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
  { keys: ["oslo", "norway", "norges bank"], loc: [59.9139, 10.7225], label: "Oslo" },
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
    items.push({
      title: grab("title"),
      link: grab("link"),
      pub: grab("pubDate") || grab("date"),
      desc: grab("description").slice(0, 300),
    });
  }
  return items;
}

function parseAtom(xml) {
  // SEC browse-edgar atom feed: <entry><title>..</title><link href=".."/><updated>..</updated><summary>..</summary>
  const items = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    const grab = (tag) => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const hit = re.exec(block);
      return hit ? stripHtml(hit[1]) : "";
    };
    const linkRe = /<link[^>]*href="([^"]+)"/i;
    const linkHit = linkRe.exec(block);
    items.push({
      title: grab("title"),
      link: linkHit ? linkHit[1] : "",
      pub: grab("updated") || grab("published"),
      desc: grab("summary").slice(0, 300),
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

async function fetchWithTimeout(url, opts = {}, ms = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNews() {
  const results = await Promise.allSettled(
    NEWS_FEEDS.map(async (feed) => {
      const xml = await fetchWithTimeout(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (PraxionTerminal/1.0)" },
      });
      const parsed = parseRss(xml);
      return parsed.map((item) => ({
        source: feed.name,
        title: item.title,
        link: item.link,
        desc: item.desc,
        pub: item.pub,
        geo: geoTag(item, feed),
      }));
    }),
  );

  let items = [];
  for (const r of results) {
    if (r.status === "fulfilled") items = items.concat(r.value);
    else console.error("news feed error:", r.reason?.message ?? r.reason);
  }
  return dedupeSortCap(items, 60);
}

async function fetchReddit() {
  const target = REDDIT_SUBS[redditRotation % REDDIT_SUBS.length];
  redditRotation += 1;

  try {
    const text = await fetchWithTimeout(`https://www.reddit.com/r/${target.sub}/.rss?limit=12`, {
      headers: { "User-Agent": "PraxionTerminal/1.0 (research desk)" },
    });
    const parsed = parseAtom(text);
    redditCache.set(target.sub, {
      items: parsed.map((item) => ({
        source: `R/${target.name}`,
        title: item.title,
        link: item.link,
        desc: item.desc,
        pub: item.pub,
        geo: null,
      })),
      fetchedAt: Date.now(),
    });
  } catch (e) {
    console.error("reddit feed error:", e?.message ?? e);
  }

  let items = [];
  for (const { items: cached } of redditCache.values()) {
    items = items.concat(cached);
  }
  return dedupeSortCap(items, 30);
}

async function fetchSec() {
  const results = await Promise.allSettled(
    SEC_TYPES.map(async (type) => {
      const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(type)}&company=&dateb=&owner=include&count=12&output=atom`;
      const xml = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": "Praxion Research Desk desk@praxionresearch.com",
          Accept: "application/atom+xml, application/xml, text/xml",
        },
      });
      const parsed = parseAtom(xml);
      return parsed.map((item) => ({
        source: `SEC ${type}`,
        title: item.title,
        link: item.link,
        desc: item.desc,
        pub: item.pub,
        geo: null,
      }));
    }),
  );

  let items = [];
  for (const r of results) {
    if (r.status === "fulfilled") items = items.concat(r.value);
    else console.error("sec feed error:", r.reason?.message ?? r.reason);
  }
  return dedupeSortCap(items, 40);
}

function dedupeSortCap(items, cap) {
  const seen = new Set();
  return items
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
    .slice(0, cap);
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

  const [news, reddit, sec] = await Promise.all([fetchNews(), fetchReddit(), fetchSec()]);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ generatedAt: new Date().toISOString(), news, reddit, sec }),
  };
}
