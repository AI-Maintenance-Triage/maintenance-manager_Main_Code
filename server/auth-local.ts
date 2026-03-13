/**
 * Custom email/password authentication routes.
 * Sits alongside the existing Manus OAuth flow.
 * Local users get a JWT session cookie identical to OAuth users,
 * so the rest of the app (tRPC context, protectedProcedure, etc.) works unchanged.
 */
import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
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
    appId: ENV.appId || "local",
    name: user.name || "User",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

export function registerLocalAuthRoutes(app: Express) {
  // --- Register (step 1: create account + send verification code) -----------
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

      const normalizedEmail = email.trim().toLowerCase();

      const existing = await db.getUserByEmail(normalizedEmail);
      if (existing) {
        // If the existing user is unverified, allow resending the code
        if (!existing.emailVerified) {
          const code = String(Math.floor(100000 + Math.random() * 900000));
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
          await db.setEmailVerificationCode(existing.id, code, expiresAt);
          emailService.sendEmailVerificationCode({
            to: normalizedEmail,
            name: existing.name ?? "there",
            code,
          }).catch(err => console.error("[Email] Verification email failed:", err));
          res.json({ success: true, requiresVerification: true, userId: existing.id, email: normalizedEmail });
          return;
        }
        res.status(409).json({ error: "An account with this email already exists. Please sign in instead." });
        return;
      }

      // Hash password and create user (emailVerified defaults to false)
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const userId = await db.createLocalUser({
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
      });

      const user = await db.getUserById(userId);
      if (!user) {
        res.status(500).json({ error: "Failed to create account" });
        return;
      }

      // Generate 6-digit code, store it (expires 15 min), send email
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await db.setEmailVerificationCode(userId, code, expiresAt);
      emailService.sendEmailVerificationCode({
        to: normalizedEmail,
        name: name.trim(),
        code,
      }).catch(err => console.error("[Email] Verification email failed:", err));

      // Return userId — no session cookie yet; frontend shows verification screen
      res.json({ success: true, requiresVerification: true, userId: user.id, email: normalizedEmail });
    } catch (error) {
      console.error("[Auth] Registration failed:", error);
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  });

  // --- Verify Email (step 2: submit 6-digit code) ---------------------------
  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { userId, code } = req.body;
      if (!userId || !code) {
        res.status(400).json({ error: "userId and code are required" });
        return;
      }

      const result = await db.verifyEmailCode(Number(userId), String(code).trim());

      if (result === "invalid") {
        res.status(400).json({ error: "Invalid verification code. Please check and try again." });
        return;
      }
      if (result === "expired") {
        res.status(400).json({ error: "This code has expired. Please request a new one." });
        return;
      }

      // Code is valid -- create session
      const user = await db.getUserById(Number(userId));
      if (!user) {
        res.status(500).json({ error: "Account not found" });
        return;
      }

      // Send welcome email now that email is verified
      if (user.email) {
        emailService.sendWelcomeEmail({
          to: user.email,
          name: user.name ?? "there",
          role: user.role ?? "company_admin",
        }).catch(err => console.error("[Email] Welcome email failed:", err));
      }

      const sessionToken = await createLocalSessionToken(user);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    } catch (error) {
      console.error("[Auth] Email verification failed:", error);
      res.status(500).json({ error: "Verification failed. Please try again." });
    }
  });

  // --- Resend Verification Code ---------------------------------------------
  app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        res.status(400).json({ error: "userId is required" });
        return;
      }

      const user = await db.getUserById(Number(userId));
      if (!user || !user.email) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      if (user.emailVerified) {
        res.json({ success: true, alreadyVerified: true });
        return;
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await db.setEmailVerificationCode(user.id, code, expiresAt);
      emailService.sendEmailVerificationCode({
        to: user.email,
        name: user.name ?? "there",
        code,
      }).catch(err => console.error("[Email] Resend verification email failed:", err));

      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Resend verification failed:", error);
      res.status(500).json({ error: "Failed to resend code. Please try again." });
    }
  });

  // --- Forgot Password -------------------------------------------------------
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email, origin } = req.body;
      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const user = await db.getUserByEmail(normalizedEmail);
      if (!user || !user.passwordHash) {
        res.json({ success: true });
        return;
      }
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await db.setPasswordResetToken(user.id, token, expiresAt);
      const appOrigin = origin || req.headers.origin || "http://localhost:3000";
      const resetUrl = `${appOrigin}/reset-password?token=${token}`;
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

  // --- Reset Password --------------------------------------------------------
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
      if (new Date() > user.resetPasswordExpiry) {
        await db.clearPasswordResetToken(user.id);
        res.status(400).json({ error: "This reset link has expired. Please request a new one." });
        return;
      }
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      await db.updateUserRole(user.id, user.role as "user" | "admin" | "company_admin" | "contractor");
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

  // --- Login ----------------------------------------------------------------
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
      // If account is not yet email-verified:
      // - Admin accounts are always auto-verified on login (they predate the feature or were created by admin)
      // - Accounts created before email verification was introduced (no verification code ever set) are auto-verified
      // - Only newly self-registered accounts with a pending code are blocked
      if (!user.emailVerified) {
        const isAdmin = user.role === 'admin';
        const hasNeverBeenSentCode = !user.emailVerificationCode;
        if (isAdmin || hasNeverBeenSentCode) {
          // Auto-verify legacy accounts and admin accounts silently
          const dbConn = await db.getDb();
          if (dbConn) {
            const { eq } = await import("drizzle-orm");
            const { users } = await import("../drizzle/schema");
            await dbConn.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
          }
        } else {
          // Newly registered account with a pending verification code — require verification
          const code = String(Math.floor(100000 + Math.random() * 900000));
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
          await db.setEmailVerificationCode(user.id, code, expiresAt);
          if (user.email) {
            emailService.sendEmailVerificationCode({
              to: user.email,
              name: user.name ?? "there",
              code,
            }).catch(err => console.error("[Email] Verification email failed:", err));
          }
          res.status(403).json({ error: "Email not verified. A new verification code has been sent to your email.", requiresVerification: true, userId: user.id, email: user.email });
          return;
        }
      }
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      const sessionToken = await createLocalSessionToken(user);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    } catch (error) {
      console.error("[Auth] Login failed:", error);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });
}
