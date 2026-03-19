/**
 * test-setup.ts
 * HTTP endpoint for E2E test setup — creates/ensures test accounts exist.
 *
 * ONLY registered when TEST_SETUP_SECRET env var is set.
 * Protected by X-Test-Setup-Secret header to prevent misuse.
 *
 * Creates:
 *  - admin@example.com (role: admin)
 *  - testcompany@example.com (role: company_admin, with company profile)
 *  - testcontractor@example.com (role: contractor, with contractor profile)
 */
import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getDb } from "./db";
import {
  users,
  companies,
  contractorProfiles,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 12;

const TEST_ACCOUNTS = [
  {
    name: "Test Admin",
    email: "admin@example.com",
    password: "TestAdmin123!",
    role: "admin" as const,
  },
  {
    name: "Test Company",
    email: "testcompany@example.com",
    password: "TestCompany123!",
    role: "company_admin" as const,
  },
  {
    name: "Test Contractor",
    email: "testcontractor@example.com",
    password: "TestContractor123!",
    role: "contractor" as const,
  },
];

export function registerTestSetupRoute(app: Express) {
  const secret = process.env.TEST_SETUP_SECRET;
  if (!secret) {
    // Don't register the route if no secret is configured
    return;
  }

  app.post("/api/test-setup", async (req: Request, res: Response) => {
    // Verify secret
    const provided = req.headers["x-test-setup-secret"];
    if (!provided || provided !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const results: Record<string, string> = {};

    try {
      for (const account of TEST_ACCOUNTS) {
        const normalizedEmail = account.email.toLowerCase();

        // Check if user already exists
        const [existing] = await db
          .select({ id: users.id, emailVerified: users.emailVerified })
          .from(users)
          .where(eq(users.email, normalizedEmail))
          .limit(1);

        if (existing) {
          // Ensure account is verified and has the right password
          const passwordHash = await bcrypt.hash(account.password, SALT_ROUNDS);
          await db
            .update(users)
            .set({
              passwordHash,
              emailVerified: true,
              emailVerificationCode: null,
            })
            .where(eq(users.id, existing.id));
          results[account.email] = "updated";
        } else {
          // Create new user
          const openId = `test-${account.role}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const passwordHash = await bcrypt.hash(account.password, SALT_ROUNDS);

          const [inserted] = await db
            .insert(users)
            .values({
              openId,
              name: account.name,
              email: normalizedEmail,
              passwordHash,
              role: account.role,
              emailVerified: true,
            })
            .$returningId();

          const userId = inserted.id;

          // Create associated profiles
          if (account.role === "company_admin") {
            // Create a test company
            const [companyInserted] = await db
              .insert(companies)
              .values({
                name: "Test Property Management Co.",
                email: normalizedEmail,
                subscriptionTier: "professional",
                subscriptionStatus: "active",
                planStatus: "active",
              })
              .$returningId();

            // Link user to company
            await db
              .update(users)
              .set({ companyId: companyInserted.id })
              .where(eq(users.id, userId));
          } else if (account.role === "contractor") {
            // Create a test contractor profile
            await db.insert(contractorProfiles).values({
              userId,
              businessName: "Test Contractor Services",
              phone: "555-0100",
              trades: ["plumbing", "electrical"],
              serviceAreaZips: ["90210"],
              serviceRadiusMiles: 25,
              isAvailable: true,
              planStatus: "active",
            });
          }

          results[account.email] = "created";
        }
      }

      return res.json({ ok: true, results });
    } catch (err) {
      console.error("[test-setup] Error:", err);
      return res.status(500).json({ error: "Setup failed", details: String(err) });
    }
  });

  console.log("[test-setup] Test setup endpoint registered at POST /api/test-setup");
}
