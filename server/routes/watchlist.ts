import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import { watchlists } from "../../shared/schema.js";
import { requireAuth, currentUser } from "../auth.js";

export const watchlistRouter = Router();

watchlistRouter.use(requireAuth);

watchlistRouter.get("/", async (req, res) => {
  const user = currentUser(req)!;
  const rows = await db
    .select()
    .from(watchlists)
    .where(eq(watchlists.userId, user.id));
  res.json(rows);
});

watchlistRouter.post("/", async (req, res) => {
  const user = currentUser(req)!;
  const symbol = String(req.body?.symbol ?? "").toUpperCase().trim();
  if (!symbol) return res.status(400).json({ error: "Invalid symbol" });

  const [existing] = await db
    .select()
    .from(watchlists)
    .where(and(eq(watchlists.userId, user.id), eq(watchlists.symbol, symbol)));

  if (existing) return res.json(existing);

  const [inserted] = await db
    .insert(watchlists)
    .values({ userId: user.id, symbol })
    .returning();
  res.json(inserted);
});

watchlistRouter.delete("/:symbol", async (req, res) => {
  const user = currentUser(req)!;
  const symbol = req.params.symbol.toUpperCase();
  await db
    .delete(watchlists)
    .where(and(eq(watchlists.userId, user.id), eq(watchlists.symbol, symbol)));
  res.json({ ok: true });
});
