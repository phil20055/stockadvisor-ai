import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StockSearch } from "@/components/StockSearch";
import { api } from "@/lib/api";
import { cn, colorForChange, formatCurrency, formatPercent } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { StockQuote, Watchlist } from "@shared/schema";

export function WatchlistPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  }

  if (!isAuthenticated) return <SignInGate />;
  return <WatchlistContent />;
}

function SignInGate() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="surface w-full max-w-md rounded-lg p-10 text-center animate-fade-in">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage/10 text-sage">
          <Eye className="h-5 w-5" />
        </div>
        <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight">
          A watchlist remembers
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with Google to keep a list of stocks you're tracking across
          sessions.
        </p>
        <Button asChild className="mt-6">
          <a href="/api/auth/google">Sign in with Google</a>
        </Button>
      </div>
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
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <header className="space-y-1">
        <p className="font-display text-xs uppercase tracking-[0.18em] text-sage/80">
          Watchlist
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Stocks worth keeping an eye on.
        </h1>
        <p className="text-sm text-muted-foreground">
          Quotes refresh automatically every 30 seconds.
        </p>
      </header>

      <div className="surface relative z-30 rounded-lg p-4">
        <StockSearch
          onSelect={(r) => addMutation.mutate(r.symbol)}
          placeholder="Search to add a stock to your watchlist…"
        />
      </div>

      <div className="surface rounded-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
          <p className="font-display text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Watching
          </p>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {symbols.length}
          </span>
        </div>
        <div className="divide-y divide-border/30">
          {listQuery.isLoading && (
            <div className="space-y-1 p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />
              ))}
            </div>
          )}
          {!listQuery.isLoading && symbols.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Your watchlist is empty
            </p>
          )}
          {(listQuery.data ?? []).map((w) => {
            const quote = quoteBySymbol.get(w.symbol.toUpperCase());
            return (
              <div
                key={w.symbol}
                className="group flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent/30"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold">{w.symbol}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {quote?.name ?? w.symbol}
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
                    onClick={() => removeMutation.mutate(w.symbol)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Remove ${w.symbol}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
