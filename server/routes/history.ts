import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { analysisHistory } from "../../shared/schema.js";
import { requireAuth, currentUser } from "../auth.js";

export const historyRouter = Router();

historyRouter.use(requireAuth);

historyRouter.get("/", async (req, res) => {
  const user = currentUser(req)!;
  const rows = await db
    .select()
    .from(analysisHistory)
    .where(eq(analysisHistory.userId, user.id))
    .orderBy(desc(analysisHistory.analyzedAt));
  res.json(rows);
});
