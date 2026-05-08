import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Loader2,
  Minus,
  Newspaper,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StockSearch } from "@/components/StockSearch";
import { DeepReadChart } from "@/components/DeepReadChart";
import { api } from "@/lib/api";
import { cn, colorForChange, formatCurrency, formatPercent, stripCite } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type {
  Candle,
  DeepReadAnalysis,
  DeepReadDirection,
  StockQuote,
  StockSearchResult,
} from "@shared/schema";

type Timeframe = "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y";
const TIMEFRAMES: Timeframe[] = ["1W", "1M", "3M", "6M", "1Y", "5Y"];
const DEFAULT_TF: Timeframe = "6M";

type CandlesResponse = { symbol: string; timeframe: Timeframe; candles: Candle[] };

export function DeepReadPage() {
  const { isAuthenticated } = useAuth();
  const [picked, setPicked] = useState<StockSearchResult | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>(DEFAULT_TF);
  const [analysis, setAnalysis] = useState<DeepReadAnalysis | null>(null);

  // Reset analysis whenever the user changes stock
  useEffect(() => {
    setAnalysis(null);
  }, [picked?.symbol]);

  const symbol = picked?.symbol;

  const quoteQuery = useQuery<StockQuote>({
    queryKey: ["deep-quote", symbol],
    queryFn: () => api<StockQuote>(`/api/stocks/${encodeURIComponent(symbol!)}/quote`),
    enabled: !!symbol,
    refetchInterval: 30_000,
  });

  const candlesQuery = useQuery<CandlesResponse>({
    queryKey: ["deep-candles", symbol, timeframe],
    queryFn: () =>
      api<CandlesResponse>(
        `/api/stocks/${encodeURIComponent(symbol!)}/candles?timeframe=${timeframe}`
      ),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const analysisMutation = useMutation({
    mutationFn: async () => {
      if (!symbol) throw new Error("Pick a stock first");
      return await api<DeepReadAnalysis>("/api/analysis/deep-read", {
        method: "POST",
        body: JSON.stringify({ symbol }),
      });
    },
    onSuccess: (data) => setAnalysis(data),
  });

  const handleAnalyze = () => {
    if (!isAuthenticated) {
      window.location.href = "/api/auth/google";
      return;
    }
    analysisMutation.mutate();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-1">
        <p className="font-display text-xs uppercase tracking-[0.18em] text-sage/80">
          Deep read
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          One stock. One careful read.
        </h1>
      </header>

      {!isAuthenticated && (
        <div className="surface rounded-lg p-4 text-sm">
          <a href="/api/auth/google" className="font-medium text-sage hover:underline">
            Sign in with Google
          </a>
          <span className="text-muted-foreground"> to save these reads to your track record.</span>
        </div>
      )}

      <section className="surface rounded-lg p-5">
        <div className="mb-4">
          <p className="font-display text-[11px] uppercase tracking-[0.16em] text-sage/80">
            Pick a stock
          </p>
          <p className="text-xs text-muted-foreground">
            Search any US-listed ticker — Apple, Tesla, Nvidia, anything.
          </p>
        </div>
        <StockSearch onSelect={(r) => setPicked(r)} placeholder="Search stocks…" />

        {picked && quoteQuery.data && (
          <SelectedStockHeader quote={quoteQuery.data} />
        )}
      </section>

      <section className="surface overflow-hidden rounded-lg">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-5 py-3">
          <p className="font-display text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Chart
          </p>
          <div className="ml-auto flex items-center gap-1 rounded-md border border-border/40 bg-card/40 p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                disabled={!symbol}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  timeframe === tf
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 pb-5 pt-3">
          <ChartArea
            symbol={symbol}
            candles={candlesQuery.data?.candles ?? []}
            isLoading={candlesQuery.isLoading}
            isError={candlesQuery.isError}
            errorMsg={
              candlesQuery.error instanceof Error ? candlesQuery.error.message : null
            }
            analysis={analysis}
          />
        </div>
      </section>

      <Button
        size="lg"
        className="w-full"
        disabled={!symbol || analysisMutation.isPending}
        onClick={handleAnalyze}
      >
        {analysisMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Consulting the tape…
          </>
        ) : !isAuthenticated ? (
          <>
            <Sparkles className="h-4 w-4" />
            Sign in to ask the Sage
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Ask the Sage for a read
          </>
        )}
      </Button>

      {analysisMutation.isPending && <LoadingPanel />}
      {analysisMutation.error && (
        <ErrorPanel error={(analysisMutation.error as Error).message} />
      )}
      {analysis && <DeepReadResult analysis={analysis} />}

      <p className="border-t border-border/30 pt-4 text-center text-[11px] text-muted-foreground">
        AI-generated analysis · Educational purposes only · Not financial advice
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SelectedStockHeader({ quote }: { quote: StockQuote }) {
  const up = quote.changePercent >= 0;
  return (
    <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-2 rounded-md border border-border/40 bg-background/30 px-4 py-3 animate-slide-in">
      <div>
        <div className="font-mono text-base font-bold tracking-tight">{quote.symbol}</div>
        <div className="text-xs text-muted-foreground">{quote.name}</div>
      </div>
      <div className="ml-auto flex items-baseline gap-3">
        <span className="font-mono text-lg font-semibold tabular-nums">
          {formatCurrency(quote.price)}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            up ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
          )}
        >
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {formatPercent(quote.changePercent)}
        </span>
        <span className={cn("font-mono text-xs", colorForChange(quote.change))}>
          {quote.change >= 0 ? "+" : ""}
          {quote.change.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function ChartArea({
  symbol,
  candles,
  isLoading,
  isError,
  errorMsg,
  analysis,
}: {
  symbol?: string;
  candles: Candle[];
  isLoading: boolean;
  isError: boolean;
  errorMsg: string | null;
  analysis: DeepReadAnalysis | null;
}) {
  if (!symbol) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-md border border-dashed border-border/50 bg-card/30 text-sm text-muted-foreground">
        Pick a stock above to load its chart
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-md border border-danger/30 bg-danger/5 px-6 text-center text-sm text-danger">
        <TriangleAlert className="mb-2 h-5 w-5" />
        <p className="font-display font-semibold">Historical data temporarily unavailable</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {errorMsg ??
            "Both Finnhub and Alpha Vantage failed to return candles. Try again in a minute, or set ALPHA_VANTAGE_API_KEY for the fallback."}
        </p>
      </div>
    );
  }
  if (isLoading || candles.length === 0) {
    return (
      <div className="h-[400px] animate-pulse rounded-md bg-muted/20" />
    );
  }
  return <DeepReadChart candles={candles} analysis={analysis} height={460} />;
}

// ---------------------------------------------------------------------------

function LoadingPanel() {
  return (
    <div className="surface flex flex-col items-center justify-center rounded-lg py-20 text-center animate-fade-in">
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 rounded-full border border-sage/20" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-sage" />
        <div className="absolute inset-3 animate-spin rounded-full border border-transparent border-t-gold/70 [animation-direction:reverse] [animation-duration:1.5s]" />
      </div>
      <h3 className="mt-6 font-display text-xl font-semibold">Consulting the tape…</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Reading recent price action, scanning the news, and drafting a written take.
      </p>
      <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-sage" />
      </div>
    </div>
  );
}

function ErrorPanel({ error }: { error: string }) {
  return (
    <div className="surface rounded-lg border-danger/30 bg-danger/5 p-6">
      <div className="flex items-start gap-3">
        <TriangleAlert className="h-5 w-5 text-danger" />
        <div>
          <p className="font-display font-semibold">The read failed</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DeepReadResult({ analysis }: { analysis: DeepReadAnalysis }) {
  return (
    <div className="space-y-4 animate-fade-in">
      <ResultGrid analysis={analysis} />
      <ReasoningSection analysis={analysis} />
    </div>
  );
}

function dirColors(d: DeepReadDirection) {
  if (d === "up")
    return {
      icon: ArrowUpRight,
      label: "Up",
      text: "text-success",
      bg: "bg-success/10",
      bar: "bg-success",
    };
  if (d === "down")
    return {
      icon: ArrowDownRight,
      label: "Down",
      text: "text-danger",
      bg: "bg-danger/10",
      bar: "bg-danger",
    };
  return {
    icon: Minus,
    label: "Flat",
    text: "text-gold",
    bg: "bg-gold/10",
    bar: "bg-gold",
  };
}

function confidenceLabel(c: number): string {
  if (c <= 40) return "Low";
  if (c <= 70) return "Medium";
  return "High";
}

function ResultGrid({ analysis }: { analysis: DeepReadAnalysis }) {
  const dir = dirColors(analysis.direction);
  const Icon = dir.icon;
  const impliedMove =
    ((analysis.targetPrice - analysis.currentPrice) / analysis.currentPrice) * 100;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Verdict */}
      <div className="surface rounded-lg p-5 animate-slide-in">
        <div className="flex items-start justify-between">
          <p className={cn("font-display text-[11px] uppercase tracking-[0.18em]", dir.text)}>
            Verdict
          </p>
          <span className={cn("rounded-full p-2", dir.bg)}>
            <Icon className={cn("h-5 w-5", dir.text)} />
          </span>
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">Target</p>
        <div className="mt-1 font-mono text-3xl font-semibold tabular-nums text-foreground">
          {formatCurrency(analysis.targetPrice)}
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Over {analysis.timeframeDays} days
        </p>
        <span
          className={cn(
            "mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            dir.bg,
            dir.text
          )}
        >
          {impliedMove >= 0 ? "+" : ""}
          {impliedMove.toFixed(2)}% implied move
        </span>
      </div>

      {/* Confidence */}
      <div className="surface rounded-lg p-5 animate-slide-in">
        <p className="font-display text-[11px] uppercase tracking-[0.18em] text-sage/80">
          Conviction
        </p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-4xl font-semibold tabular-nums">
            {analysis.confidence}
          </span>
          <span className="text-sm text-muted-foreground">/100</span>
        </div>
        <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          {confidenceLabel(analysis.confidence)}
        </p>
        <ConvictionBar value={analysis.confidence} barClass={dir.bar} />
      </div>

      {/* Risks */}
      <div className="surface rounded-lg p-5 animate-slide-in">
        <p className="font-display text-[11px] uppercase tracking-[0.18em] text-gold">
          What could break this
        </p>
        {analysis.risks.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No specific risks called out.</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm text-foreground/85">
            {analysis.risks.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span>{stripCite(r)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConvictionBar({ value, barClass }: { value: number; barClass: string }) {
  const id = useMemo(() => `conv-${Math.random().toString(36).slice(2)}`, []);
  return (
    <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-[hsl(35_18%_92%/0.08)]">
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <filter id={id} x="-20%" y="-100%" width="140%" height="300%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
      </svg>
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full opacity-60 blur-sm", barClass)}
        style={{ width: `${value}%` }}
      />
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full", barClass)}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function ReasoningSection({ analysis }: { analysis: DeepReadAnalysis }) {
  return (
    <section className="surface surface-glow grain rounded-lg overflow-hidden">
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-sage" />
          <p className="font-display text-[11px] uppercase tracking-[0.18em] text-sage">
            The read
          </p>
        </div>
        <div className="space-y-3 font-display text-base leading-relaxed text-foreground/95 sm:text-lg">
          {stripCite(analysis.reasoning)
            .split(/\n\n+/)
            .map((p, i) => (
              <p key={i}>{p}</p>
            ))}
        </div>

        {analysis.keyFactors.length > 0 && (
          <div className="border-t border-border/30 pt-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Key factors
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-foreground/85">
              {analysis.keyFactors.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sage" />
                  <span>{stripCite(f)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.recentNews.length > 0 && (
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Newspaper className="h-3 w-3" />
              Recent news
            </div>
            <ul className="mt-2 space-y-1">
              {analysis.recentNews.map((n, i) => (
                <li key={i}>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent/30"
                  >
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-sage/60" />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 leading-snug text-foreground/90 group-hover:text-foreground">
                        {n.headline}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{n.source}</span>
                        <span>·</span>
                        <span>{relativeTime(n.publishedAt)}</span>
                      </div>
                    </div>
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <Badge variant="success">Direction: {dirColors(analysis.direction).label}</Badge>
          <Badge variant="warning">Conviction: {confidenceLabel(analysis.confidence)}</Badge>
          <Badge variant="secondary">{analysis.timeframeDays}-day horizon</Badge>
        </div>
      </div>
    </section>
  );
}

function relativeTime(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`;
  return new Date(unixSec * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
