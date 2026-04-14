import Anthropic from "@anthropic-ai/sdk";
import type { StockQuote, AnalysisRecommendation, PortfolioAnalysis } from "../../shared/schema.js";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in environment");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

type PortfolioInput = { symbol: string; shares: number; quote: StockQuote | null };

function stripCite(text: string): string {
  return text.replace(/<cite[^>]*>|<\/cite>/g, "");
}

function buildPrompt(items: PortfolioInput[]): string {
  const lines = items.map((p) => {
    const q = p.quote;
    return `- ${p.symbol} (${q?.name ?? p.symbol}): ${p.shares} shares at $${q?.price?.toFixed(2) ?? "?"} (${q?.changePercent?.toFixed(2) ?? "?"}% today)`;
  });

  return `You are a professional swing trade analyst. Analyze this portfolio for short-term swing trade opportunities (holding period: 2-30 days).

Portfolio:
${lines.join("\n")}

For EACH stock, search the web for breaking news, earnings announcements, technical signals, and analyst opinions from the last 7 days. Use that information to form your recommendation.

Return ONLY a valid JSON object (no markdown fences, no prose before/after) in this exact shape:

{
  "summary": "2-3 sentence overall portfolio assessment",
  "recommendations": [
    {
      "symbol": "TICKER",
      "recommendation": "Buy" | "Hold" | "Sell",
      "confidence": "Low" | "Medium" | "High",
      "reasoning": "2-3 sentence reasoning grounded in current conditions",
      "keyFactors": ["factor 1", "factor 2", "factor 3"],
      "riskLevel": "Low" | "Medium" | "High",
      "targetPrice": 123.45
    }
  ]
}

CRITICAL FORMATTING RULES:
- Do not use any XML tags like <cite> in your response. Write in plain prose only.
- targetPrice must be a number (estimated price in 2-4 weeks), or null if you cannot estimate.
- Output ONLY the JSON object. No surrounding text, no markdown code fences.`;
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

export async function analyzePortfolio(
  items: PortfolioInput[]
): Promise<PortfolioAnalysis> {
  const prompt = buildPrompt(items);

  const response = await getClient().beta.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    betas: ["web-search-2025-03-05"],
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
    messages: [{ role: "user", content: prompt }],
  });

  let text = "";
  for (const block of response.content) {
    if ((block as any).type === "text") text += (block as any).text;
  }

  let parsed: any;
  try {
    parsed = extractJson(text);
  } catch {
    parsed = {
      summary: "Analysis could not be parsed from the model response.",
      recommendations: [],
    };
  }

  const bySymbol = new Map(items.map((i) => [i.symbol.toUpperCase(), i]));
  const totalValue = items.reduce(
    (sum, i) => sum + (i.quote?.price ?? 0) * i.shares,
    0
  );

  const recommendations: AnalysisRecommendation[] = (parsed.recommendations || []).map(
    (r: any): AnalysisRecommendation => {
      const sym = String(r.symbol || "").toUpperCase();
      const item = bySymbol.get(sym);
      const quote = item?.quote;
      return {
        symbol: sym,
        name: quote?.name ?? sym,
        recommendation: normalizeRec(r.recommendation),
        confidence: normalizeLevel(r.confidence),
        reasoning: stripCite(String(r.reasoning || "")),
        keyFactors: Array.isArray(r.keyFactors)
          ? r.keyFactors.map((f: any) => stripCite(String(f)))
          : [],
        riskLevel: normalizeLevel(r.riskLevel),
        targetPrice: typeof r.targetPrice === "number" ? r.targetPrice : null,
        currentPrice: quote?.price ?? 0,
        change: quote?.change ?? 0,
        changePercent: quote?.changePercent ?? 0,
      };
    }
  );

  return {
    summary: stripCite(String(parsed.summary || "")),
    totalValue,
    recommendations,
  };
}

function normalizeRec(v: any): "Buy" | "Hold" | "Sell" {
  const s = String(v || "").toLowerCase();
  if (s.startsWith("buy")) return "Buy";
  if (s.startsWith("sell")) return "Sell";
  return "Hold";
}

function normalizeLevel(v: any): "Low" | "Medium" | "High" {
  const s = String(v || "").toLowerCase();
  if (s.startsWith("low")) return "Low";
  if (s.startsWith("high")) return "High";
  return "Medium";
}
