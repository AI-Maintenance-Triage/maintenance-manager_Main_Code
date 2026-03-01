import type { Express, Request, Response } from "express";
import express from "express";
import { stripe } from "./stripe";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { transactions, maintenanceRequests, companies, contractorProfiles, subscriptionPlans } from "../drizzle/schema";
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

        case "checkout.session.completed": {
          const session = event.data.object as {
            id: string;
            metadata?: Record<string, string>;
            subscription?: string;
            customer?: string;
          };
          const entityType = session.metadata?.entity_type ?? "company";
          const companyId = session.metadata?.company_id ? parseInt(session.metadata.company_id) : null;
          const contractorProfileId = session.metadata?.contractor_profile_id ? parseInt(session.metadata.contractor_profile_id) : null;
          const planId = session.metadata?.plan_id ? parseInt(session.metadata.plan_id) : null;

          if (planId) {
            const db = await getDb();
            if (db) {
              const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
              if (plans.length > 0) {
                if (entityType === "contractor" && contractorProfileId) {
                  await db.update(contractorProfiles).set({
                    planId,
                    planStatus: "active",
                    planAssignedAt: Date.now(),
                    planExpiresAt: null,
                    stripeSubscriptionId: session.subscription ?? null,
                  }).where(eq(contractorProfiles.id, contractorProfileId));
                  console.log(`[Stripe Webhook] Plan ${planId} assigned to contractor profile ${contractorProfileId} via checkout`);
                } else if (companyId) {
                  await db.update(companies).set({
                    planId,
                    planStatus: "active",
                    planAssignedAt: Date.now(),
                    planExpiresAt: null,
                    stripeSubscriptionId: session.subscription ?? null,
                  }).where(eq(companies.id, companyId));
                  console.log(`[Stripe Webhook] Plan ${planId} assigned to company ${companyId} via checkout`);
                }
              }
            }
          }
          break;
        }

        case "customer.subscription.updated": {
          const sub = event.data.object as {
            id: string;
            status: string;
            current_period_end?: number;
            cancel_at_period_end?: boolean;
            metadata?: Record<string, string>;
            customer?: string;
          };
          const db = await getDb();
          if (db) {
            let planStatus: "active" | "trialing" | "expired" | "canceled" = "active";
            if (sub.status === "active") planStatus = "active";
            else if (sub.status === "trialing") planStatus = "trialing";
            else if (sub.status === "canceled" || sub.cancel_at_period_end) planStatus = "canceled";
            else if (["past_due", "unpaid", "incomplete_expired"].includes(sub.status)) planStatus = "expired";
            const expiresAt = sub.current_period_end ? sub.current_period_end * 1000 : null;

            // Try company first
            const companyRows = await db.select().from(companies).where(eq(companies.stripeSubscriptionId, sub.id)).limit(1);
            if (companyRows.length > 0) {
              await db.update(companies).set({ planStatus, planExpiresAt: expiresAt }).where(eq(companies.id, companyRows[0].id));
              console.log(`[Stripe Webhook] Company subscription ${sub.id} updated → ${planStatus}`);
            } else {
              // Try contractor
              const contractorRows = await db.select().from(contractorProfiles).where(eq(contractorProfiles.stripeSubscriptionId, sub.id)).limit(1);
              if (contractorRows.length > 0) {
                await db.update(contractorProfiles).set({ planStatus, planExpiresAt: expiresAt }).where(eq(contractorProfiles.id, contractorRows[0].id));
                console.log(`[Stripe Webhook] Contractor subscription ${sub.id} updated → ${planStatus}`);
              }
            }
          }
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as { id: string; current_period_end?: number };
          const db = await getDb();
          if (db) {
            const expiresAt = sub.current_period_end ? sub.current_period_end * 1000 : Date.now();
            const companyRows = await db.select().from(companies).where(eq(companies.stripeSubscriptionId, sub.id)).limit(1);
            if (companyRows.length > 0) {
              await db.update(companies).set({ planStatus: "expired", planExpiresAt: expiresAt }).where(eq(companies.id, companyRows[0].id));
              console.log(`[Stripe Webhook] Company subscription ${sub.id} deleted → expired`);
            } else {
              const contractorRows = await db.select().from(contractorProfiles).where(eq(contractorProfiles.stripeSubscriptionId, sub.id)).limit(1);
              if (contractorRows.length > 0) {
                await db.update(contractorProfiles).set({ planStatus: "expired", planExpiresAt: expiresAt }).where(eq(contractorProfiles.id, contractorRows[0].id));
                console.log(`[Stripe Webhook] Contractor subscription ${sub.id} deleted → expired`);
              }
            }
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as { subscription?: string };
          if (invoice.subscription) {
            const db = await getDb();
            if (db) {
              const companyRows = await db.select().from(companies).where(eq(companies.stripeSubscriptionId, invoice.subscription)).limit(1);
              if (companyRows.length > 0) {
                await db.update(companies).set({ planStatus: "expired" }).where(eq(companies.id, companyRows[0].id));
                console.log(`[Stripe Webhook] Invoice payment failed → company ${companyRows[0].id} plan expired`);
              } else {
                const contractorRows = await db.select().from(contractorProfiles).where(eq(contractorProfiles.stripeSubscriptionId, invoice.subscription)).limit(1);
                if (contractorRows.length > 0) {
                  await db.update(contractorProfiles).set({ planStatus: "expired" }).where(eq(contractorProfiles.id, contractorRows[0].id));
                  console.log(`[Stripe Webhook] Invoice payment failed → contractor ${contractorRows[0].id} plan expired`);
                }
              }
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
          // Handle transfer events (not in Stripe SDK enum but valid webhook events)
          if ((event.type as string) === "transfer.paid" || (event.type as string) === "transfer.failed") {
            const transfer = (event as any).data.object as { id: string; metadata?: Record<string, string> };
            const jobId = transfer.metadata?.jobId ? parseInt(transfer.metadata.jobId) : null;
            if (jobId) {
              const db = await getDb();
              if (db) {
                const newStatus = (event.type as string) === "transfer.paid" ? "paid_out" : "failed";
                await db
                  .update(transactions)
                  .set({ status: newStatus })
                  .where(eq(transactions.stripeTransferId, transfer.id));
                console.log(`[Stripe Webhook] Transfer ${transfer.id} ${newStatus} for job ${jobId}`);
              }
            }
            break;
          }
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    }
  );
}
