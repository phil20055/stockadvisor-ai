import { Router } from "express";
import { db } from "../db.js";
import { analysisHistory } from "../../shared/schema.js";
import { currentUser } from "../auth.js";
import { getQuote } from "../services/yahoo.js";
import { analyzePortfolio } from "../services/analysis.js";

export const analysisRouter = Router();

analysisRouter.post("/portfolio", async (req, res) => {
  const portfolio = Array.isArray(req.body?.portfolio) ? req.body.portfolio : [];

  if (portfolio.length === 0) {
    return res.status(400).json({ error: "Portfolio is empty" });
  }

  const quoted = await Promise.all(
    portfolio.map(async (p: any) => {
      const symbol = String(p.symbol || "").toUpperCase();
      const shares = Number(p.shares) || 0;
      const quote = await getQuote(symbol);
      return { symbol, shares, quote };
    })
  );

  try {
    const analysis = await analyzePortfolio(quoted);

    const user = currentUser(req);
    if (user) {
      const rows = analysis.recommendations.map((r) => ({
        userId: user.id,
        symbol: r.symbol,
        companyName: r.name,
        analysisText: r.reasoning,
        recommendation: r.recommendation,
        targetPrice: r.targetPrice ?? null,
        riskLevel: r.riskLevel,
        confidence: r.confidence,
        keyFactors: r.keyFactors,
        currentPrice: r.currentPrice,
      }));
      if (rows.length > 0) {
        await db.insert(analysisHistory).values(rows);
      }
    }

    res.json(analysis);
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ error: "Analysis failed", detail: String((err as Error).message) });
  }
});
