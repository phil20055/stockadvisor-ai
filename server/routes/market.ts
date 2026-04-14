import { Router } from "express";
import { getIndices, getMovers } from "../services/yahoo.js";

export const marketRouter = Router();

marketRouter.get("/overview", async (_req, res) => {
  const indices = await getIndices();
  res.json(indices);
});

marketRouter.get("/movers", async (_req, res) => {
  const movers = await getMovers();
  res.json(movers);
});
