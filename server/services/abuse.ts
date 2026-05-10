import { getRedis } from "./rateLimit.js";

const ABUSE_HITS_THRESHOLD = 100; // 429s in a sliding hour
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;

/**
 * Bump the per-user 429 counter and, if it crosses the threshold, fire a
 * Discord webhook (deduped with SET NX so a single attacker can't spam us).
 */
export async function fireAbuseAlert(userKey: string, endpoint: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const counterKey = `abuse:hits:${userKey}`;
  let count: number;
  try {
    count = (await redis.incr(counterKey)) as number;
    if (count === 1) {
      // First hit in this window — set TTL.
      await redis.expire(counterKey, HOUR_SECONDS);
    }
  } catch (err) {
    console.error(`[abuse] redis error: ${(err as Error).message}`);
    return;
  }

  if (count < ABUSE_HITS_THRESHOLD) return;

  // Dedup: at most one webhook per (userKey, hour) bucket.
  const dedupKey = `abuse:alert:${userKey}`;
  let firstAlert = false;
  try {
    const ok = await redis.set(dedupKey, "1", { nx: true, ex: HOUR_SECONDS });
    firstAlert = ok === "OK";
  } catch {
    return;
  }

  if (!firstAlert) return;

  await sendDiscordAlert({
    title: "Rate-limit abuse threshold hit",
    description:
      `\`${userKey}\` has hit **${count}+ rate-limit blocks in the last hour**.\n` +
      `Latest endpoint: \`${endpoint}\``,
    color: 0xff3366,
  });
}

/**
 * Fired once per UTC day when the Anthropic budget is hit. Same SET NX dedup
 * pattern, scoped to the calendar date.
 */
export async function fireBudgetAlert(usdSpent: number, budget: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const today = utcDateKey();
  const dedupKey = `budget:alert:${today}`;
  try {
    const ok = await redis.set(dedupKey, "1", {
      nx: true,
      ex: secondsUntilUtcMidnight(),
    });
    if (ok !== "OK") return;
  } catch {
    return;
  }
  await sendDiscordAlert({
    title: "Anthropic daily budget reached",
    description: `Hit \`$${usdSpent.toFixed(4)}\` of \`$${budget.toFixed(2)}\` budget today (${today} UTC). All AI endpoints are now returning 503 until 00:00 UTC.`,
    color: 0xffaa00,
  });
}

// ---------------------------------------------------------------------------
// Discord webhook
// ---------------------------------------------------------------------------

type AlertPayload = { title: string; description: string; color: number };

async function sendDiscordAlert(payload: AlertPayload): Promise<void> {
  const url = process.env.ABUSE_WEBHOOK_URL;
  if (!url) {
    console.warn("[abuse] ABUSE_WEBHOOK_URL not set; skipping alert");
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: payload.title,
            description: payload.description,
            color: payload.color,
            timestamp: new Date().toISOString(),
            footer: { text: "Market Sage" },
          },
        ],
      }),
    });
  } catch (err) {
    console.error(`[abuse] webhook delivery failed: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0
    )
  );
  return Math.max(60, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
}

export { DAY_SECONDS };
