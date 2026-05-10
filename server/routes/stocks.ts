import { Router } from "express";
import { searchStocks, getQuote } from "../services/yahoo.js";
import { getCompanyNews } from "../services/news.js";
import { CandlesUnavailableError, getCandles, type Timeframe } from "../services/candles.js";
import { rateLimitByIp } from "../services/rateLimit.js";

export const stocksRouter = Router();

stocksRouter.get(
  "/search",
  rateLimitByIp({ name: "stocks-search", limit: 30, window: "1 m" }),
  async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json([]);
    const results = await searchStocks(q);
    res.json(results);
  }
);

stocksRouter.get(
  "/:symbol/quote",
  rateLimitByIp({ name: "stocks-quote", limit: 60, window: "1 m" }),
  async (req, res) => {
    const symbol = String(req.params.symbol).toUpperCase();
    const quote = await getQuote(symbol);
    if (!quote) return res.status(404).json({ error: "Not found" });
    res.json(quote);
  }
);

stocksRouter.get(
  "/:symbol/news",
  rateLimitByIp({ name: "stocks-news", limit: 30, window: "1 m" }),
  async (req, res) => {
    const symbol = String(req.params.symbol).toUpperCase();
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
    const items = await getCompanyNews(symbol, limit);
    res.json(items);
  }
);

const VALID_TIMEFRAMES: Timeframe[] = ["1W", "1M", "3M", "6M", "1Y", "5Y"];

stocksRouter.get(
  "/:symbol/candles",
  rateLimitByIp({ name: "stocks-candles", limit: 30, window: "1 m" }),
  async (req, res) => {
    const symbol = String(req.params.symbol).toUpperCase();
    const tfRaw = String(req.query.timeframe ?? "6M").toUpperCase();
    const timeframe = (VALID_TIMEFRAMES.includes(tfRaw as Timeframe)
      ? (tfRaw as Timeframe)
      : "6M") as Timeframe;

    try {
      const candles = await getCandles(symbol, timeframe);
      res.json({ symbol, timeframe, candles });
    } catch (err) {
      if (err instanceof CandlesUnavailableError) {
        return res.status(503).json({ error: err.message });
      }
      console.error("[candles route]", err);
      res.status(500).json({ error: "Failed to load candles" });
    }
  }
);
