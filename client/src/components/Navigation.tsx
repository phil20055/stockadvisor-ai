import { Link, useLocation } from "wouter";
import { BarChart3, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/history", label: "History" },
];

export function Navigation() {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    qc.setQueryData(["auth", "me"], null);
    qc.invalidateQueries();
  };

  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <nav className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/">
          <a className="flex items-center gap-2 font-semibold">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <BarChart3 className="h-4 w-4" />
            </div>
            <span className="tracking-tight">
              StockAdvisor<span className="text-primary">.ai</span>
            </span>
          </a>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = location === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <a
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {link.label}
                </a>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated && user ? (
            <>
              <div className="hidden items-center gap-2 sm:flex">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt=""
                    className="h-7 w-7 rounded-full border border-border/50"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold">
                    {firstName[0]?.toUpperCase()}
                  </div>
                )}
                <span className="text-sm">{firstName}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <a href="/api/auth/google">Sign in</a>
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-t border-border/50 px-4 py-1.5 md:hidden">
        {NAV_LINKS.map((link) => {
          const active = location === link.href;
          return (
            <Link key={link.href} href={link.href}>
              <a
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground"
                )}
              >
                {link.label}
              </a>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
