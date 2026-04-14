# StockAdvisor.ai

AI-powered swing trade analysis platform. Google OAuth, persistent portfolios, watchlists, analysis history, and a live market overview — all driven by Claude + Yahoo Finance.

## Stack

- **Frontend** — React + Vite + TypeScript, Tailwind, shadcn/ui-style components, wouter routing, TanStack React Query
- **Backend** — Express 5, TypeScript, Drizzle ORM, PostgreSQL
- **APIs** — Anthropic Claude (`claude-sonnet-4-20250514` with `web_search_20250305` beta tool), Yahoo Finance (`yahoo-finance2`)
- **Auth** — Passport.js + Google OAuth 2.0, sessions stored in Postgres via `connect-pg-simple`
- **Theme** — Dark only

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Database

You need a PostgreSQL instance. Options:

- Local: install Postgres, create a database.
- Hosted free: [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Railway](https://railway.app).

Grab the connection string (looks like `postgresql://user:pw@host:5432/dbname`).

### 3. Google OAuth credentials

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. **Create Credentials → OAuth client ID → Web application**.
3. Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
   (for production, add your deployed callback URL too).
4. Copy the Client ID and Client Secret.

### 4. Anthropic API key

Get one from [console.anthropic.com](https://console.anthropic.com/).

### 5. Environment file

Copy `.env.example` to `.env` and fill in every variable:

```
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=<generate a long random string>
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
```

### 6. Push the database schema

```bash
npm run db:push
```

This creates all tables (`users`, `portfolios`, `watchlists`, `analysis_history`) and the session table (auto-created on first auth).

### 7. Run dev servers

```bash
npm run dev
```

- Backend: http://localhost:3000
- Frontend: http://localhost:5173 (proxies `/api` to the backend)

Open http://localhost:5173.

## Production

```bash
npm run build
NODE_ENV=production npm start
```

In production the Express server serves the built client from `dist/client`. Behind a proxy/load balancer, make sure it forwards `X-Forwarded-Proto` — `app.set("trust proxy", 1)` is already enabled.

## Pages

| Route         | Purpose                                                       |
|---------------|---------------------------------------------------------------|
| `/`           | Market Overview (S&P 500, NASDAQ, DOW) + Top Gainers/Losers   |
| `/portfolio`  | Build a portfolio, run AI swing-trade analysis                |
| `/watchlist`  | Track stocks (requires sign-in)                               |
| `/history`    | Past analyses grouped by timestamp (requires sign-in)         |

Guest users can build a portfolio in `localStorage` and run analysis without signing in, but nothing is saved server-side.

## API

All routes under `/api` with `Cache-Control: no-cache`.

- `GET  /api/auth/google` — OAuth start
- `GET  /api/auth/google/callback` — OAuth callback
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `GET  /api/stocks/search?q=`
- `GET  /api/stocks/:symbol/quote`
- `GET  /api/market/overview`
- `GET  /api/market/movers`
- `GET|POST|DELETE /api/portfolio[/:symbol]` *(auth required)*
- `GET|POST|DELETE /api/watchlist[/:symbol]` *(auth required)*
- `GET  /api/analysis-history` *(auth required)*
- `POST /api/analysis/portfolio` — body `{ portfolio: [{ symbol, shares }] }`

## Disclaimer

Data is sourced from Yahoo Finance and may be delayed up to 15 minutes. AI output is for educational purposes only and is **not financial advice**.
