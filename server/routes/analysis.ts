import { Router } from "express";
import { db } from "../db.js";
import { analysisHistory } from "../../shared/schema.js";
import { currentUser } from "../auth.js";
import { getQuote } from "../services/yahoo.js";
import { analyzePortfolio, chatAboutAnalysis } from "../services/analysis.js";
import { getTrackRecordPromptContext, savePredictions } from "../services/trackRecord.js";
import {
  deepReadDirectionToRecommendation,
  generateDeepRead,
} from "../services/deepRead.js";

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
    const trackRecordContext = await getTrackRecordPromptContext();
    const analysis = await analyzePortfolio(quoted, trackRecordContext);

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

      const predictions = analysis.recommendations
        .filter((r) => Number.isFinite(r.currentPrice) && r.currentPrice > 0)
        .map((r) => ({
          userId: user.id,
          symbol: r.symbol,
          recommendation: r.recommendation,
          targetPrice: r.targetPrice ?? null,
          priceAtPrediction: r.currentPrice,
        }));

      if (rows.length > 0) {
        await db.insert(analysisHistory).values(rows);
      }
      if (predictions.length > 0) {
        await savePredictions(predictions);
      }
    }

    res.json(analysis);
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ error: "Analysis failed", detail: String((err as Error).message) });
  }
});

analysisRouter.post("/deep-read", async (req, res) => {
  const symbol = String(req.body?.symbol ?? "").toUpperCase().trim();
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });

  try {
    const analysis = await generateDeepRead(symbol);

    // Save to prediction_outcomes for the self-improvement loop. Skip for guests.
    const user = currentUser(req);
    if (user) {
      try {
        await savePredictions([
          {
            userId: user.id,
            symbol: analysis.symbol,
            recommendation: deepReadDirectionToRecommendation(analysis.direction),
            targetPrice: analysis.targetPrice,
            priceAtPrediction: analysis.currentPrice,
            source: "deep_read",
          },
        ]);
        // Also drop a row into analysis_history so the legacy History view stays useful.
        await db.insert(analysisHistory).values({
          userId: user.id,
          symbol: analysis.symbol,
          companyName: analysis.name,
          analysisText: analysis.reasoning,
          recommendation: deepReadDirectionToRecommendation(analysis.direction),
          targetPrice: analysis.targetPrice,
          riskLevel: analysis.confidence >= 70 ? "Low" : analysis.confidence >= 41 ? "Medium" : "High",
          confidence:
            analysis.confidence >= 71 ? "High" : analysis.confidence >= 41 ? "Medium" : "Low",
          keyFactors: analysis.keyFactors,
          currentPrice: analysis.currentPrice,
        });
      } catch (err) {
        console.error("[deep-read save]", err);
      }
    }

    res.json(analysis);
  } catch (err) {
    console.error("Deep read error:", err);
    res
      .status(500)
      .json({ error: "Deep read failed", detail: String((err as Error).message) });
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
