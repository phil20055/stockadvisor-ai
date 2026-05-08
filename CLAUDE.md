# Project rules

**Read [SECURITY.md](./SECURITY.md) and follow it for everything in this project.**

Apply the full ruleset (this is a real deployment, not a prototype). Specifically:

1. **Before writing any new endpoint**, walk through this order and tell me what I'm getting in the response: auth check → authorization check → input validation → rate limiting → business logic → error handling. Authorization happens *before* any database read, file access, or external API call.
2. **Every new third-party API key**, ask whether it's secret or publishable and wire it accordingly.
3. **Every database query** uses Drizzle / parameterized queries — never string concatenation.
4. **Every finished feature** ends with a quick OWASP Top 10 self-review and a flagged list of anything missing.
5. **Push back** on insecure requests (disable CORS, hardcode key, skip auth, etc.) and propose a safe alternative.
6. **Ask** when uncertain whether something is safe.

## When I say "security audit"

Run the audit checklist in SECURITY.md and report ✅/❌ with prioritized fixes.

## Project context

- Stack: React + Vite + TypeScript (client), Express 5 + TypeScript + Drizzle (server), PostgreSQL on Neon, Railway hosting
- Auth: Passport + Google OAuth, sessions in Postgres via `connect-pg-simple`
- External APIs: Anthropic Claude (with web search), Finnhub, Alpha Vantage
- Real users (not just dev) — apply full security rules.
