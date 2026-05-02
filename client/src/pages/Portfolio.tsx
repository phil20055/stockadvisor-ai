import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles, Trash2, TriangleAlert, Target, ShieldCheck, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StockSearch } from "@/components/StockSearch";
import { api } from "@/lib/api";
import { cn, colorForChange, formatCurrency, formatPercent, stripCite } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type {
  AnalysisRecommendation,
  PortfolioAnalysis,
  Portfolio,
  StockQuote,
  StockSearchResult,
} from "@shared/schema";

type Holding = { symbol: string; name: string; shares: number };

const LOCAL_KEY = "marketsage:guest-portfolio";

export function PortfolioPage() {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const [pendingPick, setPendingPick] = useState<StockSearchResult | null>(null);
  const [sharesInput, setSharesInput] = useState("");
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [guestHoldings, setGuestHoldings] = useState<Holding[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!isAuthenticated) localStorage.setItem(LOCAL_KEY, JSON.stringify(guestHoldings));
  }, [guestHoldings, isAuthenticated]);

  const portfolioQuery = useQuery<Portfolio[]>({
    queryKey: ["portfolio"],
    queryFn: () => api<Portfolio[]>("/api/portfolio"),
    enabled: isAuthenticated,
  });

  const holdings: Holding[] = isAuthenticated
    ? (portfolioQuery.data ?? []).map((p) => ({ symbol: p.symbol, name: p.symbol, shares: p.shares }))
    : guestHoldings;

  const symbols = holdings.map((h) => h.symbol);
  const quotesQuery = useQuery<StockQuote[]>({
    queryKey: ["portfolio-quotes", symbols.join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        symbols.map((s) => api<StockQuote>(`/api/stocks/${encodeURIComponent(s)}/quote`).catch(() => null))
      );
      return results.filter(Boolean) as StockQuote[];
    },
    enabled: symbols.length > 0,
    refetchInterval: 30_000,
  });

  const quoteBySymbol = useMemo(() => {
    const map = new Map<string, StockQuote>();
    (quotesQuery.data ?? []).forEach((q) => map.set(q.symbol.toUpperCase(), q));
    return map;
  }, [quotesQuery.data]);

  const addMutation = useMutation({
    mutationFn: async ({ symbol, shares }: { symbol: string; shares: number }) => {
      if (isAuthenticated) {
        return await api<Portfolio>("/api/portfolio", {
          method: "POST",
          body: JSON.stringify({ symbol, shares }),
        });
      }
      setGuestHoldings((prev) => {
        const without = prev.filter((h) => h.symbol !== symbol);
        return [...without, { symbol, name: pendingPick?.name ?? symbol, shares }];
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      setPendingPick(null);
      setSharesInput("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (symbol: string) => {
      if (isAuthenticated) {
        await api(`/api/portfolio/${encodeURIComponent(symbol)}`, { method: "DELETE" });
      } else {
        setGuestHoldings((prev) => prev.filter((h) => h.symbol !== symbol));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });

  const analysisMutation = useMutation({
    mutationFn: async () => {
      const body = { portfolio: holdings.map((h) => ({ symbol: h.symbol, shares: h.shares })) };
      return await api<PortfolioAnalysis>("/api/analysis/portfolio", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (data) => {
      setAnalysis(data);
      qc.invalidateQueries({ queryKey: ["analysis-history"] });
    },
  });

  const handleAdd = () => {
    if (!pendingPick) return;
    const shares = Number(sharesInput);
    if (!Number.isFinite(shares) || shares <= 0) return;
    addMutation.mutate({ symbol: pendingPick.symbol, shares });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-1">
        <p className="font-display text-xs uppercase tracking-[0.18em] text-sage/80">
          Portfolio
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Your positions, weighed and read.
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          {!isAuthenticated && (
            <div className="surface rounded-lg p-4 text-sm">
              <a href="/api/auth/google" className="font-medium text-sage hover:underline">
                Sign in with Google
              </a>
              <span className="text-muted-foreground"> to save positions across sessions.</span>
            </div>
          )}

          <div className="surface relative z-30 rounded-lg p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-display text-[11px] uppercase tracking-[0.16em] text-sage/80">
                  Add to portfolio
                </p>
                <p className="text-xs text-muted-foreground">Search any US-listed ticker</p>
              </div>
            </div>
            <StockSearch onSelect={(r) => setPendingPick(r)} />
            {pendingPick && (
              <div className="mt-4 rounded-md border border-sage/30 bg-sage/5 p-4 animate-slide-in">
                <div className="mb-3">
                  <div className="font-mono text-sm font-semibold">{pendingPick.symbol}</div>
                  <div className="text-xs text-muted-foreground">{pendingPick.name}</div>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Shares"
                    value={sharesInput}
                    onChange={(e) => setSharesInput(e.target.value)}
                    min="0"
                    step="any"
                  />
                  <Button onClick={handleAdd} disabled={addMutation.isPending}>
                    {addMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add
                  </Button>
                </div>
                <button
                  onClick={() => {
                    setPendingPick(null);
                    setSharesInput("");
                  }}
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="surface rounded-lg">
            <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
              <p className="font-display text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Active positions
              </p>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {holdings.length}
              </span>
            </div>
            <div className="divide-y divide-border/30">
              {holdings.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nothing here yet
                </p>
              )}
              {holdings.map((h) => {
                const quote = quoteBySymbol.get(h.symbol.toUpperCase());
                return (
                  <div
                    key={h.symbol}
                    className="group flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent/30"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{h.symbol}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {h.shares} sh
                        </span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {quote?.name ?? h.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-mono text-sm tabular-nums">
                          {quote ? formatCurrency(quote.price) : "—"}
                        </div>
                        {quote && (
                          <div
                            className={cn(
                              "font-mono text-xs tabular-nums",
                              colorForChange(quote.changePercent)
                            )}
                          >
                            {formatPercent(quote.changePercent)}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeMutation.mutate(h.symbol)}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label={`Remove ${h.symbol}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={holdings.length === 0 || analysisMutation.isPending}
            onClick={() => analysisMutation.mutate()}
          >
            {analysisMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading the tape…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Run swing-trade analysis
              </>
            )}
          </Button>
        </div>

        <div className="lg:col-span-8">
          <AnalysisPanel
            loading={analysisMutation.isPending}
            error={analysisMutation.error?.message ?? null}
            analysis={analysis}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AnalysisPanel({
  loading,
  error,
  analysis,
}: {
  loading: boolean;
  error: string | null;
  analysis: PortfolioAnalysis | null;
}) {
  if (loading) {
    return (
      <div className="surface flex flex-col items-center justify-center rounded-lg py-24 text-center animate-fade-in">
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 rounded-full border border-sage/20" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-sage" />
          <div className="absolute inset-3 animate-spin rounded-full border border-transparent border-t-gold/70 [animation-direction:reverse] [animation-duration:1.5s]" />
        </div>
        <h3 className="mt-6 font-display text-xl font-semibold">
          Consulting the tape…
        </h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Searching the news, weighing the signal-to-noise, drafting a written
          take for each position.
        </p>
        <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-sage" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface rounded-lg border-danger/30 bg-danger/5 p-6">
        <div className="flex items-start gap-3">
          <TriangleAlert className="h-5 w-5 text-danger" />
          <div>
            <p className="font-display font-semibold">Analysis failed</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="surface flex min-h-[420px] flex-col items-center justify-center rounded-lg border-dashed py-16 text-center">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-sage/10 text-sage">
          <Sparkles className="h-5 w-5" />
        </div>
        <h3 className="font-display text-lg font-semibold">
          Awaiting your portfolio
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Add a few stocks on the left, then ask for a read. The Sage will scan
          the news and return a written take per position.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="surface surface-glow grain rounded-lg overflow-hidden">
        <div className="relative p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-[11px] uppercase tracking-[0.16em] text-sage">
              Portfolio summary
            </p>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              Total: {formatCurrency(analysis.totalValue)}
            </span>
          </div>
          <p className="mt-3 font-display text-lg leading-snug text-foreground/95 sm:text-xl">
            {stripCite(analysis.summary)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {analysis.recommendations.map((rec) => (
          <RecommendationCard key={rec.symbol} rec={rec} />
        ))}
      </div>

      <p className="border-t border-border/30 pt-4 text-center text-[11px] text-muted-foreground">
        AI-generated analysis · Educational purposes only · Not financial advice
      </p>
    </div>
  );
}

function recBadgeVariant(rec: string): "success" | "warning" | "danger" {
  if (rec === "Buy") return "success";
  if (rec === "Sell") return "danger";
  return "warning";
}

function levelBadgeVariant(level: string): "success" | "warning" | "danger" {
  if (level === "Low") return "success";
  if (level === "High") return "danger";
  return "warning";
}

function RecommendationCard({ rec }: { rec: AnalysisRecommendation }) {
  return (
    <div className="surface relative overflow-hidden rounded-lg p-5 animate-slide-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-base font-bold">{rec.symbol}</div>
          <div className="truncate text-xs text-muted-foreground">{rec.name}</div>
        </div>
        <Badge variant={recBadgeVariant(rec.recommendation)} className="text-xs">
          {rec.recommendation}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-border/40 rounded-md border border-border/40 bg-background/30">
        <Stat label="Current" value={formatCurrency(rec.currentPrice)} />
        <Stat
          label="Target"
          value={rec.targetPrice != null ? formatCurrency(rec.targetPrice) : "—"}
          accent
        />
        <Stat
          label="Today"
          value={formatPercent(rec.changePercent)}
          tone={
            rec.changePercent > 0 ? "success" : rec.changePercent < 0 ? "danger" : undefined
          }
        />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-foreground/90">
        {stripCite(rec.reasoning)}
      </p>

      {rec.keyFactors.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          {rec.keyFactors.map((f, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-sage" />
              <span>{stripCite(f)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Badge variant={levelBadgeVariant(rec.riskLevel)} className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          {rec.riskLevel} risk
        </Badge>
        <Badge variant="secondary" className="gap-1">
          <Gauge className="h-3 w-3" />
          {rec.confidence} conviction
        </Badge>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "success" | "danger";
}) {
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          accent && "text-sage",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger"
        )}
      >
        {value}
      </div>
    </div>
  );
}
