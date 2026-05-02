import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
    <div className="relative">
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
        <Card className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto border-border/80 bg-popover/95 p-1 shadow-2xl backdrop-blur-md">
          {results.map((r) => (
            <button
              key={`${r.symbol}-${r.exchange}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (blurTimer.current) window.clearTimeout(blurTimer.current);
                handleSelect(r);
              }}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold">{r.symbol}</div>
                <div className="truncate text-xs text-muted-foreground">{r.name}</div>
              </div>
              <div className="ml-3 shrink-0 text-[10px] uppercase text-muted-foreground">
                {r.exchange}
              </div>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
