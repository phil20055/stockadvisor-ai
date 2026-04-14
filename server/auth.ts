import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { eq } from "drizzle-orm";
import { db, pool } from "./db.js";
import { users, type User } from "../shared/schema.js";

const PgSession = connectPgSimple(session);

export function setupAuth(app: Express) {
  const isProd = process.env.NODE_ENV === "production";

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      done(null, user || null);
    } catch (err) {
      done(err as Error);
    }
  });

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${baseUrl}/api/auth/google/callback`,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const googleId = profile.id;
            const email = profile.emails?.[0]?.value ?? "";
            const name = profile.displayName || email;
            const avatar = profile.photos?.[0]?.value ?? null;

            const [existing] = await db
              .select()
              .from(users)
              .where(eq(users.googleId, googleId));

            if (existing) return done(null, existing);

            const [created] = await db
              .insert(users)
              .values({ googleId, email, name, avatar })
              .returning();

            done(null, created);
          } catch (err) {
            done(err as Error);
          }
        }
      )
    );
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated?.() && req.user) return next();
  res.status(401).json({ error: "Unauthorized" });
}

export function currentUser(req: Request): User | null {
  return (req.user as User) ?? null;
}
