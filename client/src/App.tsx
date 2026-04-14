import { Route, Switch } from "wouter";
import { Navigation } from "./components/Navigation";
import { HomePage } from "./pages/Home";
import { PortfolioPage } from "./pages/Portfolio";
import { WatchlistPage } from "./pages/Watchlist";
import { HistoryPage } from "./pages/History";

export default function App() {
  return (
    <div className="min-h-screen">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/portfolio" component={PortfolioPage} />
          <Route path="/watchlist" component={WatchlistPage} />
          <Route path="/history" component={HistoryPage} />
          <Route>
            <div className="py-20 text-center text-muted-foreground">Page not found</div>
          </Route>
        </Switch>
      </main>
    </div>
  );
}
