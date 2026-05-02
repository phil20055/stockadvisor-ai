import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  showWord?: boolean;
};

export function Logo({ className, showWord = true }: Props) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Mark />
      {showWord && (
        <span className="font-display text-lg font-semibold tracking-tight text-foreground">
          Market <span className="text-sage">Sage</span>
        </span>
      )}
    </div>
  );
}

export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-8 w-8 shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="sage-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(145 35% 55%)" />
          <stop offset="100%" stopColor="hsl(145 30% 38%)" />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill="hsl(200 18% 11%)"
        stroke="hsl(145 25% 28%)"
        strokeWidth="1"
      />
      <path
        d="M7 22 L12 16 L16 19 L24 9"
        stroke="url(#sage-grad)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="24" cy="9" r="2.2" fill="hsl(38 75% 62%)" />
      <path
        d="M7 22 L12 16 L16 19 L24 9"
        stroke="hsl(145 50% 70% / 0.4)"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
