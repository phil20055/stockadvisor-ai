import { Router } from "express";
import { getIndices, getMovers } from "../services/yahoo.js";
import { getMorningRead } from "../services/morningRead.js";

export const marketRouter = Router();

marketRouter.get("/overview", async (_req, res) => {
  const indices = await getIndices();
  res.json(indices);
});

marketRouter.get("/movers", async (_req, res) => {
  const movers = await getMovers();
  res.json(movers);
});

marketRouter.get("/morning-read", async (_req, res) => {
  try {
    const read = await getMorningRead();
    res.json(read);
  } catch (err) {
    res.status(500).json({ error: "Could not generate morning read", detail: String((err as Error).message) });
  }
});
