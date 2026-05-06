import type { StockNews } from "../../shared/schema.js";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

type CacheEntry = { value: StockNews[]; expiresAt: number };
const newsCache = new Map<string, CacheEntry>();
const TTL = 15 * 60_000; // 15 min

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getCompanyNews(symbol: string, limit = 5): Promise<StockNews[]> {
  const sym = symbol.toUpperCase();
  const hit = newsCache.get(sym);
  if (hit && hit.expiresAt > Date.now()) return hit.value.slice(0, limit);

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];

  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const url = `${FINNHUB_BASE}/company-news?symbol=${encodeURIComponent(sym)}&from=${ymd(
    from
  )}&to=${ymd(to)}&token=${key}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any[] = await res.json();
    const items: StockNews[] = (data || [])
      .filter((n) => n.headline && n.url && n.datetime)
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 20)
      .map((n) => ({
        id: n.id,
        headline: n.headline,
        source: n.source || "",
        url: n.url,
        datetime: n.datetime,
        image: n.image || undefined,
        summary: n.summary || undefined,
      }));
    newsCache.set(sym, { value: items, expiresAt: Date.now() + TTL });
    return items.slice(0, limit);
  } catch {
    return [];
  }
}
