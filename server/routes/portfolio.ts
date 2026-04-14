import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import { portfolios } from "../../shared/schema.js";
import { requireAuth, currentUser } from "../auth.js";

export const portfolioRouter = Router();

portfolioRouter.use(requireAuth);

portfolioRouter.get("/", async (req, res) => {
  const user = currentUser(req)!;
  const rows = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, user.id));
  res.json(rows);
});

portfolioRouter.post("/", async (req, res) => {
  const user = currentUser(req)!;
  const symbol = String(req.body?.symbol ?? "").toUpperCase().trim();
  const shares = Number(req.body?.shares);

  if (!symbol || !Number.isFinite(shares) || shares <= 0) {
    return res.status(400).json({ error: "Invalid symbol or shares" });
  }

  const [existing] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.userId, user.id), eq(portfolios.symbol, symbol)));

  if (existing) {
    const [updated] = await db
      .update(portfolios)
      .set({ shares })
      .where(eq(portfolios.id, existing.id))
      .returning();
    return res.json(updated);
  }

  const [inserted] = await db
    .insert(portfolios)
    .values({ userId: user.id, symbol, shares })
    .returning();
  res.json(inserted);
});

portfolioRouter.delete("/:symbol", async (req, res) => {
  const user = currentUser(req)!;
  const symbol = req.params.symbol.toUpperCase();
  await db
    .delete(portfolios)
    .where(and(eq(portfolios.userId, user.id), eq(portfolios.symbol, symbol)));
  res.json({ ok: true });
});
