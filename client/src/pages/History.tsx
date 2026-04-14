import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { History as HistoryIcon, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatCurrency, stripCite } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { AnalysisHistoryRow } from "@shared/schema";

export function HistoryPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="py-20 text-center text-muted-foreground">Loading...</div>;
  }

  if (!isAuthenticated) return <SignInGate />;
  return <HistoryContent />;
}

function SignInGate() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="w-full max-w-md animate-fade-in">
        <CardContent className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <HistoryIcon className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Sign in to view your history</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Every analysis you run is saved here automatically.
          </p>
          <Button asChild className="mt-6">
            <a href="/api/auth/google">Sign in with Google</a>
          </Button>
        </CardContent>
      </Card>
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
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
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
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analysis History</h1>
        <p className="text-sm text-muted-foreground">
          Every swing-trade analysis you've run.
        </p>
      </div>

      {query.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/30" />
          ))}
        </div>
      )}

      {!query.isLoading && (query.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No analyses yet. Run one from the Portfolio page.
          </CardContent>
        </Card>
      )}

      {Array.from(groups.entries()).map(([key, rows]) => (
        <section key={key} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {formatGroupDate(rows)}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <Card key={row.id} className="animate-slide-in">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="font-mono text-base">{row.symbol}</CardTitle>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.companyName}
                      </p>
                    </div>
                    <Badge variant={recBadgeVariant(row.recommendation)}>
                      {row.recommendation}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span>{row.currentPrice != null ? formatCurrency(row.currentPrice) : "—"}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-primary">
                      {row.targetPrice != null ? formatCurrency(row.targetPrice) : "—"}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-xs leading-relaxed text-foreground/80">
                    {stripCite(row.analysisText)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {row.riskLevel && (
                      <Badge variant={levelBadgeVariant(row.riskLevel)}>
                        Risk: {row.riskLevel}
                      </Badge>
                    )}
                    {row.confidence && (
                      <Badge variant="secondary">Conf: {row.confidence}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
