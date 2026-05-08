import { Router } from "express";
import { requireAuth, currentUser } from "../auth.js";
import { getSystemTrackRecord, getUserTrackRecord } from "../services/trackRecord.js";
import type { SystemStats, SystemRecentCalls } from "../../shared/schema.js";

export const trackRecordRouter = Router();

// Per-user track record. Auth required.
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

// Public: aggregate stats only. No per-call data — that's auth-only on
// /system/recent. Order matters: register the more specific path first
// so /system/recent isn't shadowed by /system.
trackRecordRouter.get("/system/recent", requireAuth, async (_req, res) => {
  try {
    const full = await getSystemTrackRecord(50);
    const recent: SystemRecentCalls = {
      recentCorrect: full.recentCorrect,
      recentIncorrect: full.recentIncorrect,
    };
    res.json(recent);
  } catch (err) {
    console.error("[track-record:system/recent]", err);
    res.status(500).json({ error: "Failed to load system entries" });
  }
});

trackRecordRouter.get("/system", async (_req, res) => {
  try {
    const full = await getSystemTrackRecord(50);
    const stats: SystemStats = {
      total: full.total,
      resolved: full.resolved,
      accuracyPct: full.accuracyPct,
      buyAvgReturnPct: full.buyAvgReturnPct,
      patterns: full.patterns,
      patternsGeneratedAt: full.patternsGeneratedAt,
    };
    res.json(stats);
  } catch (err) {
    console.error("[track-record:system]", err);
    res.status(500).json({ error: "Failed to load system track record" });
  }
});
