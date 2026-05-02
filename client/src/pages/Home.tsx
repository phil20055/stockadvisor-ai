import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, ArrowDownRight, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn, colorForChange, formatCurrency, formatPercent } from "@/lib/utils";
import { formatEasternClock, getMarketStatus, type MarketStatus } from "@/lib/marketTime";
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
    <div className="space-y-12 animate-fade-in">
      <Hero
        onRefresh={handleRefresh}
        refreshing={indicesQuery.isFetching || moversQuery.isFetching}
      />

      <section>
        <SectionHeader
          eyebrow="Market overview"
          title="Where the market stands"
        />
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {indicesQuery.isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-muted/30" />
            ))}
          {(indicesQuery.data ?? []).map((idx) => (
            <IndexCard key={idx.symbol} index={idx} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          eyebrow="Today's tape"
          title="Biggest movers"
          aside={
            <span className="text-xs text-muted-foreground">
              from the {(moversQuery.data?.gainers.length ?? 0) + (moversQuery.data?.losers.length ?? 0) > 0 ? "popular" : ""} 50-stock universe
            </span>
          }
        />
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MoversColumn
            title="Top gainers"
            tone="success"
            stocks={moversQuery.data?.gainers ?? []}
            loading={moversQuery.isLoading}
          />
          <MoversColumn
            title="Top losers"
            tone="danger"
            stocks={moversQuery.data?.losers ?? []}
            loading={moversQuery.isLoading}
          />
        </div>
      </section>

      <section className="surface surface-glow grain overflow-hidden rounded-xl">
        <div className="relative grid grid-cols-1 gap-6 p-8 md:grid-cols-[1fr_auto] md:items-center md:gap-12 md:p-10">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.18em] text-sage">
              The sage's read
            </p>
            <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Build a position. Get a thoughtful second opinion.
            </h3>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Add a few stocks, run an analysis, and Market Sage will read the
              tape, scan recent news, and return a written take with a target,
              risk level, and confidence — grounded in what's happening today.
            </p>
          </div>
          <Button asChild size="lg" className="md:self-center">
            <Link href="/portfolio">
              <a>
                Build a portfolio
                <ArrowRight className="h-4 w-4" />
              </a>
            </Link>
          </Button>
        </div>
      </section>

      <p className="border-t border-border/30 pt-6 text-center text-xs text-muted-foreground">
        Quotes via Finnhub · Index values shown are SPY/QQQ/DIA ETF proxies on
        the free tier · Not financial advice.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Hero({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const status = getMarketStatus(now);

  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);

  return (
    <section className="relative">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <StatusPill status={status} />
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span className="hidden font-mono sm:inline">
              {formatEasternClock(now)} ET
            </span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{date}</span>
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Read the market{" "}
            <span className="italic text-sage">like a sage</span>.
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            A quiet, considered second opinion on your portfolio — pulled from
            live quotes and current news, every time you ask.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="self-start"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh data
        </Button>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: MarketStatus }) {
  const dot =
    status.state === "open"
      ? "bg-success"
      : status.state === "pre" || status.state === "after"
      ? "bg-gold"
      : "bg-muted-foreground";

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-2.5 py-1 font-medium uppercase tracking-wide">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {status.label}
    </span>
  );
}

function SectionHeader({
  eyebrow,
  title,
  aside,
}: {
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="font-display text-xs uppercase tracking-[0.18em] text-sage/80">
          {eyebrow}
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}

function IndexCard({ index }: { index: MarketIndex }) {
  const up = index.changePercent >= 0;
  return (
    <div className="surface group relative overflow-hidden rounded-lg p-5 transition-colors animate-slide-in hover:border-border">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-display text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {index.name}
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {index.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            up
              ? "bg-success/10 text-success"
              : "bg-danger/10 text-danger"
          )}
        >
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {formatPercent(index.changePercent)}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className={cn("font-mono", colorForChange(index.change))}>
          {index.change >= 0 ? "+" : ""}
          {index.change.toFixed(2)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          today
        </span>
      </div>
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 h-px",
          up
            ? "bg-gradient-to-r from-transparent via-success/40 to-transparent"
            : "bg-gradient-to-r from-transparent via-danger/40 to-transparent"
        )}
      />
    </div>
  );
}

function MoversColumn({
  title,
  tone,
  stocks,
  loading,
}: {
  title: string;
  tone: "success" | "danger";
  stocks: StockQuote[];
  loading: boolean;
}) {
  return (
    <div className="surface overflow-hidden rounded-lg animate-slide-in">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <span
          className={cn(
            "font-display text-xs uppercase tracking-[0.18em]",
            tone === "success" ? "text-success" : "text-danger"
          )}
        >
          {title}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {stocks.length} stocks
        </span>
      </div>
      {loading && (
        <div className="space-y-1 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted/30" />
          ))}
        </div>
      )}
      {!loading && stocks.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">No data</div>
      )}
      <ul className="divide-y divide-border/30">
        {stocks.map((s, i) => (
          <li
            key={s.symbol}
            className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-accent/30"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="w-5 text-right font-mono text-[11px] text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold">{s.symbol}</div>
                <div className="truncate text-xs text-muted-foreground">{s.name}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm tabular-nums">{formatCurrency(s.price)}</div>
              <div className={cn("font-mono text-xs tabular-nums", colorForChange(s.changePercent))}>
                {formatPercent(s.changePercent)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
