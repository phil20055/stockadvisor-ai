import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  History as HistoryIcon,
  Trophy,
  Frown,
  Clock,
  Target,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccuracyChart } from "@/components/AccuracyChart";
import { api } from "@/lib/api";
import { cn, colorForChange, formatCurrency, formatPercent } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type {
  AccuracyByType,
  PredictionStatus,
  TrackRecordEntry,
  UserTrackRecord,
} from "@shared/schema";

type Filter = "all" | "pending" | "correct" | "incorrect";

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
  const query = useQuery<UserTrackRecord>({
    queryKey: ["track-record"],
    queryFn: () => api<UserTrackRecord>("/api/track-record"),
  });

  const data = query.data;
  const calls = data?.entries ?? [];

  const filtered = useMemo(() => {
    if (filter === "all") return calls;
    return calls.filter((c) => c.status === filter);
  }, [calls, filter]);

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-1">
        <p className="font-display text-xs uppercase tracking-[0.18em] text-sage/80">
          Track record
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          How Sage's calls have played out.
        </h1>
        <p className="text-sm text-muted-foreground">
          Predictions are checked at 3, 7, and 14 days. A call settles at 14
          days: Buy wins on a +2% rise, Sell wins on a 2% fall, Hold wins
          within ±2%.
        </p>
      </header>

      {query.isLoading && (
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-40 animate-pulse rounded-lg bg-muted/30" />
        </div>
      )}

      {!query.isLoading && data && data.total === 0 && (
        <div className="surface rounded-lg py-16 text-center text-sm text-muted-foreground">
          No analyses yet. Build a portfolio and ask for a read.
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <SummaryHero record={data} />
          <AccuracyByTypeRow byType={data.byType} />
          <TrendChart record={data} />
          <FilterBar filter={filter} setFilter={setFilter} record={data} />
          <CallList calls={filtered} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SummaryHero({ record }: { record: UserTrackRecord }) {
  const accuracyLabel = record.resolved === 0 ? "—" : `${Math.round(record.accuracyPct)}%`;
  const buyAvgLabel = `${record.buyAvgReturnPct >= 0 ? "+" : ""}${record.buyAvgReturnPct.toFixed(2)}%`;

  return (
    <section className="surface surface-glow grain rounded-xl overflow-hidden">
      <div className="grid grid-cols-1 divide-y divide-border/30 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <HeroStat
          label="Accuracy"
          value={accuracyLabel}
          sub={`${record.correct} correct · ${record.incorrect} incorrect · ${record.pending} pending`}
          icon={<Trophy className="h-4 w-4" />}
          accent="sage"
        />
        <HeroStat
          label="Avg return on Buys"
          value={buyAvgLabel}
          sub="14-day mark, settled calls only"
          icon={
            record.buyAvgReturnPct >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )
          }
          accent={record.buyAvgReturnPct >= 0 ? "success" : "danger"}
        />
        <HeroStat
          label="Total calls"
          value={String(record.total)}
          sub={`${record.resolved} settled · ${record.pending} open`}
          icon={<Clock className="h-4 w-4" />}
        />
        <BestWorstStat best={record.bestCall} worst={record.worstCall} />
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
  best: TrackRecordEntry | null;
  worst: TrackRecordEntry | null;
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
            {formatDirReturn(best)}
          </span>
        </div>
      )}
      {worst && worst.id !== best?.id && (
        <div className="flex items-center gap-2">
          <Frown className="h-3.5 w-3.5 text-danger shrink-0" />
          <span className="font-mono text-sm font-semibold">{worst.symbol}</span>
          <span className="font-mono text-xs text-danger tabular-nums">
            {formatDirReturn(worst)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDirReturn(call: TrackRecordEntry): string {
  const price = call.priceAfter14Days ?? call.priceAfter7Days ?? call.priceAfter3Days;
  if (price == null) return "—";
  const movePct = ((price - call.priceAtPrediction) / call.priceAtPrediction) * 100;
  const dir = call.recommendation === "Sell" ? -movePct : movePct;
  return `${dir >= 0 ? "+" : ""}${dir.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------

function AccuracyByTypeRow({ byType }: { byType: AccuracyByType[] }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {byType.map((row) => {
        const tone =
          row.recommendation === "Buy"
            ? "success"
            : row.recommendation === "Sell"
            ? "danger"
            : "warning";
        const toneClass =
          tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-gold";
        return (
          <div key={row.recommendation} className="surface rounded-lg p-5">
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "font-display text-[11px] uppercase tracking-[0.18em]",
                  toneClass
                )}
              >
                {row.recommendation} accuracy
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {row.correct}/{row.total}
              </span>
            </div>
            <div className="mt-2 font-display text-2xl font-semibold tabular-nums">
              {row.total === 0 ? "—" : `${Math.round(row.accuracy)}%`}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/40">
              <div
                className={cn(
                  "h-full rounded-full",
                  tone === "success"
                    ? "bg-success"
                    : tone === "danger"
                    ? "bg-danger"
                    : "bg-gold"
                )}
                style={{ width: row.total === 0 ? "0%" : `${row.accuracy}%` }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function TrendChart({ record }: { record: UserTrackRecord }) {
  return (
    <section className="surface rounded-lg p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display text-[11px] uppercase tracking-[0.18em] text-sage/80">
          Rolling 30-day accuracy
        </p>
        <span className="text-[10px] text-muted-foreground">
          {record.rolling30.length} data points
        </span>
      </div>
      <AccuracyChart points={record.rolling30} />
    </section>
  );
}

// ---------------------------------------------------------------------------

function FilterBar({
  filter,
  setFilter,
  record,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  record: UserTrackRecord;
}) {
  const tabs: Array<{ key: Filter; label: string; count: number }> = [
    { key: "all", label: "All", count: record.total },
    { key: "pending", label: "Pending", count: record.pending },
    { key: "correct", label: "Correct", count: record.correct },
    { key: "incorrect", label: "Incorrect", count: record.incorrect },
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

function CallList({ calls }: { calls: TrackRecordEntry[] }) {
  if (calls.length === 0) {
    return (
      <div className="surface rounded-lg py-12 text-center text-sm text-muted-foreground">
        No calls match this filter
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {calls.map((c) => (
        <CallRow key={c.id} call={c} />
      ))}
    </ul>
  );
}

function recBadgeVariant(rec: string): "success" | "warning" | "danger" {
  if (rec === "Buy") return "success";
  if (rec === "Sell") return "danger";
  return "warning";
}

function statusGlyph(status: PredictionStatus) {
  switch (status) {
    case "correct":
      return { icon: CheckCircle2, color: "text-success", label: "Correct" };
    case "incorrect":
      return { icon: XCircle, color: "text-danger", label: "Incorrect" };
    case "pending":
    default:
      return { icon: Clock, color: "text-muted-foreground", label: "Pending" };
  }
}

function CallRow({ call }: { call: TrackRecordEntry }) {
  const StatusIcon = statusGlyph(call.status).icon;
  const statusColor = statusGlyph(call.status).color;

  const latestPrice = call.priceAfter14Days ?? call.priceAfter7Days ?? call.priceAfter3Days;
  const movePct =
    latestPrice != null
      ? ((latestPrice - call.priceAtPrediction) / call.priceAtPrediction) * 100
      : null;

  return (
    <li className="surface flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center animate-slide-in">
      <div className={cn("flex items-center gap-3 sm:w-44", statusColor)}>
        <StatusIcon className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold text-foreground">{call.symbol}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {new Date(call.predictedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}{" "}
            · {daysAgoLabel(call.daysSince)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge variant={recBadgeVariant(call.recommendation)}>{call.recommendation}</Badge>
        {call.targetPrice != null && (
          <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <Target className="h-3 w-3" />
            {formatCurrency(call.targetPrice)}
          </span>
        )}
      </div>

      <div className="flex flex-1 items-center gap-3 text-xs">
        <div className="font-mono">
          <span className="text-muted-foreground">at </span>
          <span className="tabular-nums">{formatCurrency(call.priceAtPrediction)}</span>
        </div>
        {latestPrice != null && (
          <>
            <span className="text-muted-foreground">→</span>
            <div className="font-mono">
              <span className="text-muted-foreground">now </span>
              <span className="tabular-nums">{formatCurrency(latestPrice)}</span>
            </div>
          </>
        )}
        {movePct != null && (
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 font-mono text-xs tabular-nums",
              colorForChange(movePct),
              movePct > 0 ? "bg-success/10" : movePct < 0 ? "bg-danger/10" : "bg-muted/30"
            )}
          >
            {formatPercent(movePct)}
          </span>
        )}
      </div>

      {call.outcomeNotes && (
        <p className="border-t border-border/30 pt-2 text-xs text-muted-foreground sm:max-w-xs sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
          {call.outcomeNotes}
        </p>
      )}
    </li>
  );
}

function daysAgoLabel(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}
