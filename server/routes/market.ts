import { Router } from "express";
import { getIndices, getMovers } from "../services/yahoo.js";
import { getMorningRead } from "../services/morningRead.js";
import { rateLimitByIp } from "../services/rateLimit.js";

export const marketRouter = Router();

marketRouter.get(
  "/overview",
  rateLimitByIp({ name: "market-overview", limit: 60, window: "1 m" }),
  async (_req, res) => {
    const indices = await getIndices();
    res.json(indices);
  }
);

marketRouter.get(
  "/movers",
  rateLimitByIp({ name: "market-movers", limit: 60, window: "1 m" }),
  async (_req, res) => {
    const movers = await getMovers();
    res.json(movers);
  }
);

marketRouter.get(
  "/morning-read",
  rateLimitByIp({ name: "market-morning-read", limit: 30, window: "1 m" }),
  async (_req, res) => {
    try {
      const read = await getMorningRead();
      res.json(read);
    } catch (err) {
      console.error("[market/morning-read]", err);
      res.status(500).json({ error: "Could not generate morning read" });
    }
  }
);
