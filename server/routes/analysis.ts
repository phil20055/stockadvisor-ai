import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { analysisHistory } from "../../shared/schema.js";
import { currentUser, requireAuth } from "../auth.js";
import { getQuote } from "../services/yahoo.js";
import { analyzePortfolio, chatAboutAnalysis } from "../services/analysis.js";
import { getTrackRecordPromptContext, savePredictions } from "../services/trackRecord.js";
import {
  deepReadDirectionToRecommendation,
  generateDeepRead,
} from "../services/deepRead.js";

export const analysisRouter = Router();

// All AI endpoints require auth — checked BEFORE any Anthropic / Finnhub call.
// Phase 2 will add a per-IP guest path for portfolio + deep-read (1/day),
// but until that lands the gate is hard-closed for guests.
analysisRouter.use(requireAuth);

// --- Schemas --------------------------------------------------------------

const TICKER = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^[A-Za-z0-9.\-^]+$/, "Invalid ticker");

const portfolioBodySchema = z
  .object({
    portfolio: z
      .array(
        z
          .object({
            symbol: TICKER,
            shares: z.number().finite().positive().max(1_000_000_000),
          })
          .strict()
      )
      .min(1)
      .max(50),
  })
  .strict();

const deepReadBodySchema = z
  .object({
    symbol: TICKER,
  })
  .strict();

const chatBodySchema = z
  .object({
    analysis: z
      .object({
        summary: z.string(),
        totalValue: z.number(),
        recommendations: z
          .array(
            z
              .object({
                symbol: z.string(),
                name: z.string(),
                recommendation: z.enum(["Buy", "Hold", "Sell"]),
                confidence: z.enum(["Low", "Medium", "High"]),
                reasoning: z.string(),
                keyFactors: z.array(z.string()),
                riskLevel: z.enum(["Low", "Medium", "High"]),
                targetPrice: z.number().nullable(),
                currentPrice: z.number(),
                change: z.number(),
                changePercent: z.number(),
              })
              .strict()
          )
          .min(1)
          .max(50),
      })
      .strict(),
    history: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(4000),
          })
          .strict()
      )
      .min(1)
      .max(40),
  })
  .strict();

function jsonOnly(req: any, res: any, next: any) {
  // Block requests that aren't application/json — light CSRF defense for
  // state-changing endpoints. Browsers can't send a JSON Content-Type from
  // simple cross-origin form submissions.
  const ct = req.headers["content-type"] || "";
  if (!String(ct).toLowerCase().startsWith("application/json")) {
    return res.status(415).json({ error: "Content-Type must be application/json" });
  }
  next();
}

// --- Routes ---------------------------------------------------------------

analysisRouter.post("/portfolio", jsonOnly, async (req, res) => {
  const user = currentUser(req)!; // requireAuth ran above — non-null
  const parsed = portfolioBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const quoted = await Promise.all(
    parsed.data.portfolio.map(async (p) => {
      const symbol = p.symbol.toUpperCase();
      const quote = await getQuote(symbol);
      return { symbol, shares: p.shares, quote };
    })
  );

  try {
    const trackRecordContext = await getTrackRecordPromptContext();
    const analysis = await analyzePortfolio(quoted, trackRecordContext);

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

    res.json(analysis);
  } catch (err) {
    console.error("[analysis/portfolio]", err);
    res.status(500).json({ error: "Analysis failed" });
  }
});

analysisRouter.post("/deep-read", jsonOnly, async (req, res) => {
  const user = currentUser(req)!;
  const parsed = deepReadBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const symbol = parsed.data.symbol.toUpperCase();

  try {
    const analysis = await generateDeepRead(symbol);

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
      await db.insert(analysisHistory).values({
        userId: user.id,
        symbol: analysis.symbol,
        companyName: analysis.name,
        analysisText: analysis.reasoning,
        recommendation: deepReadDirectionToRecommendation(analysis.direction),
        targetPrice: analysis.targetPrice,
        riskLevel:
          analysis.confidence >= 70 ? "Low" : analysis.confidence >= 41 ? "Medium" : "High",
        confidence:
          analysis.confidence >= 71 ? "High" : analysis.confidence >= 41 ? "Medium" : "Low",
        keyFactors: analysis.keyFactors,
        currentPrice: analysis.currentPrice,
      });
    } catch (err) {
      console.error("[analysis/deep-read save]", err);
    }

    res.json(analysis);
  } catch (err) {
    console.error("[analysis/deep-read]", err);
    res.status(500).json({ error: "Deep read failed" });
  }
});

analysisRouter.post("/chat", jsonOnly, async (req, res) => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const { analysis, history } = parsed.data;

  if (history[history.length - 1].role !== "user") {
    return res.status(400).json({ error: "Last message must be from user" });
  }

  try {
    const reply = await chatAboutAnalysis({
      analysis: analysis as any,
      history: history as any,
    });
    res.json({ role: "assistant", content: reply });
  } catch (err) {
    console.error("[analysis/chat]", err);
    res.status(500).json({ error: "Chat failed" });
  }
});
