import Anthropic from "@anthropic-ai/sdk";
import { desc, isNotNull } from "drizzle-orm";
import { db } from "../db.js";
import { predictionOutcomes, systemInsights } from "../../shared/schema.js";
import { costFromUsage, recordSpend } from "./anthropicBudget.js";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_RESOLVED_FOR_INSIGHTS = 8;

function stripCite(text: string): string {
  return text.replace(/<cite[^>]*>|<\/cite>/g, "");
}

export async function getLatestInsight() {
  const rows = await db
    .select()
    .from(systemInsights)
    .orderBy(desc(systemInsights.generatedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Run a Claude pattern-analysis pass over the last ~100 resolved predictions
 * and store the resulting bullet list in system_insights. Cheap to call:
 * this is gated to once per week.
 */
export async function regenerateSystemInsights(force = false): Promise<{
  generated: boolean;
  reason?: string;
}> {
  const latest = await getLatestInsight();
  if (!force && latest) {
    const ageMs = Date.now() - new Date(latest.generatedAt).getTime();
    if (ageMs < WEEK_MS) {
      return { generated: false, reason: "too recent" };
    }
  }

  const resolved = await db
    .select()
    .from(predictionOutcomes)
    .where(isNotNull(predictionOutcomes.outcomeCorrect))
    .orderBy(desc(predictionOutcomes.predictedAt))
    .limit(100);

  if (resolved.length < MIN_RESOLVED_FOR_INSIGHTS) {
    return { generated: false, reason: `not enough data (${resolved.length})` };
  }

  const lines = resolved.map((r) => {
    const price = r.priceAfter14Days ?? r.priceAfter7Days ?? r.priceAfter3Days;
    const move =
      price != null
        ? ((price - r.priceAtPrediction) / r.priceAtPrediction) * 100
        : null;
    const moveStr = move != null ? `${move >= 0 ? "+" : ""}${move.toFixed(1)}%` : "?";
    return `- ${r.symbol} · ${r.recommendation} at $${r.priceAtPrediction.toFixed(2)} → ${moveStr} · ${r.outcomeCorrect ? "CORRECT" : "INCORRECT"}`;
  });

  const prompt = `You are reviewing the historical track record of an AI stock advisor named Market Sage to identify recurring patterns in correct vs. incorrect predictions. Below is a list of resolved calls (recommendation, entry price, 14-day move, outcome).

${lines.join("\n")}

Identify 3-5 honest patterns that emerge from these calls. Look for things like:
- Recommendation types or sectors where Sage tends to be more / less accurate
- Common features of incorrect calls (over-confidence on momentum, missing earnings risk, etc.)
- Strengths to lean into

Return ONLY a plain bullet list, one pattern per line, each starting with "- ". No headings, no preamble, no JSON, no XML tags. Each bullet should be a single confident sentence (under 22 words). Do not invent specifics; only generalize from what's in the data.`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  void recordSpend(costFromUsage((response as any).usage)).catch(() => {});

  let text = "";
  for (const block of response.content) {
    if ((block as any).type === "text") text += (block as any).text;
  }
  const cleaned = stripCite(text).trim();
  if (!cleaned) return { generated: false, reason: "empty response" };

  await db.insert(systemInsights).values({ insightText: cleaned });
  return { generated: true };
}
