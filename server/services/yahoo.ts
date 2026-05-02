import type { StockQuote, StockSearchResult, MarketIndex } from "../../shared/schema.js";

// Finnhub-backed stock data service. File kept as yahoo.ts so existing
// import paths still work; the underlying provider is Finnhub now because
// Yahoo Finance blocks cloud-datacenter IPs.

const FINNHUB_BASE = "https://finnhub.io/api/v1";

function apiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY not set");
  return key;
}

async function finnhub<T>(path: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${FINNHUB_BASE}${path}${sep}token=${apiKey()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

// Cache helpers ------------------------------------------------------------

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

// Profile (name) cache — these don't change, keep effectively forever.
const profileNames = new Map<string, string>();

async function getCompanyName(symbol: string): Promise<string> {
  const cached = profileNames.get(symbol);
  if (cached) return cached;
  try {
    const profile = await finnhub<{ name?: string }>(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`);
    const name = profile.name || symbol;
    profileNames.set(symbol, name);
    return name;
  } catch {
    return symbol;
  }
}

// API surface --------------------------------------------------------------

type FinnhubQuote = {
  c: number; // current price
  d: number; // change
  dp: number; // change percent
  h: number;
  l: number;
  o: number;
  pc: number; // previous close
  t: number;
};

type FinnhubSearch = {
  count: number;
  result: Array<{
    description: string;
    displaySymbol: string;
    symbol: string;
    type: string;
  }>;
};

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query) return [];
  try {
    const data = await cached(`search:${query}`, 60_000, () =>
      finnhub<FinnhubSearch>(`/search?q=${encodeURIComponent(query)}`)
    );
    return (data.result || [])
      .filter((r) => r.symbol && r.description && r.type !== "Crypto" && !r.symbol.includes("."))
      .slice(0, 10)
      .map((r) => ({
        symbol: r.symbol,
        name: r.description,
        type: r.type || "Stock",
        exchange: r.displaySymbol?.split(":")[0] === r.symbol ? "" : r.displaySymbol || "",
      }));
  } catch (err) {
    console.error("[finnhub.search]", (err as Error).message);
    return [];
  }
}

export async function getQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const sym = symbol.toUpperCase();
    const q = await cached(`quote:${sym}`, 30_000, () =>
      finnhub<FinnhubQuote>(`/quote?symbol=${encodeURIComponent(sym)}`)
    );
    if (!q || typeof q.c !== "number" || q.c === 0) return null;
    const name = await getCompanyName(sym);
    return {
      symbol: sym,
      name,
      price: q.c,
      change: q.d ?? 0,
      changePercent: q.dp ?? 0,
      week52High: q.h,
      week52Low: q.l,
    };
  } catch (err) {
    console.error(`[finnhub.quote ${symbol}]`, (err as Error).message);
    return null;
  }
}

export async function getQuotes(symbols: string[]): Promise<StockQuote[]> {
  const results = await Promise.all(symbols.map((s) => getQuote(s)));
  return results.filter((q): q is StockQuote => q !== null);
}

// Market indices: free Finnhub doesn't expose ^GSPC/^IXIC/^DJI directly,
// so we use the matching ETFs as proxies (close enough visually).
const INDEX_PROXIES: Array<{ symbol: string; proxy: string; name: string }> = [
  { symbol: "^GSPC", proxy: "SPY", name: "S&P 500" },
  { symbol: "^IXIC", proxy: "QQQ", name: "NASDAQ" },
  { symbol: "^DJI", proxy: "DIA", name: "DOW JONES" },
];

export async function getIndices(): Promise<MarketIndex[]> {
  return cached("indices", 60_000, async () => {
    const quotes = await Promise.all(
      INDEX_PROXIES.map(async ({ symbol, proxy, name }) => {
        const q = await getQuote(proxy);
        if (!q) return null;
        return {
          symbol,
          name,
          price: q.price,
          change: q.change,
          changePercent: q.changePercent,
        };
      })
    );
    return quotes.filter((q): q is MarketIndex => q !== null);
  });
}

export const POPULAR_SYMBOLS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO",
  "JPM", "V", "WMT", "MA", "UNH", "XOM", "JNJ", "PG",
  "HD", "COST", "ABBV", "BAC", "CVX", "KO", "PEP", "MRK",
  "ADBE", "CRM", "NFLX", "AMD", "INTC", "ORCL", "CSCO", "TXN",
  "QCOM", "IBM", "UBER", "PYPL", "SHOP", "DIS", "NKE", "SBUX",
  "MCD", "BA", "GE", "F", "PLTR", "COIN", "SNOW", "ABNB",
  "GS", "PFE",
];

export async function getMovers(): Promise<{ gainers: StockQuote[]; losers: StockQuote[] }> {
  return cached("movers", 5 * 60_000, async () => {
    // Stagger requests to stay under 60/min.
    const all: StockQuote[] = [];
    const batchSize = 10;
    for (let i = 0; i < POPULAR_SYMBOLS.length; i += batchSize) {
      const batch = POPULAR_SYMBOLS.slice(i, i + batchSize);
      const quotes = await Promise.all(batch.map((s) => getQuote(s)));
      for (const q of quotes) if (q) all.push(q);
    }
    const valid = all.filter((q) => Number.isFinite(q.changePercent));
    const sorted = [...valid].sort((a, b) => b.changePercent - a.changePercent);
    return {
      gainers: sorted.slice(0, 8),
      losers: sorted.slice(-8).reverse(),
    };
  });
}
