import { pgTable, serial, text, integer, real, timestamp, json } from "drizzle-orm/pg-core";
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

export const usersRelations = relations(users, ({ many }) => ({
  portfolios: many(portfolios),
  watchlists: many(watchlists),
  analysisHistory: many(analysisHistory),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Portfolio = typeof portfolios.$inferSelect;
export type Watchlist = typeof watchlists.$inferSelect;
export type AnalysisHistoryRow = typeof analysisHistory.$inferSelect;

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
};

export type MoversResponse = {
  gainers: StockQuote[];
  losers: StockQuote[];
};
