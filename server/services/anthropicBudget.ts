import type { Request, Response, NextFunction } from "express";
import { getRedis } from "./rateLimit.js";
import { fireBudgetAlert, secondsUntilUtcMidnight } from "./abuse.js";

// Pricing for claude-sonnet-4-5 (USD per token unless noted).
// Input: $3/M, Output: $15/M, Web search: $0.01 per request.
// Cache pricing (prepared for future use):
//   - cache_creation_input_tokens: $3.75/M (input + 25%)
//   - cache_read_input_tokens:     $0.30/M (input - 90%)
const PRICE_INPUT_PER_TOKEN = 3 / 1_000_000;
const PRICE_OUTPUT_PER_TOKEN = 15 / 1_000_000;
const PRICE_CACHE_WRITE_PER_TOKEN = 3.75 / 1_000_000;
const PRICE_CACHE_READ_PER_TOKEN = 0.3 / 1_000_000;
const PRICE_WEB_SEARCH_PER_REQUEST = 0.01;

const COUNTER_KEY_PREFIX = "anthropic:spend:";

function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function dailyBudgetUsd(): number {
  const raw = process.env.ANTHROPIC_DAILY_BUDGET_USD;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/** Compute the USD cost of an Anthropic Messages response from its `usage`. */
export function costFromUsage(usage: any): number {
  if (!usage) return 0;
  const input = Number(usage.input_tokens ?? 0);
  const output = Number(usage.output_tokens ?? 0);
  const cacheWrite = Number(usage.cache_creation_input_tokens ?? 0);
  const cacheRead = Number(usage.cache_read_input_tokens ?? 0);
  const webSearches = Number(
    usage.server_tool_use?.web_search_requests ?? 0
  );
  return (
    input * PRICE_INPUT_PER_TOKEN +
    output * PRICE_OUTPUT_PER_TOKEN +
    cacheWrite * PRICE_CACHE_WRITE_PER_TOKEN +
    cacheRead * PRICE_CACHE_READ_PER_TOKEN +
    webSearches * PRICE_WEB_SEARCH_PER_REQUEST
  );
}

/** Read today's accumulated spend in USD. Returns 0 on errors / missing Redis. */
export async function todaysSpendUsd(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const v = await redis.get<string | number>(`${COUNTER_KEY_PREFIX}${utcDateKey()}`);
    if (v == null) return 0;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Add `usd` to today's counter. TTL is set to expire at next UTC midnight. */
export async function recordSpend(usd: number): Promise<void> {
  if (!Number.isFinite(usd) || usd <= 0) return;
  const redis = getRedis();
  if (!redis) return;
  const key = `${COUNTER_KEY_PREFIX}${utcDateKey()}`;
  try {
    // Use micro-USD as integer to keep redis math precise.
    const microUsd = Math.round(usd * 1_000_000);
    const total = (await redis.incrby(key, microUsd)) as number;
    if (total === microUsd) {
      // First write of the day — set TTL until UTC midnight.
      await redis.expire(key, secondsUntilUtcMidnight());
    }
    // If we crossed the threshold on this write, fire the alert (deduped per day).
    const totalUsd = total / 1_000_000;
    const budget = dailyBudgetUsd();
    if (totalUsd >= budget) {
      void fireBudgetAlert(totalUsd, budget).catch(() => {});
    }
  } catch (err) {
    console.error(`[anthropicBudget] redis incr failed: ${(err as Error).message}`);
  }
}

/**
 * Express middleware: guard AI endpoints. If today's spend already exceeds
 * the budget, return 503 with a distinctive message before any Claude call.
 */
export async function killSwitch(req: Request, res: Response, next: NextFunction) {
  const budget = dailyBudgetUsd();
  const spent = await todaysSpendUsd();
  if (spent >= budget) {
    console.warn(
      `[anthropicBudget] kill-switch endpoint=${req.path} spent=${spent.toFixed(4)} budget=${budget}`
    );
    void fireBudgetAlert(spent, budget).catch(() => {});
    return res
      .status(503)
      .json({ error: "daily AI budget reached", retryAfterUtcMidnight: true });
  }
  next();
}
