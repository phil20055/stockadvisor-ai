import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { StockSearchResult } from "@shared/schema";

type Props = {
  onSelect: (result: StockSearchResult) => void;
  placeholder?: string;
};

export function StockSearch({ onSelect, placeholder = "Search stocks by symbol or name..." }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  const blurTimer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      try {
        const r = await api<StockSearchResult[]>(`/api/stocks/search?q=${encodeURIComponent(query)}`);
        setResults(r);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query]);

  const handleSelect = (r: StockSearchResult) => {
    onSelect(r);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 200);
          }}
          placeholder={placeholder}
          className="pl-9"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-md border border-border/60 bg-background/40 animate-slide-in">
          <ul className="max-h-80 divide-y divide-border/30 overflow-y-auto">
            {results.map((r) => (
              <li key={`${r.symbol}-${r.exchange}`}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (blurTimer.current) window.clearTimeout(blurTimer.current);
                    handleSelect(r);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-semibold">{r.symbol}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.name}</div>
                  </div>
                  {r.exchange && (
                    <span className="ml-3 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.exchange}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
