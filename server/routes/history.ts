import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { analysisHistory } from "../../shared/schema.js";
import type { CallOutcome, TrackRecord, TrackedCall } from "../../shared/schema.js";
import { requireAuth, currentUser } from "../auth.js";
import { getQuote } from "../services/yahoo.js";
import { rateLimitByUser } from "../services/rateLimit.js";

export const historyRouter = Router();

historyRouter.use(requireAuth);
// GET /history fans out one Yahoo quote call per unique symbol — tighter cap
// than other authed read endpoints so a user can't accidentally hammer it.
historyRouter.use(rateLimitByUser({ name: "history", limit: 30, window: "1 m" }));

const SETTLE_DAYS = 14; // calls older than this are evaluated as settled

historyRouter.get("/", async (req, res) => {
  const user = currentUser(req)!;
  const rows = await db
    .select()
    .from(analysisHistory)
    .where(eq(analysisHistory.userId, user.id))
    .orderBy(desc(analysisHistory.analyzedAt));

  const uniqueSymbols = [...new Set(rows.map((r) => r.symbol))];
  const quotes = await Promise.all(uniqueSymbols.map((s) => getQuote(s)));
  const priceBySymbol = new Map<string, number>();
  for (const q of quotes) {
    if (q && Number.isFinite(q.price)) priceBySymbol.set(q.symbol.toUpperCase(), q.price);
  }

  const calls: TrackedCall[] = rows.map((row) => {
    const priceNow = priceBySymbol.get(row.symbol.toUpperCase()) ?? null;
    const priceAtCall = row.currentPrice ?? null;
    const daysSince = Math.floor(
      (Date.now() - new Date(row.analyzedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    let changeSince: number | null = null;
    let changeSincePercent: number | null = null;
    if (priceNow != null && priceAtCall != null && priceAtCall > 0) {
      changeSince = priceNow - priceAtCall;
      changeSincePercent = (changeSince / priceAtCall) * 100;
    }

    let outcome: CallOutcome = "open";
    if (changeSincePercent != null) {
      const moved = changeSincePercent;
      const settled = daysSince >= SETTLE_DAYS;
      if (settled) {
        if (row.recommendation === "Buy") {
          outcome = moved > 1 ? "win" : moved < -1 ? "loss" : "neutral";
        } else if (row.recommendation === "Sell") {
          outcome = moved < -1 ? "win" : moved > 1 ? "loss" : "neutral";
        } else {
          // Hold: small moves are right
          outcome = Math.abs(moved) < 5 ? "win" : "loss";
        }
      } else {
        // Not yet settled — track as open but compute current direction
        outcome = "open";
      }
    }

    let hitTarget = false;
    if (row.targetPrice != null && priceNow != null) {
      if (row.recommendation === "Buy") hitTarget = priceNow >= row.targetPrice;
      else if (row.recommendation === "Sell") hitTarget = priceNow <= row.targetPrice;
    }

    return {
      id: row.id,
      symbol: row.symbol,
      companyName: row.companyName,
      recommendation: row.recommendation,
      riskLevel: row.riskLevel,
      confidence: row.confidence,
      targetPrice: row.targetPrice,
      priceAtCall,
      priceNow,
      changeSince,
      changeSincePercent,
      outcome,
      hitTarget,
      daysSince,
      analyzedAt: new Date(row.analyzedAt).toISOString(),
      analysisText: row.analysisText,
    };
  });

  const settledCalls = calls.filter((c) => c.outcome !== "open");
  const wins = settledCalls.filter((c) => c.outcome === "win").length;
  const losses = settledCalls.filter((c) => c.outcome === "loss").length;
  const hitRate = settledCalls.length > 0 ? (wins / settledCalls.length) * 100 : 0;

  // Avg return considers all calls with a measurable change.
  const measurable = calls.filter((c) => c.changeSincePercent != null);
  const directionalReturns = measurable.map((c) => {
    const v = c.changeSincePercent ?? 0;
    return c.recommendation === "Sell" ? -v : v;
  });
  const avgReturnPct =
    directionalReturns.length > 0
      ? directionalReturns.reduce((a, b) => a + b, 0) / directionalReturns.length
      : 0;

  const sortedByReturn = [...measurable].sort((a, b) => {
    const ar = (a.recommendation === "Sell" ? -1 : 1) * (a.changeSincePercent ?? 0);
    const br = (b.recommendation === "Sell" ? -1 : 1) * (b.changeSincePercent ?? 0);
    return br - ar;
  });

  const trackRecord: TrackRecord = {
    summary: {
      total: calls.length,
      settled: settledCalls.length,
      wins,
      losses,
      hitRate,
      avgReturnPct,
      bestCall: sortedByReturn[0] ?? null,
      worstCall: sortedByReturn[sortedByReturn.length - 1] ?? null,
    },
    calls,
  };

  res.json(trackRecord);
});
