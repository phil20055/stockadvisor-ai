import "dotenv/config";
import express from "express";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

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
app.use("/api/market", marketRouter);
app.use("/api/analysis", analysisRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(__dirname, "../client");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`[stockadvisor] server listening on http://localhost:${PORT}`);
});
