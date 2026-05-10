import type { Request, Response, NextFunction } from "express";
import { getRedis } from "./rateLimit.js";
import { secondsUntilUtcMidnight } from "./abuse.js";

/**
 * 1 free analysis per IP per UTC day, shared across portfolio + deep-read.
 * Counter is keyed on IP only — a single guest can't get 1 of each by
 * hitting different endpoints.
 *
 * Behavior:
 *   - Authenticated user: pass through (auth gate handles them).
 *   - Guest, counter < 1: increment, allow.
 *   - Guest, counter >= 1: 401 with "sign in" hint.
 *   - Redis unavailable: fail closed (block guests entirely; authed
 *     traffic continues unaffected).
 */
export function guestOrAuth(req: Request, res: Response, next: NextFunction): void {
  // Authed users skip the guest path entirely.
  if (req.isAuthenticated?.() && (req as any).user) {
    return next();
  }

  void (async () => {
    const redis = getRedis();
    if (!redis) {
      // No Upstash — guest path disabled, requires sign-in.
      return res
        .status(401)
        .json({ error: "Sign in to run an analysis." });
    }

    const ip = req.ip ?? "unknown";
    const today = new Date().toISOString().slice(0, 10);
    const key = `guest:analysis:${ip}:${today}`;

    try {
      const count = (await redis.incr(key)) as number;
      if (count === 1) {
        await redis.expire(key, secondsUntilUtcMidnight());
      }
      if (count > 1) {
        // Already used today — undo the bump so they don't keep climbing.
        await redis.decr(key);
        return res.status(401).json({
          error:
            "Guest free read used for today. Sign in to keep going.",
          guestLimitReached: true,
        });
      }
    } catch (err) {
      console.error(`[guestCounter] redis error: ${(err as Error).message}`);
      return res.status(503).json({ error: "Service temporarily unavailable" });
    }

    next();
  })();
}
