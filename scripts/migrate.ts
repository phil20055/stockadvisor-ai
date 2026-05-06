import "../server/env.js";
import { pool } from "../server/db.js";

const SQL = `
CREATE TABLE IF NOT EXISTS prediction_outcomes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  predicted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  recommendation TEXT NOT NULL,
  target_price REAL,
  price_at_prediction REAL NOT NULL,
  price_after_3_days REAL,
  price_after_7_days REAL,
  price_after_14_days REAL,
  outcome_correct BOOLEAN,
  outcome_notes TEXT,
  checked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_user ON prediction_outcomes(user_id);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_predicted_at ON prediction_outcomes(predicted_at);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_outcome ON prediction_outcomes(outcome_correct);

CREATE TABLE IF NOT EXISTS system_insights (
  id SERIAL PRIMARY KEY,
  insight_text TEXT NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE prediction_outcomes
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'portfolio';

CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_source ON prediction_outcomes(source);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log("Running migration…");
    await client.query(SQL);
    console.log("Done.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
