import { Router } from "express";
import passport from "passport";
import { currentUser } from "../auth.js";

export const authRouter = Router();

authRouter.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

authRouter.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/?auth=failed" }),
  (_req, res) => {
    res.redirect("/");
  }
);

authRouter.post("/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
});

authRouter.get("/me", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
  });
});
