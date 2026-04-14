import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const LOCAL_KEY = "stockadvisor:guest-portfolio";

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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-4">
        {!isAuthenticated && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 text-sm">
              <a href="/api/auth/google" className="font-medium text-primary hover:underline">
                Sign in
              </a>{" "}
              to save your portfolio across sessions.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portfolio Builder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StockSearch onSelect={(r) => setPendingPick(r)} />
            {pendingPick && (
              <Card className="animate-slide-in border-primary/40">
                <CardContent className="space-y-3 p-4">
                  <div>
                    <div className="font-mono text-sm font-semibold">{pendingPick.symbol}</div>
                    <div className="text-xs text-muted-foreground">{pendingPick.name}</div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Shares to analyze"
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setPendingPick(null);
                      setSharesInput("");
                    }}
                  >
                    Cancel
                  </Button>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Active Positions</span>
              <span className="text-xs font-normal text-muted-foreground">
                {holdings.length} {holdings.length === 1 ? "stock" : "stocks"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {holdings.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Search above to add stocks
              </p>
            )}
            {holdings.map((h) => {
              const quote = quoteBySymbol.get(h.symbol.toUpperCase());
              return (
                <div
                  key={h.symbol}
                  className="group flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 transition-colors hover:border-border"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-sm font-semibold">{h.symbol}</div>
                      <div className="text-xs text-muted-foreground">
                        {h.shares} {h.shares === 1 ? "share" : "shares"}
                      </div>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {quote?.name ?? h.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="font-mono text-sm">
                        {quote ? formatCurrency(quote.price) : "—"}
                      </div>
                      {quote && (
                        <div
                          className={cn(
                            "font-mono text-xs",
                            colorForChange(quote.changePercent)
                          )}
                        >
                          {formatPercent(quote.changePercent)}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => removeMutation.mutate(h.symbol)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Button
          className="w-full"
          size="lg"
          disabled={holdings.length === 0 || analysisMutation.isPending}
          onClick={() => analysisMutation.mutate()}
        >
          {analysisMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Run Swing Trade Analysis
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
  );
}

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
      <Card className="animate-fade-in">
        <CardContent className="flex flex-col items-center justify-center py-24 text-center">
          <div className="relative h-20 w-20">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
            <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-primary/60 [animation-direction:reverse] [animation-duration:1.5s]" />
          </div>
          <h3 className="mt-6 text-lg font-semibold">Analyzing your portfolio...</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Claude is searching the web for news, earnings, and analyst opinions.
          </p>
          <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <TriangleAlert className="h-5 w-5 text-destructive" />
            <div>
              <div className="font-semibold">Analysis failed</div>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="border-dashed border-border/60 bg-transparent">
        <CardContent className="flex min-h-[400px] flex-col items-center justify-center py-16 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No analysis yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add stocks on the left, then run a swing-trade analysis. The AI will research each
            position and return a recommendation.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Portfolio AI Summary</CardTitle>
            <Badge variant="default">
              Total: {formatCurrency(analysis.totalValue)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-foreground/90">
            {stripCite(analysis.summary)}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {analysis.recommendations.map((rec) => (
          <RecommendationCard key={rec.symbol} rec={rec} />
        ))}
      </div>
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
    <Card className="animate-slide-in">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="font-mono text-lg font-bold">{rec.symbol}</div>
            <div className="truncate text-xs text-muted-foreground">{rec.name}</div>
          </div>
          <Badge variant={recBadgeVariant(rec.recommendation)} className="text-sm">
            {rec.recommendation}
          </Badge>
        </div>

        <div className="flex items-center gap-4 border-y border-border/40 py-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Current
            </div>
            <div className="font-mono text-sm font-semibold">
              {formatCurrency(rec.currentPrice)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Target
            </div>
            <div className="font-mono text-sm font-semibold text-primary">
              {rec.targetPrice != null ? formatCurrency(rec.targetPrice) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Change
            </div>
            <div className={cn("font-mono text-sm", colorForChange(rec.changePercent))}>
              {formatPercent(rec.changePercent)}
            </div>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-foreground/90">
          {stripCite(rec.reasoning)}
        </p>

        {rec.keyFactors.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {rec.keyFactors.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{stripCite(f)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Badge variant={levelBadgeVariant(rec.riskLevel)}>
            Risk: {rec.riskLevel}
          </Badge>
          <Badge variant="secondary">Confidence: {rec.confidence}</Badge>
        </div>

        <div className="flex items-start gap-2 rounded-md bg-[hsl(var(--warning))]/10 p-2 text-[11px] text-[hsl(var(--warning))]">
          <TriangleAlert className="h-3 w-3 shrink-0 mt-0.5" />
          <span>AI-Generated Analysis Only — Not Financial Advice. Data may be incomplete or inaccurate.</span>
        </div>
      </CardContent>
    </Card>
  );
}
