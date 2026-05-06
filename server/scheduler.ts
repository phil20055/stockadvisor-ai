import cron from "node-cron";
import { backfillFromAnalysisHistory, checkPendingOutcomes } from "./services/trackRecord.js";
import { regenerateSystemInsights } from "./services/systemInsights.js";

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  // Backfill old analyses → prediction_outcomes once at boot.
  backfillFromAnalysisHistory()
    .then((n) => {
      if (n > 0) console.log(`[scheduler] backfilled ${n} predictions from analysis_history`);
    })
    .catch((err) => console.error("[scheduler] backfill error:", err));

  // Run an outcome check shortly after boot, then on a 6-hour cron.
  setTimeout(() => {
    runOutcomeCheck("boot");
  }, 15_000);

  // Every 6 hours at minute 5.
  cron.schedule("5 */6 * * *", () => runOutcomeCheck("cron"));

  // Weekly insight regen — Sundays at 04:30 ET (which is ~09:30 UTC).
  cron.schedule(
    "30 4 * * 0",
    () => {
      regenerateSystemInsights()
        .then((r) => console.log("[scheduler] insights:", r))
        .catch((err) => console.error("[scheduler] insights error:", err));
    },
    { timezone: "America/New_York" }
  );

  console.log("[scheduler] cron jobs registered");
}

async function runOutcomeCheck(label: string) {
  try {
    const res = await checkPendingOutcomes();
    if (res.scanned > 0 || res.updated > 0) {
      console.log(`[scheduler:${label}] outcome check`, res);
    }
  } catch (err) {
    console.error(`[scheduler:${label}] error:`, err);
  }
}
