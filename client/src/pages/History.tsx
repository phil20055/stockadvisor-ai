import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  History as HistoryIcon,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Trophy,
  Frown,
  Clock,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn, colorForChange, formatCurrency, formatPercent, stripCite } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { CallOutcome, TrackedCall, TrackRecord } from "@shared/schema";

type Filter = "all" | "open" | "settled" | "win" | "loss";

export function HistoryPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  }
  if (!isAuthenticated) return <SignInGate />;
  return <TrackRecordContent />;
}

function SignInGate() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="surface w-full max-w-md rounded-lg p-10 text-center animate-fade-in">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage/10 text-sage">
          <HistoryIcon className="h-5 w-5" />
        </div>
        <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight">
          Every read, on the record
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to keep a track record of every analysis you've run and how
          it played out.
        </p>
        <Button asChild className="mt-6">
          <a href="/api/auth/google">Sign in with Google</a>
        </Button>
      </div>
    </div>
  );
}

function TrackRecordContent() {
  const [filter, setFilter] = useState<Filter>("all");
  const query = useQuery<TrackRecord>({
    queryKey: ["analysis-history"],
    queryFn: () => api<TrackRecord>("/api/analysis-history"),
  });

  const data = query.data;
  const calls = data?.calls ?? [];

  const filtered = useMemo(() => {
    if (filter === "all") return calls;
    if (filter === "open") return calls.filter((c) => c.outcome === "open");
    if (filter === "settled") return calls.filter((c) => c.outcome !== "open");
    if (filter === "win") return calls.filter((c) => c.outcome === "win");
    if (filter === "loss") return calls.filter((c) => c.outcome === "loss");
    return calls;
  }, [calls, filter]);

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-1">
        <p className="font-display text-xs uppercase tracking-[0.18em] text-sage/80">
          Track record
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          How Sage's calls played out.
        </h1>
        <p className="text-sm text-muted-foreground">
          Calls settle after 14 days. Buy calls win when the stock rises, sell
          calls win when it falls, hold calls win when it stays within 5%.
        </p>
      </header>

      {query.isLoading && (
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-40 animate-pulse rounded-lg bg-muted/30" />
        </div>
      )}

      {!query.isLoading && data && data.calls.length === 0 && (
        <div className="surface rounded-lg py-16 text-center text-sm text-muted-foreground">
          No analyses yet. Build a portfolio and ask for a read.
        </div>
      )}

      {data && data.calls.length > 0 && (
        <>
          <SummaryHero record={data} />
          <FilterBar filter={filter} setFilter={setFilter} record={data} />
          <CallList calls={filtered} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SummaryHero({ record }: { record: TrackRecord }) {
  const { summary } = record;
  const hitRateLabel = summary.settled === 0 ? "—" : `${Math.round(summary.hitRate)}%`;
  const avgReturnLabel = `${summary.avgReturnPct >= 0 ? "+" : ""}${summary.avgReturnPct.toFixed(2)}%`;

  return (
    <section className="surface surface-glow grain rounded-xl overflow-hidden">
      <div className="grid grid-cols-1 divide-y divide-border/30 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <HeroStat
          label="Hit rate"
          value={hitRateLabel}
          sub={`${summary.wins} wins · ${summary.losses} losses`}
          icon={<Trophy className="h-4 w-4" />}
          accent="sage"
        />
        <HeroStat
          label="Average return"
          value={avgReturnLabel}
          sub="across all calls, direction-adjusted"
          icon={summary.avgReturnPct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          accent={summary.avgReturnPct >= 0 ? "success" : "danger"}
        />
        <HeroStat
          label="Total calls"
          value={String(summary.total)}
          sub={`${summary.settled} settled · ${summary.total - summary.settled} open`}
          icon={<Clock className="h-4 w-4" />}
        />
        <BestWorstStat best={summary.bestCall} worst={summary.worstCall} />
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon?: React.ReactNode;
  accent?: "sage" | "success" | "danger";
}) {
  const accentClass =
    accent === "sage"
      ? "text-sage"
      : accent === "success"
      ? "text-success"
      : accent === "danger"
      ? "text-danger"
      : "text-foreground";
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("mt-2 font-display text-3xl font-semibold tracking-tight tabular-nums", accentClass)}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function BestWorstStat({
  best,
  worst,
}: {
  best: TrackedCall | null;
  worst: TrackedCall | null;
}) {
  if (!best && !worst) {
    return (
      <div className="p-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Best / worst
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          Need a settled call first
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Best / worst
      </div>
      {best && (
        <div className="flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-success shrink-0" />
          <span className="font-mono text-sm font-semibold">{best.symbol}</span>
          <span className="font-mono text-xs text-success tabular-nums">
            {formatPercent(directionalReturn(best))}
          </span>
        </div>
      )}
      {worst && worst.id !== best?.id && (
        <div className="flex items-center gap-2">
          <Frown className="h-3.5 w-3.5 text-danger shrink-0" />
          <span className="font-mono text-sm font-semibold">{worst.symbol}</span>
          <span className="font-mono text-xs text-danger tabular-nums">
            {formatPercent(directionalReturn(worst))}
          </span>
        </div>
      )}
    </div>
  );
}

function directionalReturn(call: TrackedCall): number {
  const r = call.changeSincePercent ?? 0;
  return call.recommendation === "Sell" ? -r : r;
}

// ---------------------------------------------------------------------------

function FilterBar({
  filter,
  setFilter,
  record,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  record: TrackRecord;
}) {
  const counts = useMemo(() => {
    const c = { all: 0, open: 0, settled: 0, win: 0, loss: 0 };
    c.all = record.calls.length;
    for (const call of record.calls) {
      if (call.outcome === "open") c.open++;
      else c.settled++;
      if (call.outcome === "win") c.win++;
      if (call.outcome === "loss") c.loss++;
    }
    return c;
  }, [record]);

  const tabs: Array<{ key: Filter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "open", label: "Open", count: counts.open },
    { key: "settled", label: "Settled", count: counts.settled },
    { key: "win", label: "Wins", count: counts.win },
    { key: "loss", label: "Losses", count: counts.loss },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/40 bg-card/40 p-1">
      {tabs.map((t) => {
        const active = filter === t.key;
        return (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            <span
              className={cn(
                "ml-1.5 font-mono text-[10px] tabular-nums",
                active ? "text-muted-foreground" : "text-muted-foreground/60"
              )}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CallList({ calls }: { calls: TrackedCall[] }) {
  if (calls.length === 0) {
    return (
      <div className="surface rounded-lg py-12 text-center text-sm text-muted-foreground">
        No calls match this filter
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {calls.map((c) => (
        <CallCard key={c.id} call={c} />
      ))}
    </div>
  );
}

function recBadgeVariant(rec: string): "success" | "warning" | "danger" {
  if (rec === "Buy") return "success";
  if (rec === "Sell") return "danger";
  return "warning";
}

function outcomeStyles(outcome: CallOutcome) {
  switch (outcome) {
    case "win":
      return { label: "Win", color: "text-success", bg: "bg-success/10", ring: "ring-success/30" };
    case "loss":
      return { label: "Miss", color: "text-danger", bg: "bg-danger/10", ring: "ring-danger/30" };
    case "neutral":
      return { label: "Flat", color: "text-muted-foreground", bg: "bg-muted/30", ring: "ring-border" };
    case "open":
    default:
      return { label: "Open", color: "text-gold", bg: "bg-gold/10", ring: "ring-gold/30" };
  }
}

function CallCard({ call }: { call: TrackedCall }) {
  const styles = outcomeStyles(call.outcome);
  const directional = directionalReturn(call);

  return (
    <article className={cn("surface relative overflow-hidden rounded-lg p-5 ring-1 animate-slide-in", styles.ring)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-base font-bold">{call.symbol}</div>
          <p className="truncate text-xs text-muted-foreground">{call.companyName}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={recBadgeVariant(call.recommendation)}>{call.recommendation}</Badge>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              styles.bg,
              styles.color
            )}
          >
            {styles.label}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-md border border-border/40 bg-background/30 p-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Then</div>
          <div className="font-mono text-sm font-semibold tabular-nums">
            {call.priceAtCall != null ? formatCurrency(call.priceAtCall) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Now</div>
          <div className="font-mono text-sm font-semibold tabular-nums">
            {call.priceNow != null ? formatCurrency(call.priceNow) : "—"}
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-between border-t border-border/30 pt-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Move since
          </span>
          <span
            className={cn(
              "font-mono text-sm tabular-nums",
              colorForChange(directional)
            )}
          >
            {call.changeSincePercent != null
              ? `${directional >= 0 ? "+" : ""}${directional.toFixed(2)}%`
              : "—"}
          </span>
        </div>
      </div>

      {call.targetPrice != null && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Target className={cn("h-3 w-3", call.hitTarget ? "text-success" : "text-muted-foreground")} />
          <span className="text-muted-foreground">Target</span>
          <span className="font-mono tabular-nums text-sage">{formatCurrency(call.targetPrice)}</span>
          {call.hitTarget && (
            <span className="ml-auto rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
              hit
            </span>
          )}
        </div>
      )}

      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-foreground/75">
        {stripCite(call.analysisText)}
      </p>

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {new Date(call.analyzedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <span>{daysAgoLabel(call.daysSince)}</span>
      </div>
    </article>
  );
}

function daysAgoLabel(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}
