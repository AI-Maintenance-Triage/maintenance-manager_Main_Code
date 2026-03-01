/**
 * Custom email/password authentication routes.
 * Sits alongside the existing Manus OAuth flow.
 * Local users get a JWT session cookie identical to OAuth users,
 * so the rest of the app (tRPC context, protectedProcedure, etc.) works unchanged.
 */
import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import * as db from "./db";

const SALT_ROUNDS = 12;

function getSecretKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

async function createLocalSessionToken(user: { openId: string; name: string | null }) {
  const secretKey = getSecretKey();
  const expirationSeconds = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
  return new SignJWT({
    openId: user.openId,
    appId: ENV.appId,
    name: user.name || "",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

export function registerLocalAuthRoutes(app: Express) {
  // ─── Register ─────────────────────────────────────────────────────────
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        res.status(400).json({ error: "Name, email, and password are required" });
        return;
      }

      if (typeof password !== "string" || password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters" });
        return;
      }

      // Normalize email
      const normalizedEmail = email.trim().toLowerCase();

      // Check if email already exists
      const existing = await db.getUserByEmail(normalizedEmail);
      if (existing) {
        res.status(409).json({ error: "An account with this email already exists. Please sign in instead." });
        return;
      }

      // Hash password and create user
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const userId = await db.createLocalUser({
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
      });

      // Fetch the created user to get the openId
      const user = await db.getUserById(userId);
      if (!user) {
        res.status(500).json({ error: "Failed to create account" });
        return;
      }

      // Create session token and set cookie
      const sessionToken = await createLocalSessionToken(user);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("[Auth] Registration failed:", error);
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  });

  // ─── Login ────────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = await db.getUserByEmail(normalizedEmail);

      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Update last signed in
      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });

      // Create session token and set cookie
      const sessionToken = await createLocalSessionToken(user);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("[Auth] Login failed:", error);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });
}
