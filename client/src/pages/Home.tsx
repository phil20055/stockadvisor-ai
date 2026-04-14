import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, ArrowDownRight, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn, colorForChange, formatCurrency, formatPercent } from "@/lib/utils";
import type { MarketIndex, MoversResponse, StockQuote } from "@shared/schema";

const MARKET_REFETCH_MS = 5 * 60 * 1000;

export function HomePage() {
  const qc = useQueryClient();

  const indicesQuery = useQuery<MarketIndex[]>({
    queryKey: ["market", "overview"],
    queryFn: () => api<MarketIndex[]>("/api/market/overview"),
    refetchInterval: MARKET_REFETCH_MS,
  });

  const moversQuery = useQuery<MoversResponse>({
    queryKey: ["market", "movers"],
    queryFn: () => api<MoversResponse>("/api/market/movers"),
    refetchInterval: MARKET_REFETCH_MS,
  });

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["market"] });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Market Overview</h1>
            <p className="text-sm text-muted-foreground">
              Live snapshot of major US indices
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={indicesQuery.isFetching || moversQuery.isFetching}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                (indicesQuery.isFetching || moversQuery.isFetching) && "animate-spin"
              )}
            />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {indicesQuery.isLoading && Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-28" />
            </Card>
          ))}
          {(indicesQuery.data ?? []).map((idx) => (
            <IndexCard key={idx.symbol} index={idx} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold tracking-tight">Big Movers Today</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MoversColumn
            title="Top Gainers"
            icon={<TrendingUp className="h-4 w-4" />}
            tone="success"
            stocks={moversQuery.data?.gainers ?? []}
            loading={moversQuery.isLoading}
          />
          <MoversColumn
            title="Top Losers"
            icon={<TrendingDown className="h-4 w-4" />}
            tone="danger"
            stocks={moversQuery.data?.losers ?? []}
            loading={moversQuery.isLoading}
          />
        </div>
      </section>

      <section>
        <Card className="glass-card overflow-hidden">
          <CardContent className="flex flex-col items-start justify-between gap-4 p-8 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-xl font-bold">Ready to analyze?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Build a portfolio and let AI run a swing-trade analysis grounded in current news.
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/portfolio">
                <a>
                  Build your portfolio
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Data sourced from Yahoo Finance. Prices may be delayed up to 15 minutes. Not financial advice.
      </p>
    </div>
  );
}

function IndexCard({ index }: { index: MarketIndex }) {
  const up = index.changePercent >= 0;
  return (
    <Card className="overflow-hidden animate-slide-in">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {index.name}
            </div>
            <div className="mt-1 font-mono text-2xl font-semibold">
              {index.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
              up
                ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                : "bg-[hsl(var(--danger))]/15 text-[hsl(var(--danger))]"
            )}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {formatPercent(index.changePercent)}
          </div>
        </div>
        <div className={cn("mt-2 font-mono text-sm", colorForChange(index.change))}>
          {index.change >= 0 ? "+" : ""}
          {index.change.toFixed(2)}
        </div>
      </CardContent>
    </Card>
  );
}

function MoversColumn({
  title,
  icon,
  tone,
  stocks,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "success" | "danger";
  stocks: StockQuote[];
  loading: boolean;
}) {
  return (
    <Card className="animate-slide-in">
      <CardHeader
        className={cn(
          "rounded-t-xl border-b border-border/50",
          tone === "success"
            ? "bg-[hsl(var(--success))]/5 text-[hsl(var(--success))]"
            : "bg-[hsl(var(--danger))]/5 text-[hsl(var(--danger))]"
        )}
      >
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading && (
          <div className="space-y-1 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
            ))}
          </div>
        )}
        {!loading && stocks.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No data</div>
        )}
        <ul className="divide-y divide-border/40">
          {stocks.map((s) => (
            <li
              key={s.symbol}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/30"
            >
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold">{s.symbol}</div>
                <div className="truncate text-xs text-muted-foreground">{s.name}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm">{formatCurrency(s.price)}</div>
                <div className={cn("font-mono text-xs", colorForChange(s.changePercent))}>
                  {formatPercent(s.changePercent)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
