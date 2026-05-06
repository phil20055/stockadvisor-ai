import { Router } from "express";
import { requireAuth, currentUser } from "../auth.js";
import { getSystemTrackRecord, getUserTrackRecord } from "../services/trackRecord.js";

export const trackRecordRouter = Router();

trackRecordRouter.get("/", requireAuth, async (req, res) => {
  const user = currentUser(req)!;
  try {
    const record = await getUserTrackRecord(user.id);
    res.json(record);
  } catch (err) {
    console.error("[track-record]", err);
    res.status(500).json({ error: "Failed to load track record" });
  }
});

// Public — used internally for prompt enrichment, but exposed so a future
// page could show "the system's overall performance".
trackRecordRouter.get("/system", async (_req, res) => {
  try {
    const record = await getSystemTrackRecord(50);
    res.json(record);
  } catch (err) {
    console.error("[track-record:system]", err);
    res.status(500).json({ error: "Failed to load system track record" });
  }
});
