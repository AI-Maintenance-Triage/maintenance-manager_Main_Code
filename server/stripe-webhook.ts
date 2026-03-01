import type { Express, Request, Response } from "express";
import express from "express";
import { stripe } from "./stripe";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { transactions, maintenanceRequests } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export function registerStripeWebhookRoute(app: Express) {
  // MUST use raw body for Stripe signature verification — register BEFORE express.json()
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;

      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          ENV.stripeWebhookSecret
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[Stripe Webhook] Signature verification failed:", message);
        return res.status(400).send(`Webhook Error: ${message}`);
      }

      // Handle test events
      if (event.id.startsWith("evt_test_")) {
        console.log("[Stripe Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }

      console.log(`[Stripe Webhook] Event: ${event.type} (${event.id})`);

      switch (event.type) {
        case "payment_intent.succeeded": {
          const pi = event.data.object as { id: string; metadata?: Record<string, string> };
          const jobId = pi.metadata?.jobId ? parseInt(pi.metadata.jobId) : null;
          if (jobId) {
            const db = await getDb();
            if (db) {
              // Update transaction status to captured
              await db
                .update(transactions)
                .set({ status: "captured" })
                .where(eq(transactions.stripePaymentIntentId, pi.id));

              // Update job to paid
              await db
                .update(maintenanceRequests)
                .set({ status: "paid", paidAt: new Date() })
                .where(eq(maintenanceRequests.id, jobId));

              console.log(`[Stripe Webhook] Job ${jobId} marked as paid`);
            }
          }
          break;
        }

        case "payment_intent.payment_failed": {
          const pi = event.data.object as { id: string; metadata?: Record<string, string> };
          const jobId = pi.metadata?.jobId ? parseInt(pi.metadata.jobId) : null;
          if (jobId) {
            const db = await getDb();
            if (db) {
              await db
                .update(transactions)
                .set({ status: "failed" })
                .where(eq(transactions.stripePaymentIntentId, pi.id));
              console.log(`[Stripe Webhook] Payment failed for job ${jobId}`);
            }
          }
          break;
        }

        case "account.updated": {
          // Contractor completed Stripe Connect onboarding
          const account = event.data.object as { id: string; charges_enabled?: boolean };
          if (account.charges_enabled) {
            const db = await getDb();
            if (db) {
              const { contractorProfiles } = await import("../drizzle/schema");
              await db
                .update(contractorProfiles)
                .set({ stripeOnboardingComplete: true })
                .where(eq(contractorProfiles.stripeAccountId, account.id));
              console.log(`[Stripe Webhook] Contractor ${account.id} onboarding complete`);
            }
          }
          break;
        }

        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    }
  );
}
