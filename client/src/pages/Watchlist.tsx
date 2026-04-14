import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StockSearch } from "@/components/StockSearch";
import { api } from "@/lib/api";
import { cn, colorForChange, formatCurrency, formatPercent } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { StockQuote, Watchlist } from "@shared/schema";

export function WatchlistPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="py-20 text-center text-muted-foreground">Loading...</div>;
  }

  if (!isAuthenticated) return <SignInGate />;
  return <WatchlistContent />;
}

function SignInGate() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="w-full max-w-md animate-fade-in">
        <CardContent className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <Eye className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Sign in to use your watchlist</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Save stocks you want to track across sessions.
          </p>
          <Button asChild className="mt-6">
            <a href="/api/auth/google">Sign in with Google</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function WatchlistContent() {
  const qc = useQueryClient();

  const listQuery = useQuery<Watchlist[]>({
    queryKey: ["watchlist"],
    queryFn: () => api<Watchlist[]>("/api/watchlist"),
  });

  const symbols = (listQuery.data ?? []).map((w) => w.symbol);

  const quotesQuery = useQuery<StockQuote[]>({
    queryKey: ["watchlist-quotes", symbols.join(",")],
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
    mutationFn: async (symbol: string) =>
      api("/api/watchlist", { method: "POST", body: JSON.stringify({ symbol }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const removeMutation = useMutation({
    mutationFn: async (symbol: string) =>
      api(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
        <p className="text-sm text-muted-foreground">
          Stocks you want to keep an eye on — prices refresh every 30s.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <StockSearch
            onSelect={(r) => addMutation.mutate(r.symbol)}
            placeholder="Search to add a stock to your watchlist..."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Watching</span>
            <span className="text-xs font-normal text-muted-foreground">
              {symbols.length} {symbols.length === 1 ? "stock" : "stocks"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {listQuery.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/30" />
              ))}
            </div>
          )}
          {!listQuery.isLoading && symbols.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Your watchlist is empty
            </p>
          )}
          {(listQuery.data ?? []).map((w) => {
            const quote = quoteBySymbol.get(w.symbol.toUpperCase());
            return (
              <div
                key={w.symbol}
                className="group flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 transition-colors hover:border-border"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold">{w.symbol}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {quote?.name ?? w.symbol}
                  </div>
                </div>
                <div className="flex items-center gap-3">
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
                    onClick={() => removeMutation.mutate(w.symbol)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
