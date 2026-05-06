import { Router } from "express";
import { db } from "../db.js";
import { analysisHistory } from "../../shared/schema.js";
import { currentUser } from "../auth.js";
import { getQuote } from "../services/yahoo.js";
import { analyzePortfolio, chatAboutAnalysis } from "../services/analysis.js";

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

analysisRouter.post("/chat", async (req, res) => {
  const analysis = req.body?.analysis;
  const history = req.body?.history;

  if (!analysis || !Array.isArray(analysis?.recommendations)) {
    return res.status(400).json({ error: "Missing analysis context" });
  }
  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: "Missing conversation history" });
  }

  // Validate / sanitize message shape.
  const cleanHistory = history
    .filter(
      (m: any) =>
        m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
    )
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

  if (cleanHistory.length === 0 || cleanHistory[cleanHistory.length - 1].role !== "user") {
    return res.status(400).json({ error: "Last message must be from user" });
  }

  try {
    const reply = await chatAboutAnalysis({ analysis, history: cleanHistory });
    res.json({ role: "assistant", content: reply });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Chat failed", detail: String((err as Error).message) });
  }
});
