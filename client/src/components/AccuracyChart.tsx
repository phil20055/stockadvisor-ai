import { useId, useMemo } from "react";
import type { AccuracyPoint } from "@shared/schema";
import { cn } from "@/lib/utils";

type Props = {
  points: AccuracyPoint[];
  className?: string;
  height?: number;
};

export function AccuracyChart({ points, className, height = 160 }: Props) {
  const id = useId();
  const lineId = `${id}-line`;
  const fillId = `${id}-fill`;
  const glowId = `${id}-glow`;

  const path = useMemo(() => buildPath(points, 600, height), [points, height]);

  if (!path) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-border/50 bg-card/30 text-xs text-muted-foreground",
          className
        )}
        style={{ height }}
      >
        Need a few more resolved calls before we can plot a trend.
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 600 ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--sage))" stopOpacity="0.32" />
          <stop offset="100%" stopColor="hsl(var(--sage))" stopOpacity="0" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      {/* gridlines at 25/50/75 */}
      {[25, 50, 75].map((p) => {
        const y = height - (p / 100) * height + 0.5;
        return (
          <line
            key={p}
            x1="0"
            x2="600"
            y1={y}
            y2={y}
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
            strokeDasharray="2 4"
            opacity="0.4"
          />
        );
      })}

      {/* 50% reference line a little stronger */}
      <line
        x1="0"
        x2="600"
        y1={height - height / 2}
        y2={height - height / 2}
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="0.5"
        opacity="0.3"
      />

      <path d={path.fill} fill={`url(#${fillId})`} />

      {/* halo */}
      <path
        d={path.line}
        fill="none"
        stroke="hsl(var(--sage))"
        strokeOpacity="0.45"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      />
      <path
        id={lineId}
        d={path.line}
        fill="none"
        stroke="hsl(var(--sage))"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* end-of-line dot */}
      <circle cx={path.endPoint.x} cy={path.endPoint.y} r="2.6" fill="hsl(var(--sage))" />

      {/* axis labels */}
      <text x="4" y={height - 4} fontSize="9" fill="hsl(var(--muted-foreground))">
        0%
      </text>
      <text x="4" y={height / 2 - 2} fontSize="9" fill="hsl(var(--muted-foreground))">
        50%
      </text>
      <text x="4" y="10" fontSize="9" fill="hsl(var(--muted-foreground))">
        100%
      </text>
    </svg>
  );
}

function buildPath(points: AccuracyPoint[], width: number, height: number) {
  if (points.length < 2) return null;

  // Map to coordinates. y-axis is 0-100 fixed.
  const xs = points.map((_, i) => (i / (points.length - 1)) * width);
  const ys = points.map((p) => {
    const clamped = Math.max(0, Math.min(100, p.accuracy));
    return height - (clamped / 100) * height;
  });

  // Smooth via Catmull-Rom -> cubic bezier.
  const cmds: string[] = [`M ${xs[0]},${ys[0]}`];
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
    cmds.push(`C ${c1x},${c1y} ${c2x},${c2y} ${p2x},${p2y}`);
  }

  const line = cmds.join(" ");
  const fill = `${line} L ${xs[xs.length - 1]},${height} L ${xs[0]},${height} Z`;
  return {
    line,
    fill,
    endPoint: { x: xs[xs.length - 1], y: ys[ys.length - 1] },
  };
}
