import { desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db.js";
import { analysisHistory, predictionOutcomes, systemInsights } from "../../shared/schema.js";
import type {
  AccuracyByType,
  AccuracyPoint,
  PredictionOutcome,
  PredictionStatus,
  SystemTrackRecord,
  TrackRecordEntry,
  UserTrackRecord,
} from "../../shared/schema.js";
import { getQuote } from "./yahoo.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SavedPrediction = {
  userId: number;
  symbol: string;
  recommendation: string;
  targetPrice: number | null;
  priceAtPrediction: number;
};

export async function savePredictions(predictions: SavedPrediction[]): Promise<void> {
  if (predictions.length === 0) return;
  await db.insert(predictionOutcomes).values(
    predictions.map((p) => ({
      userId: p.userId,
      symbol: p.symbol,
      recommendation: p.recommendation,
      targetPrice: p.targetPrice,
      priceAtPrediction: p.priceAtPrediction,
    }))
  );
}

/**
 * One-time backfill — copy any analysis_history row that doesn't yet have a
 * matching prediction_outcomes row. Match key: (userId, symbol, analyzedAt).
 */
export async function backfillFromAnalysisHistory(): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO prediction_outcomes (
      user_id, symbol, predicted_at, recommendation, target_price, price_at_prediction
    )
    SELECT
      ah.user_id, ah.symbol, ah.analyzed_at, ah.recommendation, ah.target_price, ah.current_price
    FROM analysis_history ah
    WHERE ah.current_price IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM prediction_outcomes po
        WHERE po.user_id = ah.user_id
          AND po.symbol = ah.symbol
          AND po.predicted_at = ah.analyzed_at
      )
  `);
  return (result as any).rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Outcome checking
// ---------------------------------------------------------------------------

function judgeMove(rec: string, movePct: number): boolean {
  if (rec === "Buy") return movePct >= 2;
  if (rec === "Sell") return movePct <= -2;
  // Hold — within ±2%
  return Math.abs(movePct) <= 2;
}

function buildOutcomeNote(rec: string, priceAt: number, priceAfter: number): string {
  const movePct = ((priceAfter - priceAt) / priceAt) * 100;
  const dir = movePct >= 0 ? "rose" : "fell";
  const correct = judgeMove(rec, movePct);
  return `Predicted ${rec} at $${priceAt.toFixed(2)}, price ${dir} to $${priceAfter.toFixed(
    2
  )} (${movePct >= 0 ? "+" : ""}${movePct.toFixed(1)}%) — ${correct ? "CORRECT" : "INCORRECT"}`;
}

export type OutcomeCheckResult = {
  scanned: number;
  updated: number;
  resolved: number;
};

/**
 * Walk pending predictions, fill in price_after_X_days as they age past 3/7/14
 * days, and finalize outcome_correct + outcome_notes once we have a 14-day mark.
 */
export async function checkPendingOutcomes(): Promise<OutcomeCheckResult> {
  const pending = await db
    .select()
    .from(predictionOutcomes)
    .where(isNull(predictionOutcomes.outcomeCorrect));

  let updated = 0;
  let resolved = 0;

  // Cache quotes per symbol within this run so we don't refetch.
  const quoteCache = new Map<string, number | null>();

  for (const row of pending) {
    const ageDays = Math.floor(
      (Date.now() - new Date(row.predictedAt).getTime()) / DAY_MS
    );

    const need3 = ageDays >= 3 && row.priceAfter3Days == null;
    const need7 = ageDays >= 7 && row.priceAfter7Days == null;
    const need14 = ageDays >= 14 && row.priceAfter14Days == null;

    if (!need3 && !need7 && !need14) continue;

    let priceNow = quoteCache.get(row.symbol);
    if (priceNow === undefined) {
      const q = await getQuote(row.symbol);
      priceNow = q?.price ?? null;
      quoteCache.set(row.symbol, priceNow);
    }
    if (priceNow == null) continue;

    const updates: Partial<PredictionOutcome> = {
      checkedAt: new Date(),
    };
    if (need3) updates.priceAfter3Days = priceNow;
    if (need7) updates.priceAfter7Days = priceNow;
    if (need14) {
      updates.priceAfter14Days = priceNow;
      const movePct = ((priceNow - row.priceAtPrediction) / row.priceAtPrediction) * 100;
      updates.outcomeCorrect = judgeMove(row.recommendation, movePct);
      updates.outcomeNotes = buildOutcomeNote(row.recommendation, row.priceAtPrediction, priceNow);
      resolved++;
    }

    await db
      .update(predictionOutcomes)
      .set(updates as any)
      .where(eq(predictionOutcomes.id, row.id));

    updated++;
  }

  return { scanned: pending.length, updated, resolved };
}

// ---------------------------------------------------------------------------
// Read APIs
// ---------------------------------------------------------------------------

function statusOf(row: PredictionOutcome): PredictionStatus {
  if (row.outcomeCorrect === true) return "correct";
  if (row.outcomeCorrect === false) return "incorrect";
  return "pending";
}

function toEntry(row: PredictionOutcome): TrackRecordEntry {
  return {
    id: row.id,
    symbol: row.symbol,
    predictedAt: new Date(row.predictedAt).toISOString(),
    recommendation: row.recommendation,
    targetPrice: row.targetPrice,
    priceAtPrediction: row.priceAtPrediction,
    priceAfter3Days: row.priceAfter3Days,
    priceAfter7Days: row.priceAfter7Days,
    priceAfter14Days: row.priceAfter14Days,
    outcomeCorrect: row.outcomeCorrect,
    outcomeNotes: row.outcomeNotes,
    status: statusOf(row),
    daysSince: Math.floor((Date.now() - new Date(row.predictedAt).getTime()) / DAY_MS),
  };
}

function returnPctFor(row: PredictionOutcome): number | null {
  if (row.priceAfter14Days == null) return null;
  return ((row.priceAfter14Days - row.priceAtPrediction) / row.priceAtPrediction) * 100;
}

function rollingAccuracy(rows: PredictionOutcome[]): AccuracyPoint[] {
  // Sort by predicted_at asc, take only resolved.
  const resolved = rows
    .filter((r) => r.outcomeCorrect != null)
    .sort((a, b) => new Date(a.predictedAt).getTime() - new Date(b.predictedAt).getTime());

  if (resolved.length === 0) return [];

  // Group by day, then walk producing rolling 30-day accuracy.
  const byDay = new Map<string, PredictionOutcome[]>();
  for (const r of resolved) {
    const d = new Date(r.predictedAt).toISOString().slice(0, 10);
    const arr = byDay.get(d) ?? [];
    arr.push(r);
    byDay.set(d, arr);
  }

  const days = [...byDay.keys()].sort();
  const points: AccuracyPoint[] = [];
  const windowDays = 30;

  for (const day of days) {
    const cutoff = new Date(day).getTime();
    const windowStart = cutoff - windowDays * DAY_MS;
    const sample = resolved.filter((r) => {
      const t = new Date(r.predictedAt).getTime();
      return t > windowStart && t <= cutoff + DAY_MS - 1;
    });
    if (sample.length === 0) continue;
    const correct = sample.filter((r) => r.outcomeCorrect).length;
    points.push({
      date: day,
      accuracy: (correct / sample.length) * 100,
      sample: sample.length,
    });
  }
  return points;
}

export async function getUserTrackRecord(userId: number): Promise<UserTrackRecord> {
  const rows = await db
    .select()
    .from(predictionOutcomes)
    .where(eq(predictionOutcomes.userId, userId))
    .orderBy(desc(predictionOutcomes.predictedAt));

  const entries = rows.map(toEntry);
  const resolved = rows.filter((r) => r.outcomeCorrect != null);
  const correct = resolved.filter((r) => r.outcomeCorrect).length;
  const incorrect = resolved.length - correct;
  const accuracyPct = resolved.length > 0 ? (correct / resolved.length) * 100 : 0;

  // Buy avg return (using 14-day price)
  const buyResolved = resolved.filter((r) => r.recommendation === "Buy" && r.priceAfter14Days != null);
  const buyAvgReturnPct =
    buyResolved.length > 0
      ? buyResolved.reduce((sum, r) => sum + (returnPctFor(r) ?? 0), 0) / buyResolved.length
      : 0;

  const byType: AccuracyByType[] = ["Buy", "Hold", "Sell"].map((rec) => {
    const filtered = resolved.filter((r) => r.recommendation === rec);
    const c = filtered.filter((r) => r.outcomeCorrect).length;
    return {
      recommendation: rec,
      total: filtered.length,
      correct: c,
      accuracy: filtered.length > 0 ? (c / filtered.length) * 100 : 0,
    };
  });

  // Best/worst by directional return.
  const measurable = resolved
    .map((r) => ({ row: r, ret: returnPctFor(r) ?? 0 }))
    .filter(({ row }) => row.priceAfter14Days != null)
    .map(({ row, ret }) => ({
      row,
      directional: row.recommendation === "Sell" ? -ret : ret,
    }));
  measurable.sort((a, b) => b.directional - a.directional);
  const bestCall = measurable[0] ? toEntry(measurable[0].row) : null;
  const worstCall = measurable[measurable.length - 1]
    ? toEntry(measurable[measurable.length - 1].row)
    : null;

  return {
    total: rows.length,
    resolved: resolved.length,
    pending: rows.length - resolved.length,
    correct,
    incorrect,
    accuracyPct,
    buyAvgReturnPct,
    byType,
    bestCall,
    worstCall: bestCall && worstCall && bestCall.id === worstCall.id ? null : worstCall,
    rolling30: rollingAccuracy(rows),
    entries,
  };
}

/**
 * Render the system track record into a system-prompt-friendly preface for
 * the next analysis. Empty string if there's nothing useful yet.
 */
export async function getTrackRecordPromptContext(): Promise<string> {
  const sys = await getSystemTrackRecord(50);
  if (sys.resolved < 3) return "";

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const correctLines = sys.recentCorrect.map((c) => `- ${fmtDate(c.predictedAt)} ${c.symbol}: ${c.outcomeNotes ?? ""}`);
  const incorrectLines = sys.recentIncorrect.map(
    (c) => `- ${fmtDate(c.predictedAt)} ${c.symbol}: ${c.outcomeNotes ?? ""}`
  );

  const patternsBlock = sys.patterns
    ? `\nPATTERNS TO NOTE:\n${sys.patterns}\n`
    : "";

  return `Here is your historical track record from previous analyses. Learn from your mistakes and successes:

OVERALL STATS: ${sys.resolved} predictions made, ${sys.accuracyPct.toFixed(0)}% accuracy, average return on Buy calls: ${sys.buyAvgReturnPct >= 0 ? "+" : ""}${sys.buyAvgReturnPct.toFixed(1)}%

RECENT CORRECT CALLS:
${correctLines.length > 0 ? correctLines.join("\n") : "- (none yet)"}

RECENT INCORRECT CALLS:
${incorrectLines.length > 0 ? incorrectLines.join("\n") : "- (none yet)"}
${patternsBlock}
Use this track record to calibrate your confidence levels and be more careful about past mistakes.

---

`;
}

export async function getSystemTrackRecord(limit = 50): Promise<SystemTrackRecord> {
  const resolved = await db
    .select()
    .from(predictionOutcomes)
    .where(isNotNull(predictionOutcomes.outcomeCorrect))
    .orderBy(desc(predictionOutcomes.predictedAt))
    .limit(limit);

  const allCount = await db
    .select({ c: sql<number>`count(*)` })
    .from(predictionOutcomes);
  const total = Number(allCount[0]?.c ?? 0);

  const correct = resolved.filter((r) => r.outcomeCorrect).length;
  const accuracyPct = resolved.length > 0 ? (correct / resolved.length) * 100 : 0;

  const buyResolved = resolved.filter((r) => r.recommendation === "Buy" && r.priceAfter14Days != null);
  const buyAvgReturnPct =
    buyResolved.length > 0
      ? buyResolved.reduce((sum, r) => sum + (returnPctFor(r) ?? 0), 0) / buyResolved.length
      : 0;

  const recentCorrect = resolved
    .filter((r) => r.outcomeCorrect)
    .slice(0, 5)
    .map(toEntry);
  const recentIncorrect = resolved
    .filter((r) => !r.outcomeCorrect)
    .slice(0, 5)
    .map(toEntry);

  // Newest patterns row, if any.
  const rows = await db
    .select()
    .from(systemInsights)
    .orderBy(desc(systemInsights.generatedAt))
    .limit(1);
  const insight = rows[0];

  return {
    total,
    resolved: resolved.length,
    accuracyPct,
    buyAvgReturnPct,
    recentCorrect,
    recentIncorrect,
    patterns: insight?.insightText ?? null,
    patternsGeneratedAt: insight ? new Date(insight.generatedAt).toISOString() : null,
  };
}
