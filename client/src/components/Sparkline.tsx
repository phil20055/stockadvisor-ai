import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { StockQuote } from "@shared/schema";

type Props = {
  quote?: Pick<StockQuote, "price" | "open" | "high" | "low" | "prevClose" | "changePercent">;
  className?: string;
  width?: number;
  height?: number;
};

/**
 * Tiny inline sparkline that traces a stock's intraday journey using the
 * known data points from the quote endpoint:
 *
 *   prevClose -> open -> intraday extreme -> opposite extreme -> current
 *
 * It's not real tick data — it's a smooth curve guaranteed to pass through
 * the actual day's high and low and end at the current price. Honest about
 * its precision but visually informative.
 */
export function Sparkline({ quote, className, width = 80, height = 28 }: Props) {
  const reactId = useId();
  const path = useMemo(() => {
    if (!quote) return null;
    return buildPath(quote, width, height);
  }, [quote, width, height]);

  if (!path) {
    return (
      <div
        className={cn("inline-block", className)}
        style={{ width, height }}
        aria-hidden
      />
    );
  }

  const up = (quote?.changePercent ?? 0) >= 0;
  const stroke = up ? "hsl(var(--neon-up))" : "hsl(var(--neon-down))";
  const fillId = `${reactId}-fill`;
  const glowId = `${reactId}-glow`;
  const sheenId = `${reactId}-sheen`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("inline-block overflow-visible", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={sheenId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
        </filter>
      </defs>

      {/* Soft halo behind the line for the neon bloom */}
      <path
        d={path.line}
        fill="none"
        stroke={stroke}
        strokeOpacity="0.45"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${sheenId})`}
      />
      <path d={path.fill} fill={`url(#${fillId})`} />
      <path
        d={path.line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      />
      <circle
        cx={path.endPoint.x}
        cy={path.endPoint.y}
        r="2.2"
        fill={stroke}
        filter={`url(#${glowId})`}
      />
    </svg>
  );
}

function buildPath(
  q: NonNullable<Props["quote"]>,
  width: number,
  height: number
) {
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const o = q.open;
  const hi = q.high;
  const lo = q.low;
  const c = q.price;
  const pc = q.prevClose;

  // Decide which extreme came first this session — use a deterministic pseudo
  // choice based on whether change is positive (peak first looks more natural
  // for a down day, and trough first for an up day).
  const up = (q.changePercent ?? 0) >= 0;
  const points: number[] = [];
  if (typeof pc === "number") points.push(pc);
  if (typeof o === "number") points.push(o);
  if (typeof hi === "number" && typeof lo === "number") {
    if (up) {
      points.push(lo, hi);
    } else {
      points.push(hi, lo);
    }
  }
  if (typeof c === "number") points.push(c);

  if (points.length < 2) return null;

  // Map values to coordinates.
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * w);
  const ys = points.map((v) => pad + h - ((v - min) / range) * h);

  // Catmull-Rom -> cubic bezier for smooth curve.
  const lineCmds: string[] = [`M ${xs[0]},${ys[0]}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0x = xs[Math.max(0, i - 1)];
    const p0y = ys[Math.max(0, i - 1)];
    const p1x = xs[i];
    const p1y = ys[i];
    const p2x = xs[i + 1];
    const p2y = ys[i + 1];
    const p3x = xs[Math.min(points.length - 1, i + 2)];
    const p3y = ys[Math.min(points.length - 1, i + 2)];
    const c1x = p1x + (p2x - p0x) / 6;
    const c1y = p1y + (p2y - p0y) / 6;
    const c2x = p2x - (p3x - p1x) / 6;
    const c2y = p2y - (p3y - p1y) / 6;
    lineCmds.push(`C ${c1x},${c1y} ${c2x},${c2y} ${p2x},${p2y}`);
  }
  const line = lineCmds.join(" ");
  const fill = `${line} L ${xs[xs.length - 1]},${pad + h} L ${xs[0]},${pad + h} Z`;

  return {
    line,
    fill,
    endPoint: { x: xs[xs.length - 1], y: ys[ys.length - 1] },
  };
}
