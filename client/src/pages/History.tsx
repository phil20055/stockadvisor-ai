import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { History as HistoryIcon, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatCurrency, stripCite } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { AnalysisHistoryRow } from "@shared/schema";

export function HistoryPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  }

  if (!isAuthenticated) return <SignInGate />;
  return <HistoryContent />;
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
          Sign in to keep an archive of every analysis you've run.
        </p>
        <Button asChild className="mt-6">
          <a href="/api/auth/google">Sign in with Google</a>
        </Button>
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

function groupByMinute(rows: AnalysisHistoryRow[]): Map<string, AnalysisHistoryRow[]> {
  const groups = new Map<string, AnalysisHistoryRow[]>();
  for (const row of rows) {
    const d = new Date(row.analyzedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }
  return groups;
}

function formatGroupDate(rows: AnalysisHistoryRow[]): string {
  const d = new Date(rows[0].analyzedAt);
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function HistoryContent() {
  const query = useQuery<AnalysisHistoryRow[]>({
    queryKey: ["analysis-history"],
    queryFn: () => api<AnalysisHistoryRow[]>("/api/analysis-history"),
  });

  const groups = useMemo(
    () => groupByMinute(query.data ?? []),
    [query.data]
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-1">
        <p className="font-display text-xs uppercase tracking-[0.18em] text-sage/80">
          Archive
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Every read you've asked for.
        </h1>
      </header>

      {query.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
      )}

      {!query.isLoading && (query.data?.length ?? 0) === 0 && (
        <div className="surface rounded-lg py-16 text-center text-sm text-muted-foreground">
          No analyses yet. Build a portfolio and ask for a read.
        </div>
      )}

      {Array.from(groups.entries()).map(([key, rows]) => (
        <section key={key} className="space-y-3">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-base font-semibold">
              {formatGroupDate(rows)}
            </h2>
            <span className="h-px flex-1 bg-border/40" />
            <span className="font-mono text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? "stock" : "stocks"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <article
                key={row.id}
                className="surface rounded-lg p-5 animate-slide-in"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-base font-bold">{row.symbol}</div>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.companyName}
                    </p>
                  </div>
                  <Badge variant={recBadgeVariant(row.recommendation)}>
                    {row.recommendation}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center gap-2 font-mono text-xs">
                  <span className="text-muted-foreground">
                    {row.currentPrice != null ? formatCurrency(row.currentPrice) : "—"}
                  </span>
                  <ArrowRight className="h-3 w-3 text-sage/60" />
                  <span className="text-sage">
                    {row.targetPrice != null ? formatCurrency(row.targetPrice) : "—"}
                  </span>
                </div>

                <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-foreground/80">
                  {stripCite(row.analysisText)}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {row.riskLevel && (
                    <Badge variant={levelBadgeVariant(row.riskLevel)}>
                      {row.riskLevel} risk
                    </Badge>
                  )}
                  {row.confidence && (
                    <Badge variant="secondary">{row.confidence} conviction</Badge>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
