import Stripe from "stripe";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { platformSettings, companies, contractorProfiles } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Stripe client ─────────────────────────────────────────────────────────
// Lazy-initialize Stripe to avoid crashing at startup if key is missing
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(ENV.stripeSecretKey, {
      apiVersion: "2026-02-25.clover",
    });
  }
  return _stripe;
}
// Backward-compatible alias — resolves lazily on first access
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as any)[prop];
  },
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
  try {
    const account = await stripe.accounts.create({
      type: "express",
      email,
      capabilities: {
        transfers: { requested: true },
      },
    });
    return account;
  } catch (err: any) {
    // Stripe Connect not enabled on the platform account
    if (err?.code === "account_invalid" || err?.message?.includes("connect") || err?.message?.includes("Connect") || err?.type === "StripeInvalidRequestError") {
      throw new Error(
        "STRIPE_CONNECT_NOT_ENABLED: Stripe Connect is not enabled on this platform account. " +
        "To enable it, go to https://dashboard.stripe.com/connect/accounts/overview and click 'Get started with Connect'. " +
        "In test mode you can enable it for free."
      );
    }
    throw err;
  }
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

/**
 * Create a SetupIntent for US bank account (ACH) via Stripe Financial Connections.
 * The client uses this client_secret with Stripe.js collectBankAccountForSetup().
 */
export async function createBankAccountSetupIntent(stripeCustomerId: string) {
  const si = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ["us_bank_account"],
    payment_method_options: {
      us_bank_account: {
        financial_connections: {
          permissions: ["payment_method"],
        },
      },
    },
  });
  return { clientSecret: si.client_secret!, setupIntentId: si.id };
}

/**
 * List all saved payment methods for a Stripe customer — cards and bank accounts.
 * Returns a unified list with a `type` discriminator.
 */
export async function listAllPaymentMethods(stripeCustomerId: string) {
  const [cards, bankAccounts, customerRaw] = await Promise.all([
    stripe.paymentMethods.list({ customer: stripeCustomerId, type: "card" }),
    stripe.paymentMethods.list({ customer: stripeCustomerId, type: "us_bank_account" }),
    stripe.customers.retrieve(stripeCustomerId),
  ]);

  const customer = customerRaw as Stripe.Customer;
  const defaultPmId = customer.invoice_settings?.default_payment_method as string | null;

  const cardItems = cards.data.map((pm) => ({
    id: pm.id,
    type: "card" as const,
    brand: pm.card?.brand ?? "",
    last4: pm.card?.last4 ?? "",
    expMonth: pm.card?.exp_month ?? 0,
    expYear: pm.card?.exp_year ?? 0,
    isDefault: pm.id === defaultPmId,
  }));

  const bankItems = bankAccounts.data.map((pm) => ({
    id: pm.id,
    type: "us_bank_account" as const,
    bankName: (pm.us_bank_account as any)?.bank_name ?? "Bank Account",
    last4: (pm.us_bank_account as any)?.last4 ?? "",
    accountType: (pm.us_bank_account as any)?.account_type ?? "checking",
    isDefault: pm.id === defaultPmId,
  }));

  return [...cardItems, ...bankItems];
}

/**
 * Set the default payment method on a Stripe customer (card or bank account).
 */
export async function setDefaultPaymentMethod(
  stripeCustomerId: string,
  paymentMethodId: string
) {
  await stripe.customers.update(stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

/**
 * Detach (remove) a payment method from a customer.
 */
export async function detachPaymentMethod(paymentMethodId: string) {
  await stripe.paymentMethods.detach(paymentMethodId);
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
  /** Optional: specific payment method ID to charge. Falls back to customer default if omitted. */
  paymentMethodId?: string;
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

  // Resolve payment method: use the explicitly provided one, or fall back to customer default
  let paymentMethodId: string | undefined = params.paymentMethodId;
  if (!paymentMethodId) {
    const customerRaw = await stripe.customers.retrieve(stripeCustomerId);
    const customer = customerRaw as Stripe.Customer;
    paymentMethodId = customer.invoice_settings?.default_payment_method as string | undefined;
    if (!paymentMethodId) {
      // Fall back: try cards first, then bank accounts
      const [cards, bankAccounts] = await Promise.all([
        stripe.paymentMethods.list({ customer: stripeCustomerId, type: "card" }),
        stripe.paymentMethods.list({ customer: stripeCustomerId, type: "us_bank_account" }),
      ]);
      paymentMethodId = cards.data[0]?.id ?? bankAccounts.data[0]?.id;
    }
  }

  if (!paymentMethodId) {
    throw new Error(
      "No payment method on file for this company. Please add a card or bank account in Company Settings → Payment."
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
