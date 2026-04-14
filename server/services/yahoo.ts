import yahooFinance from "yahoo-finance2";
import type { StockQuote, StockSearchResult, MarketIndex } from "../../shared/schema.js";

yahooFinance.suppressNotices(["yahooSurvey"]);

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query) return [];
  try {
    const results = await yahooFinance.search(query, { quotesCount: 10, newsCount: 0 });
    return (results.quotes || [])
      .filter((q: any) => q.symbol && (q.shortname || q.longname))
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: q.quoteType || "EQUITY",
        exchange: q.exchange || q.exchDisp || "",
      }));
  } catch {
    return [];
  }
}

export async function getQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const q = await yahooFinance.quote(symbol);
    if (!q) return null;
    return {
      symbol: q.symbol ?? symbol,
      name: q.longName || q.shortName || symbol,
      price: q.regularMarketPrice ?? 0,
      change: q.regularMarketChange ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      volume: q.regularMarketVolume,
      marketCap: q.marketCap,
      pe: q.trailingPE,
      week52High: q.fiftyTwoWeekHigh,
      week52Low: q.fiftyTwoWeekLow,
    };
  } catch {
    return null;
  }
}

export async function getQuotes(symbols: string[]): Promise<StockQuote[]> {
  if (symbols.length === 0) return [];
  try {
    const results = await yahooFinance.quote(symbols);
    const arr = Array.isArray(results) ? results : [results];
    return arr
      .filter((q: any) => q && q.symbol)
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.longName || q.shortName || q.symbol,
        price: q.regularMarketPrice ?? 0,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        volume: q.regularMarketVolume,
        marketCap: q.marketCap,
        pe: q.trailingPE,
        week52High: q.fiftyTwoWeekHigh,
        week52Low: q.fiftyTwoWeekLow,
      }));
  } catch {
    return [];
  }
}

export async function getIndices(): Promise<MarketIndex[]> {
  const symbols = ["^GSPC", "^IXIC", "^DJI"];
  const names: Record<string, string> = {
    "^GSPC": "S&P 500",
    "^IXIC": "NASDAQ",
    "^DJI": "DOW JONES",
  };
  const quotes = await getQuotes(symbols);
  return quotes.map((q) => ({
    symbol: q.symbol,
    name: names[q.symbol] || q.symbol,
    price: q.price,
    change: q.change,
    changePercent: q.changePercent,
  }));
}

export const POPULAR_SYMBOLS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO",
  "JPM", "V", "WMT", "MA", "UNH", "XOM", "JNJ", "PG",
  "HD", "COST", "ABBV", "BAC", "CVX", "KO", "PEP", "MRK",
  "ADBE", "CRM", "NFLX", "AMD", "INTC", "ORCL", "CSCO", "TXN",
  "QCOM", "IBM", "UBER", "PYPL", "SHOP", "SQ", "COIN", "PLTR",
  "SNOW", "DDOG", "NET", "ZM", "DIS", "NKE", "SBUX", "MCD",
  "BA", "GE", "F",
];

export async function getMovers(): Promise<{ gainers: StockQuote[]; losers: StockQuote[] }> {
  const quotes = await getQuotes(POPULAR_SYMBOLS);
  const valid = quotes.filter((q) => typeof q.changePercent === "number" && !isNaN(q.changePercent));
  const sorted = [...valid].sort((a, b) => b.changePercent - a.changePercent);
  return {
    gainers: sorted.slice(0, 8),
    losers: sorted.slice(-8).reverse(),
  };
}
