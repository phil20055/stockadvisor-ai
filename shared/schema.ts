import { pgTable, serial, text, integer, real, timestamp, json, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  googleId: text("google_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  shares: real("shares").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const watchlists = pgTable("watchlists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  listName: text("list_name").notNull().default("default"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const analysisHistory = pgTable("analysis_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  companyName: text("company_name").notNull(),
  analysisText: text("analysis_text").notNull(),
  recommendation: text("recommendation").notNull(),
  targetPrice: real("target_price"),
  riskLevel: text("risk_level"),
  confidence: text("confidence"),
  keyFactors: json("key_factors").$type<string[]>(),
  currentPrice: real("current_price"),
  analyzedAt: timestamp("analyzed_at").notNull().defaultNow(),
});

export const predictionOutcomes = pgTable("prediction_outcomes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  predictedAt: timestamp("predicted_at").notNull().defaultNow(),
  recommendation: text("recommendation").notNull(),
  targetPrice: real("target_price"),
  priceAtPrediction: real("price_at_prediction").notNull(),
  priceAfter3Days: real("price_after_3_days"),
  priceAfter7Days: real("price_after_7_days"),
  priceAfter14Days: real("price_after_14_days"),
  outcomeCorrect: boolean("outcome_correct"),
  outcomeNotes: text("outcome_notes"),
  checkedAt: timestamp("checked_at"),
});

export const systemInsights = pgTable("system_insights", {
  id: serial("id").primaryKey(),
  insightText: text("insight_text").notNull(),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  portfolios: many(portfolios),
  watchlists: many(watchlists),
  analysisHistory: many(analysisHistory),
  predictionOutcomes: many(predictionOutcomes),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Portfolio = typeof portfolios.$inferSelect;
export type Watchlist = typeof watchlists.$inferSelect;
export type AnalysisHistoryRow = typeof analysisHistory.$inferSelect;
export type PredictionOutcome = typeof predictionOutcomes.$inferSelect;
export type NewPredictionOutcome = typeof predictionOutcomes.$inferInsert;
export type SystemInsight = typeof systemInsights.$inferSelect;

export type StockQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  marketCap?: number;
  pe?: number;
  week52High?: number;
  week52Low?: number;
  open?: number;
  high?: number;
  low?: number;
  prevClose?: number;
};

export type StockNews = {
  id: number;
  headline: string;
  source: string;
  url: string;
  datetime: number; // unix seconds
  image?: string;
  summary?: string;
};

export type StockSearchResult = {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
};

export type AnalysisRecommendation = {
  symbol: string;
  name: string;
  recommendation: "Buy" | "Hold" | "Sell";
  confidence: "Low" | "Medium" | "High";
  reasoning: string;
  keyFactors: string[];
  riskLevel: "Low" | "Medium" | "High";
  targetPrice: number | null;
  currentPrice: number;
  change: number;
  changePercent: number;
};

export type PortfolioAnalysis = {
  summary: string;
  totalValue: number;
  recommendations: AnalysisRecommendation[];
};

export type MarketIndex = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open?: number;
  high?: number;
  low?: number;
  prevClose?: number;
};

export type MoversResponse = {
  gainers: StockQuote[];
  losers: StockQuote[];
};

export type MorningRead = {
  date: string;
  generatedAt: number;
  headline: string;
  body: string;
  watchlist: string[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PredictionStatus = "pending" | "correct" | "incorrect";

export type TrackRecordEntry = {
  id: number;
  symbol: string;
  predictedAt: string;
  recommendation: string;
  targetPrice: number | null;
  priceAtPrediction: number;
  priceAfter3Days: number | null;
  priceAfter7Days: number | null;
  priceAfter14Days: number | null;
  outcomeCorrect: boolean | null;
  outcomeNotes: string | null;
  status: PredictionStatus;
  daysSince: number;
};

export type AccuracyByType = {
  recommendation: string;
  total: number;
  correct: number;
  accuracy: number;
};

export type AccuracyPoint = {
  date: string;       // YYYY-MM-DD
  accuracy: number;   // 0-100
  sample: number;     // count of predictions in window
};

export type UserTrackRecord = {
  total: number;
  resolved: number;
  pending: number;
  correct: number;
  incorrect: number;
  accuracyPct: number;
  buyAvgReturnPct: number;
  byType: AccuracyByType[];
  bestCall: TrackRecordEntry | null;
  worstCall: TrackRecordEntry | null;
  rolling30: AccuracyPoint[];
  entries: TrackRecordEntry[];
};

export type SystemTrackRecord = {
  total: number;
  resolved: number;
  accuracyPct: number;
  buyAvgReturnPct: number;
  recentCorrect: TrackRecordEntry[];
  recentIncorrect: TrackRecordEntry[];
  patterns: string | null;
  patternsGeneratedAt: string | null;
};

export type CallOutcome = "win" | "loss" | "neutral" | "open";

export type TrackedCall = {
  id: number;
  symbol: string;
  companyName: string;
  recommendation: string;
  riskLevel: string | null;
  confidence: string | null;
  targetPrice: number | null;
  priceAtCall: number | null;
  priceNow: number | null;
  changeSince: number | null;
  changeSincePercent: number | null;
  outcome: CallOutcome;
  hitTarget: boolean;
  daysSince: number;
  analyzedAt: string;
  analysisText: string;
};

export type TrackRecord = {
  summary: {
    total: number;
    settled: number;
    wins: number;
    losses: number;
    hitRate: number; // percent
    avgReturnPct: number;
    bestCall: TrackedCall | null;
    worstCall: TrackedCall | null;
  };
  calls: TrackedCall[];
};
