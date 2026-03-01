import Stripe from "stripe";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { platformSettings, companies, contractorProfiles } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Stripe client ─────────────────────────────────────────────────────────
export const stripe = new Stripe(ENV.stripeSecretKey, {
  apiVersion: "2026-02-25.clover",
});

// ─── Platform Settings helpers ─────────────────────────────────────────────
export async function getPlatformSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(platformSettings).limit(1);
  if (rows.length > 0) return rows[0];
  // Seed default row if none exists
  await db.insert(platformSettings).values({});
  const seeded = await db.select().from(platformSettings).limit(1);
  return seeded[0];
}

// ─── Contractor Connect onboarding ────────────────────────────────────────
export async function createContractorConnectAccount(email: string) {
  const account = await stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      transfers: { requested: true },
    },
  });
  return account;
}

export async function createContractorOnboardingLink(
  stripeAccountId: string,
  origin: string
) {
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${origin}/contractor/profile?stripe=refresh`,
    return_url: `${origin}/contractor/profile?stripe=success`,
    type: "account_onboarding",
  });
  return link.url;
}

// ─── Company customer + payment method setup ──────────────────────────────
export async function getOrCreateStripeCustomer(
  companyId: number,
  email: string,
  name: string
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({ stripeCustomerId: companies.stripeCustomerId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (rows[0]?.stripeCustomerId) return rows[0].stripeCustomerId;

  const customer = await stripe.customers.create({ email, name });

  await db
    .update(companies)
    .set({ stripeCustomerId: customer.id })
    .where(eq(companies.id, companyId));

  return customer.id;
}

export async function createSetupIntent(stripeCustomerId: string) {
  const si = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
  });
  return { clientSecret: si.client_secret, setupIntentId: si.id };
}

// ─── Job payment: charge company, transfer full job cost to contractor ─────
export interface JobPaymentParams {
  stripeCustomerId: string;
  contractorStripeAccountId: string;
  jobCostCents: number;       // full job cost (labor + parts) — paid to contractor
  platformFeeCents: number;   // platform fee added on top — kept by platform
  perListingFeeCents: number; // per-listing fee added on top — kept by platform (may be 0)
  jobId: number;
  companyId: number;
  contractorProfileId: number;
  description: string;
}

export async function chargeJobAndPayContractor(params: JobPaymentParams) {
  const {
    stripeCustomerId,
    contractorStripeAccountId,
    jobCostCents,
    platformFeeCents,
    perListingFeeCents,
    jobId,
    companyId,
    contractorProfileId,
    description,
  } = params;

  const totalChargeCents = jobCostCents + platformFeeCents + perListingFeeCents;

  // Get default payment method for customer
  const paymentMethods = await stripe.paymentMethods.list({
    customer: stripeCustomerId,
    type: "card",
  });
  const paymentMethodId = paymentMethods.data[0]?.id;

  if (!paymentMethodId) {
    throw new Error(
      "No payment method on file for this company. Please add a card in Company Settings → Payment."
    );
  }

  // Create and confirm payment intent (charges company)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalChargeCents,
    currency: "usd",
    customer: stripeCustomerId,
    payment_method: paymentMethodId,
    confirm: true,
    off_session: true,
    description,
    metadata: {
      jobId: jobId.toString(),
      companyId: companyId.toString(),
      contractorProfileId: contractorProfileId.toString(),
      jobCostCents: jobCostCents.toString(),
      platformFeeCents: platformFeeCents.toString(),
      perListingFeeCents: perListingFeeCents.toString(),
    },
  });

  // Transfer full job cost to contractor's connected account
  const transfer = await stripe.transfers.create({
    amount: jobCostCents,
    currency: "usd",
    destination: contractorStripeAccountId,
    transfer_group: `job_${jobId}`,
    metadata: {
      jobId: jobId.toString(),
      paymentIntentId: paymentIntent.id,
    },
  });

  return {
    paymentIntentId: paymentIntent.id,
    transferId: transfer.id,
    totalChargeCents,
    jobCostCents,
    platformFeeCents,
    perListingFeeCents,
  };
}

// ─── Mark contractor onboarding complete ──────────────────────────────────
export async function markContractorOnboardingComplete(stripeAccountId: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(contractorProfiles)
    .set({ stripeOnboardingComplete: true })
    .where(eq(contractorProfiles.stripeAccountId, stripeAccountId));
}
