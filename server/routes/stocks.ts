import { Router } from "express";
import { searchStocks, getQuote } from "../services/yahoo.js";
import { getCompanyNews } from "../services/news.js";

export const stocksRouter = Router();

stocksRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json([]);
  const results = await searchStocks(q);
  res.json(results);
});

stocksRouter.get("/:symbol/quote", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const quote = await getQuote(symbol);
  if (!quote) return res.status(404).json({ error: "Not found" });
  res.json(quote);
});

stocksRouter.get("/:symbol/news", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
  const items = await getCompanyNews(symbol, limit);
  res.json(items);
});
