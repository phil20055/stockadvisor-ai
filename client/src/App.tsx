import { Route, Switch } from "wouter";
import { Navigation } from "./components/Navigation";
import { HomePage } from "./pages/Home";
import { PortfolioPage } from "./pages/Portfolio";
import { WatchlistPage } from "./pages/Watchlist";
import { HistoryPage } from "./pages/History";

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/portfolio" component={PortfolioPage} />
          <Route path="/watchlist" component={WatchlistPage} />
          <Route path="/history" component={HistoryPage} />
          <Route>
            <div className="py-20 text-center text-muted-foreground">
              Page not found
            </div>
          </Route>
        </Switch>
      </main>
      <footer className="border-t border-border/30 py-6 text-center text-xs text-muted-foreground">
        Market Sage · Built with Claude · Quotes via Finnhub
      </footer>
    </div>
  );
}
