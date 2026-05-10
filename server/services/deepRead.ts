import Anthropic from "@anthropic-ai/sdk";
import type {
  Candle,
  DeepReadAnalysis,
  DeepReadDirection,
  DeepReadNews,
  StockQuote,
} from "../../shared/schema.js";
import { getCompanyNews } from "./news.js";
import { getQuote } from "./yahoo.js";
import { getCandles, type Timeframe } from "./candles.js";
import { getTrackRecordPromptContext } from "./trackRecord.js";
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

function normDirection(v: any): DeepReadDirection {
  const s = String(v || "").toLowerCase();
  if (s === "up" || s.startsWith("buy") || s.startsWith("bull")) return "up";
  if (s === "down" || s.startsWith("sell") || s.startsWith("bear")) return "down";
  return "flat";
}

function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function summarizeRecentCandles(candles: Candle[]): string {
  if (candles.length === 0) return "(no historical data)";
  const recent = candles.slice(-30);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const move = ((last.close - first.close) / first.close) * 100;
  const high = Math.max(...recent.map((c) => c.high));
  const low = Math.min(...recent.map((c) => c.low));
  return `Last ~30 sessions: ${first.time} close $${first.close.toFixed(
    2
  )} → ${last.time} close $${last.close.toFixed(2)} (${move >= 0 ? "+" : ""}${move.toFixed(
    1
  )}%). 30-day range: $${low.toFixed(2)} – $${high.toFixed(2)}.`;
}

export async function generateDeepRead(symbol: string): Promise<DeepReadAnalysis> {
  const sym = symbol.toUpperCase();

  // Gather context in parallel.
  const [quote, news, candles] = await Promise.all([
    getQuote(sym),
    getCompanyNews(sym, 8).catch(() => []),
    getCandles(sym, "6M" as Timeframe).catch(() => [] as Candle[]),
  ]);

  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
    throw new Error(`Could not fetch a valid quote for ${sym}`);
  }

  const trackContext = await getTrackRecordPromptContext("deep_read");

  const headlines = news.map(
    (n) =>
      `- ${new Date(n.datetime * 1000).toISOString().slice(0, 10)} · ${n.source}: ${n.headline}`
  );

  const priceContext = quoteToContextLines(quote);
  const candleContext = summarizeRecentCandles(candles);

  const prompt = `${trackContext}You are Market Sage delivering a single-stock "Deep Read" — a careful, considered prediction about where this stock is likely headed over roughly 30 days.

Stock: ${sym} (${quote.name})

Live snapshot:
${priceContext}

Recent price action:
${candleContext}

Recent headlines (you may also use the web_search tool for breaking news, earnings, analyst notes, or macro context):
${headlines.length > 0 ? headlines.join("\n") : "(no headlines available — please search the web for recent news)"}

Use web_search if anything material is missing. Then return ONLY a valid JSON object (no preamble, no markdown fences, no XML/cite tags) with this exact shape:

{
  "direction": "up" | "down" | "flat",
  "targetPrice": 123.45,
  "confidence": 0-100,
  "timeframeDays": 30,
  "reasoning": "2-3 paragraphs of plain prose. No bullet points inside reasoning. Calm, observant, slightly literary. Cite specific levels and catalysts when relevant. No buy/sell instructions to the reader.",
  "keyFactors": ["3-5 short factors driving your view"],
  "risks": ["3-5 short things that could break this thesis"]
}

Constraints:
- targetPrice must be a number near a plausible 30-day level — do not return null.
- confidence is an integer 0-100. Calibrate honestly: be lower when the signal is mixed.
- direction: "up" if you expect the stock to rise meaningfully (>2%), "down" if you expect it to fall meaningfully (<-2%), otherwise "flat".
- Output ONLY the JSON object.`;

  const response = await getClient().beta.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    betas: ["web-search-2025-03-05"],
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
    messages: [{ role: "user", content: prompt }],
  });

  void recordSpend(costFromUsage((response as any).usage)).catch(() => {});

  let text = "";
  for (const block of response.content) {
    if ((block as any).type === "text") text += (block as any).text;
  }

  let parsed: any;
  try {
    parsed = extractJson(text);
  } catch {
    throw new Error("Could not parse model response");
  }

  const direction = normDirection(parsed.direction);
  const targetPrice =
    typeof parsed.targetPrice === "number" && Number.isFinite(parsed.targetPrice)
      ? parsed.targetPrice
      : quote.price;
  const confidence = clampInt(parsed.confidence, 0, 100, 50);
  const timeframeDays = clampInt(parsed.timeframeDays, 7, 90, 30);
  const reasoning = stripCite(String(parsed.reasoning ?? "")).trim();
  const keyFactors = Array.isArray(parsed.keyFactors)
    ? parsed.keyFactors.map((k: any) => stripCite(String(k))).slice(0, 8)
    : [];
  const risks = Array.isArray(parsed.risks)
    ? parsed.risks.map((r: any) => stripCite(String(r))).slice(0, 8)
    : [];

  const recentNews: DeepReadNews[] = news.slice(0, 3).map((n) => ({
    headline: n.headline,
    source: n.source,
    url: n.url,
    publishedAt: n.datetime,
  }));

  return {
    symbol: sym,
    name: quote.name,
    currentPrice: quote.price,
    direction,
    targetPrice,
    confidence,
    timeframeDays,
    reasoning,
    keyFactors,
    risks,
    recentNews,
  };
}

function quoteToContextLines(q: StockQuote): string {
  const fmt = (v?: number) => (v == null ? "?" : `$${v.toFixed(2)}`);
  return [
    `- Last: ${fmt(q.price)} (${q.changePercent >= 0 ? "+" : ""}${q.changePercent.toFixed(2)}% today)`,
    q.open != null && q.high != null && q.low != null
      ? `- Today: open ${fmt(q.open)}, high ${fmt(q.high)}, low ${fmt(q.low)}`
      : undefined,
    q.prevClose != null ? `- Previous close: ${fmt(q.prevClose)}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export function deepReadDirectionToRecommendation(d: DeepReadDirection): "Buy" | "Sell" | "Hold" {
  if (d === "up") return "Buy";
  if (d === "down") return "Sell";
  return "Hold";
}
