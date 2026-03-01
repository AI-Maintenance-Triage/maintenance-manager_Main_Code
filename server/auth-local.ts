/**
 * Custom email/password authentication routes.
 * Sits alongside the existing Manus OAuth flow.
 * Local users get a JWT session cookie identical to OAuth users,
 * so the rest of the app (tRPC context, protectedProcedure, etc.) works unchanged.
 */
import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import * as db from "./db";
import * as emailService from "./email";

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

      // Send welcome email (fire-and-forget — don't block response)
      if (user.email) {
        emailService.sendWelcomeEmail({
          to: user.email,
          name: user.name ?? "there",
          role: user.role ?? "company_admin",
        }).catch(err => console.error("[Email] Welcome email failed:", err));
      }

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

  // ─── Forgot Password ──────────────────────────────────────────────────
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email, origin } = req.body;
      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const user = await db.getUserByEmail(normalizedEmail);
      // Always return success to prevent email enumeration
      if (!user || !user.passwordHash) {
        res.json({ success: true });
        return;
      }
      // Generate a secure random token (hex, 64 chars)
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.setPasswordResetToken(user.id, token, expiresAt);
      // Build reset URL using the frontend origin
      const appOrigin = origin || req.headers.origin || "http://localhost:3000";
      const resetUrl = `${appOrigin}/reset-password?token=${token}`;
      // Send email (fire-and-forget)
      emailService.sendPasswordResetEmail({
        to: user.email!,
        name: user.name ?? "there",
        resetUrl,
      }).catch(err => console.error("[Email] Password reset email failed:", err));
      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Forgot password failed:", error);
      res.status(500).json({ error: "Failed to process request. Please try again." });
    }
  });

  // ─── Reset Password ───────────────────────────────────────────────────
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        res.status(400).json({ error: "Token and new password are required" });
        return;
      }
      if (typeof password !== "string" || password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters" });
        return;
      }
      const user = await db.getUserByResetToken(token);
      if (!user || !user.resetPasswordExpiry) {
        res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
        return;
      }
      // Check expiry
      if (new Date() > user.resetPasswordExpiry) {
        await db.clearPasswordResetToken(user.id);
        res.status(400).json({ error: "This reset link has expired. Please request a new one." });
        return;
      }
      // Hash new password and update
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      await db.updateUserRole(user.id, user.role as "user" | "admin" | "company_admin" | "contractor");
      // Update password directly
      const dbConn = await db.getDb();
      if (dbConn) {
        const { eq } = await import("drizzle-orm");
        const { users } = await import("../drizzle/schema");
        await dbConn.update(users).set({ passwordHash }).where(eq(users.id, user.id));
      }
      await db.clearPasswordResetToken(user.id);
      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Reset password failed:", error);
      res.status(500).json({ error: "Failed to reset password. Please try again." });
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
