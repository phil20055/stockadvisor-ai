import { Router } from "express";
import passport from "passport";
import { currentUser } from "../auth.js";
import { rateLimit, rateLimitByIp } from "../services/rateLimit.js";

export const authRouter = Router();

authRouter.get(
  "/google",
  rateLimitByIp({ name: "auth-google-start", limit: 20, window: "1 m" }),
  passport.authenticate("google", { scope: ["profile", "email"] })
);

authRouter.get(
  "/google/callback",
  rateLimitByIp({ name: "auth-google-callback", limit: 30, window: "1 m" }),
  passport.authenticate("google", { failureRedirect: "/?auth=failed" }),
  (_req, res) => {
    res.redirect("/");
  }
);

authRouter.post(
  "/logout",
  rateLimitByIp({ name: "auth-logout", limit: 20, window: "1 m" }),
  (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ ok: true });
      });
    });
  }
);

// /me is called by the frontend on most page loads to check session state.
// Keep the cap generous so normal navigation never trips it. Bucket falls
// back to IP for unauthed requests (which is the whole point of this route).
authRouter.get(
  "/me",
  rateLimit({ name: "auth-me", limit: 120, window: "1 m" }),
  (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    });
  }
);
