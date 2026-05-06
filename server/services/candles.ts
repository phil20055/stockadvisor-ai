import type { Candle } from "../../shared/schema.js";

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const ALPHA_BASE = "https://www.alphavantage.co/query";

const TTL_MS = 5 * 60_000; // 5-minute cache per (symbol, timeframe)
const cache = new Map<string, { value: Candle[]; expiresAt: number }>();

export type Timeframe = "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y";

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "1W": 7,
  "1M": 31,
  "3M": 93,
  "6M": 186,
  "1Y": 372,
  "5Y": 1830,
};

export class CandlesUnavailableError extends Error {
  constructor() {
    super("Historical data temporarily unavailable");
    this.name = "CandlesUnavailableError";
  }
}

/**
 * Try Finnhub first (most callers won't have it on the free tier — that
 * endpoint is paywalled now). Fall back to Alpha Vantage TIME_SERIES_DAILY.
 *
 * Note: we deliberately don't ship a 1D timeframe — intraday data isn't
 * available on free tiers of either provider.
 */
export async function getCandles(
  symbol: string,
  timeframe: Timeframe = "6M"
): Promise<Candle[]> {
  const key = `${symbol.toUpperCase()}:${timeframe}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const days = TIMEFRAME_DAYS[timeframe];

  // 1) Try Finnhub
  const finnhub = await tryFinnhubCandles(symbol, days);
  if (finnhub && finnhub.length > 0) {
    cache.set(key, { value: finnhub, expiresAt: Date.now() + TTL_MS });
    return finnhub;
  }

  // 2) Fallback — Alpha Vantage. Note: needs ALPHA_VANTAGE_API_KEY env var.
  console.warn(
    `[candles] Finnhub returned no data for ${symbol} — falling back to Alpha Vantage. ` +
      `(Free Finnhub doesn't include candle data; this is the expected path.)`
  );
  const av = await tryAlphaVantageCandles(symbol);
  if (av && av.length > 0) {
    const sliced = av.slice(-days);
    cache.set(key, { value: sliced, expiresAt: Date.now() + TTL_MS });
    return sliced;
  }

  throw new CandlesUnavailableError();
}

// --- Finnhub --------------------------------------------------------------

async function tryFinnhubCandles(symbol: string, days: number): Promise<Candle[] | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;
    const url = `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(
      symbol
    )}&resolution=D&from=${from}&to=${to}&token=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.s !== "ok" || !Array.isArray(data.t) || data.t.length === 0) return null;

    const candles: Candle[] = data.t.map((t: number, i: number) => ({
      time: new Date(t * 1000).toISOString().slice(0, 10),
      open: Number(data.o[i]),
      high: Number(data.h[i]),
      low: Number(data.l[i]),
      close: Number(data.c[i]),
      volume: Number(data.v?.[i] ?? 0),
    }));
    return candles;
  } catch {
    return null;
  }
}

// --- Alpha Vantage --------------------------------------------------------

let avBackoffUntil = 0;

async function tryAlphaVantageCandles(symbol: string): Promise<Candle[] | null> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) {
    console.warn("[candles] ALPHA_VANTAGE_API_KEY not set");
    return null;
  }
  if (Date.now() < avBackoffUntil) return null;

  try {
    // outputsize=compact (default, free tier) returns the last ~100 trading
    // days. outputsize=full is now a paid feature — see the rate-limit
    // warning Alpha Vantage emits for free keys. 100 days covers 1W/1M/3M
    // and most of 6M; 1Y/5Y are capped to whatever fits.
    const url = `${ALPHA_BASE}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(
      symbol
    )}&outputsize=compact&apikey=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    // Free-tier limit / paywall responses come back 200 OK with a
    // human-readable "Note" or "Information" field.
    if (data?.Note || data?.Information) {
      console.warn("[candles] Alpha Vantage rate-limited:", data.Note ?? data.Information);
      avBackoffUntil = Date.now() + 60_000;
      return null;
    }

    const series = data["Time Series (Daily)"];
    if (!series || typeof series !== "object") return null;

    const candles: Candle[] = Object.entries(series)
      .map(([date, raw]: [string, any]) => ({
        time: date,
        open: parseFloat(raw["1. open"]),
        high: parseFloat(raw["2. high"]),
        low: parseFloat(raw["3. low"]),
        close: parseFloat(raw["4. close"]),
        volume: parseFloat(raw["5. volume"]),
      }))
      .filter(
        (c) =>
          Number.isFinite(c.open) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          Number.isFinite(c.close)
      )
      .sort((a, b) => a.time.localeCompare(b.time));

    return candles;
  } catch (err) {
    console.error("[candles] Alpha Vantage error:", (err as Error).message);
    return null;
  }
}
