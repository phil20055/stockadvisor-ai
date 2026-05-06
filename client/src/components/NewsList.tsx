import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Newspaper } from "lucide-react";
import { api } from "@/lib/api";
import type { StockNews } from "@shared/schema";

type Props = {
  symbol: string;
  limit?: number;
};

export function NewsList({ symbol, limit = 4 }: Props) {
  const { data, isLoading } = useQuery<StockNews[]>({
    queryKey: ["news", symbol, limit],
    queryFn: () => api<StockNews[]>(`/api/stocks/${encodeURIComponent(symbol)}/news?limit=${limit}`),
    staleTime: 10 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted/30" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Newspaper className="h-3 w-3" />
        Recent news
      </div>
      <ul className="space-y-1">
        {data.map((n) => (
          <li key={n.id}>
            <a
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent/30"
            >
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-sage/60" />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 leading-snug text-foreground/90 group-hover:text-foreground">
                  {n.headline}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>{n.source}</span>
                  <span>·</span>
                  <span>{relativeTime(n.datetime)}</span>
                </div>
              </div>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function relativeTime(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`;
  return new Date(unixSec * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
