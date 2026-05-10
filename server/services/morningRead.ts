import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { morningReads } from "../../shared/schema.js";
import { getIndices, getMovers } from "./yahoo.js";
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

export type MorningRead = {
  date: string;            // YYYY-MM-DD in ET
  generatedAt: number;     // unix ms
  headline: string;        // 1-line poetic framing
  body: string;            // 2-3 paragraphs of prose
  watchlist: string[];     // 3 short bullets of what to watch today
};

let cached: MorningRead | null = null;
// In-flight lock: if generation is already running, concurrent callers
// await the same Promise instead of starting their own Claude call.
let inFlight: Promise<MorningRead> | null = null;

function todayKeyET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
}

function stripCite(text: string): string {
  return text.replace(/<cite[^>]*>|<\/cite>/g, "");
}

function extractJson(text: string): any {
  const cleaned = stripCite(text).trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : cleaned;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in response");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function generate(): Promise<MorningRead> {
  const [indices, movers] = await Promise.all([getIndices(), getMovers()]);

  const indexLines = indices
    .map((i) => `- ${i.name}: ${i.price.toFixed(2)} (${i.changePercent.toFixed(2)}%)`)
    .join("\n");
  const gainerLines = movers.gainers
    .slice(0, 5)
    .map((g) => `- ${g.symbol} ${g.name}: +${g.changePercent.toFixed(2)}%`)
    .join("\n");
  const loserLines = movers.losers
    .slice(0, 5)
    .map((l) => `- ${l.symbol} ${l.name}: ${l.changePercent.toFixed(2)}%`)
    .join("\n");

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  const prompt = `You are Market Sage — a calm, observant, slightly literary market columnist who writes a brief daily read. Today is ${date} (US Eastern time).

Live snapshot just before/after the open:

US indices (ETF proxies — SPY/QQQ/DIA):
${indexLines}

Today's biggest gainers (from a popular 50-stock universe):
${gainerLines}

Today's biggest decliners:
${loserLines}

Use the web_search tool to scan for breaking news, earnings, Fed/macro signals, and notable corporate stories from the last 24 hours that the data above hints at.

Then return ONLY a valid JSON object (no prose before/after, no markdown fences, no XML tags) with this exact shape:

{
  "headline": "A short, evocative one-line framing of today's market mood (max 12 words). Avoid clichés. No exclamation marks.",
  "body": "Two short paragraphs (3-4 sentences each, separated by a single blank line) reading the tape: what happened overnight/this morning, why it matters, and what the cross-currents are. Plain English. Confident but not pushy. No buy/sell recommendations.",
  "watchlist": [
    "First thing to watch today — short, specific, includes a ticker or event when relevant",
    "Second thing to watch — different angle from the first",
    "Third thing to watch — different angle still"
  ]
}

Constraints:
- Do not use any XML tags like <cite> in your response.
- The body must be plain prose. No bullet lists inside body.
- Total length under 220 words.
- Output ONLY the JSON object.`;

  const response = await getClient().beta.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    betas: ["web-search-2025-03-05"],
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
    messages: [{ role: "user", content: prompt }],
  });

  void recordSpend(costFromUsage((response as any).usage)).catch(() => {});

  let text = "";
  for (const block of response.content) {
    if ((block as any).type === "text") text += (block as any).text;
  }

  const parsed = extractJson(text);
  return {
    date: todayKeyET(),
    generatedAt: Date.now(),
    headline: stripCite(String(parsed.headline ?? "Today's read")),
    body: stripCite(String(parsed.body ?? "")),
    watchlist: Array.isArray(parsed.watchlist)
      ? parsed.watchlist.map((w: any) => stripCite(String(w))).slice(0, 3)
      : [],
  };
}

async function loadFromDb(date: string): Promise<MorningRead | null> {
  try {
    const rows = await db
      .select()
      .from(morningReads)
      .where(eq(morningReads.date, date))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      date: row.date,
      generatedAt: new Date(row.generatedAt).getTime(),
      headline: row.headline,
      body: row.body,
      watchlist: row.watchlist ?? [],
    };
  } catch (err) {
    console.warn("[morningRead] DB lookup failed:", (err as Error).message);
    return null;
  }
}

async function saveToDb(read: MorningRead): Promise<void> {
  try {
    // ON CONFLICT DO NOTHING — if two processes both finished generation
    // simultaneously, the first write wins and the second silently no-ops.
    await db
      .insert(morningReads)
      .values({
        date: read.date,
        headline: read.headline,
        body: read.body,
        watchlist: read.watchlist,
      })
      .onConflictDoNothing({ target: morningReads.date });
  } catch (err) {
    console.warn("[morningRead] DB write failed:", (err as Error).message);
  }
}

export async function getMorningRead(): Promise<MorningRead> {
  const today = todayKeyET();

  // 1. In-memory hit — fast path.
  if (cached && cached.date === today) return cached;

  // 2. Generation already in flight — piggyback on the existing call.
  if (inFlight) return inFlight;

  // 3. DB hit — survives process restarts. No Claude call.
  const fromDb = await loadFromDb(today);
  if (fromDb) {
    cached = fromDb;
    return fromDb;
  }

  // 4. Cold path — generate, cache in memory, persist to DB.
  inFlight = (async () => {
    try {
      // Re-check the DB once more under the lock in case another worker
      // wrote a row while we were waiting.
      const lateDb = await loadFromDb(today);
      if (lateDb) {
        cached = lateDb;
        return lateDb;
      }
      const fresh = await generate();
      cached = fresh;
      await saveToDb(fresh);
      return fresh;
    } catch (err) {
      console.error("[morningRead]", (err as Error).message);
      // Fall back to whatever cache we have if generation fails.
      if (cached) return cached;
      throw err;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
