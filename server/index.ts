import "./env.js";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupAuth } from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { stocksRouter } from "./routes/stocks.js";
import { portfolioRouter } from "./routes/portfolio.js";
import { watchlistRouter } from "./routes/watchlist.js";
import { historyRouter } from "./routes/history.js";
import { marketRouter } from "./routes/market.js";
import { analysisRouter } from "./routes/analysis.js";
import { trackRecordRouter } from "./routes/trackRecord.js";
import { startScheduler } from "./scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set("trust proxy", 1);

// Security headers. CSP is tuned for our specific stack:
// - script-src 'self': Vite bundles all JS into our origin, no third-party scripts.
// - style-src 'self' 'unsafe-inline': Tailwind ships inline <style> attributes
//   on many components (cva variants, dynamic classes); inline-style XSS is
//   substantially less dangerous than inline-script XSS.
// - font-src adds Google Fonts (Inter, Fraunces, JetBrains Mono).
// - img-src allows data: for inline SVG/icon URIs and https: for stock-news
//   thumbnails (Yahoo, Reuters, etc.) returned by Finnhub /company-news.
// - connect-src 'self' covers our /api routes; we never call third-party APIs
//   from the browser.
// - frame-ancestors 'none' blocks clickjacking.
const isProd = process.env.NODE_ENV === "production";
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "object-src": ["'none'"],
        "upgrade-insecure-requests": isProd ? [] : null,
      },
    },
    // HSTS only in production (would otherwise pin localhost to https).
    strictTransportSecurity: isProd
      ? { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true }
      : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    // require-corp would break cross-origin images (news thumbnails) — leave default.
    crossOriginEmbedderPolicy: false,
    // permissionsPolicy not in helmet 8 by default; set manually below.
  })
);
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()"
  );
  next();
});

app.use(express.json({ limit: "256kb" }));

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-cache");
  next();
});

setupAuth(app);

app.use("/api/auth", authRouter);
app.use("/api/stocks", stocksRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/api/watchlist", watchlistRouter);
app.use("/api/analysis-history", historyRouter);
app.use("/api/track-record", trackRecordRouter);
app.use("/api/market", marketRouter);
app.use("/api/analysis", analysisRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(__dirname, "../dist/client");
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`[market-sage] server listening on http://localhost:${PORT}`);
  startScheduler();
});
