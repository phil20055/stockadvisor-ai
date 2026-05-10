import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import type { Request, Response, NextFunction } from "express";
import { fireAbuseAlert } from "./abuse.js";

// ---------------------------------------------------------------------------
// Upstash client (lazy, server-side only)
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;
let _redisInitTried = false;

export function getRedis(): Redis | null {
  if (_redisInitTried) return _redis;
  _redisInitTried = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[rateLimit] Upstash env not set in production — limiter will fail closed");
    } else {
      console.warn("[rateLimit] Upstash env not set in dev — limiter will pass through");
    }
    return null;
  }
  _redis = new Redis({ url, token });
  return _redis;
}

function failClosedInProd(): boolean {
  // Default to closed in production unless explicitly opened.
  const mode = process.env.RATE_LIMIT_FAIL_MODE;
  if (mode === "open") return false;
  if (mode === "closed") return true;
  return process.env.NODE_ENV === "production";
}

// ---------------------------------------------------------------------------
// Limiter factory
// ---------------------------------------------------------------------------

type LimiterDef = {
  /** stable id used for Upstash key prefix and abuse-alert dedup */
  name: string;
  /** sliding window count */
  limit: number;
  /** sliding window duration */
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  /** how to derive the key — defaults to user id, falling back to ip */
  keyFn?: (req: Request) => string;
};

const limiterCache = new Map<string, Ratelimit>();

function buildLimiter(def: LimiterDef): Ratelimit | null {
  const cached = limiterCache.get(def.name);
  if (cached) return cached;
  const redis = getRedis();
  if (!redis) return null;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(def.limit, def.window),
    prefix: `rl:${def.name}`,
    analytics: false,
  });
  limiterCache.set(def.name, limiter);
  return limiter;
}

function userIdOrIp(req: Request): string {
  const u = (req as any).user;
  if (u && typeof u.id === "number") return `u:${u.id}`;
  return `ip:${req.ip ?? "unknown"}`;
}

function ipOnly(req: Request): string {
  return `ip:${req.ip ?? "unknown"}`;
}

function userOnly(req: Request): string {
  const u = (req as any).user;
  if (u && typeof u.id === "number") return `u:${u.id}`;
  // Should never hit this for auth-required routes, but if it does we fall
  // back to IP rather than letting unauthenticated traffic share a single key.
  return `ip:${req.ip ?? "unknown"}`;
}

// Anonymize IPv4 last octet for log lines (keep IPv6 unchanged for brevity).
function anonIp(ip: string | undefined): string {
  if (!ip) return "unknown";
  const m = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  return m ? `${m[1]}.x` : ip;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function rateLimit(...defs: LimiterDef[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const redis = getRedis();
    if (!redis) {
      if (failClosedInProd()) {
        return res
          .status(503)
          .json({ error: "Rate limiter unavailable. Try again shortly." });
      }
      // dev / fail-open: allow through
      return next();
    }

    let limited: { name: string; remaining: number; reset: number } | null = null;
    let mostRestrictiveReset = 0;

    for (const def of defs) {
      const limiter = buildLimiter(def);
      if (!limiter) {
        // Could not build (Redis vanished mid-request). Apply policy.
        if (failClosedInProd()) {
          return res.status(503).json({ error: "Rate limiter unavailable" });
        }
        return next();
      }
      const key = (def.keyFn ?? userIdOrIp)(req);
      try {
        const result = await limiter.limit(key);
        if (!result.success) {
          limited = { name: def.name, remaining: result.remaining, reset: result.reset };
          mostRestrictiveReset = Math.max(mostRestrictiveReset, result.reset);
          break;
        }
      } catch (err) {
        console.error(
          `[rateLimit] redis error endpoint=${req.path} limiter=${def.name}: ${(err as Error).message}`
        );
        if (failClosedInProd()) {
          return res.status(503).json({ error: "Rate limiter unavailable" });
        }
        return next();
      }
    }

    if (limited) {
      const userKey = userIdOrIp(req);
      console.warn(
        `[rateLimit] 429 endpoint=${req.path} limiter=${limited.name} key=${userKey} ip=${anonIp(req.ip)}`
      );
      // Fire-and-forget abuse counter (won't block the response).
      void fireAbuseAlert(userKey, req.path).catch(() => {});
      res.setHeader(
        "Retry-After",
        Math.max(1, Math.ceil((limited.reset - Date.now()) / 1000)).toString()
      );
      return res
        .status(429)
        .json({ error: "Rate limit exceeded. Please slow down." });
    }
    next();
  };
}

// Convenience helpers used by the routes
export const rateLimitByUser = (def: Omit<LimiterDef, "keyFn">) =>
  rateLimit({ ...def, keyFn: userOnly });
export const rateLimitByIp = (def: Omit<LimiterDef, "keyFn">) =>
  rateLimit({ ...def, keyFn: ipOnly });
