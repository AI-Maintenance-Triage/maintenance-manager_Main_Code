/**
 * Creates all subscription plan products and prices in Stripe test mode.
 * Run with: node scripts/create-stripe-plans.mjs
 */
import Stripe from "stripe";
import { config } from "dotenv";
config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const plans = [
  // ─── Company Plans ────────────────────────────────────────────────────────
  {
    name: "Starter Company Plan",
    description: "Essential tools for small property management companies",
    monthly: 4900,   // $49/mo
    annual: 49000,   // $490/yr (~17% off)
    metadata: { type: "company", tier: "starter" },
  },
  {
    name: "Pro Company Plan",
    description: "Full-featured plan for growing property management companies",
    monthly: 9900,   // $99/mo — already exists, but we need the annual price
    annual: 99000,   // $990/yr
    metadata: { type: "company", tier: "pro" },
    existingProductId: "prod_U4M24No9XfNOD4", // reuse existing product
    existingMonthlyPriceId: "price_1T6DKRKAKVvgAItH4S9mYP6Z", // already created
  },
  {
    name: "Enterprise Company Plan",
    description: "Unlimited scale for large property management operations",
    monthly: 19900,  // $199/mo
    annual: 199000,  // $1990/yr
    metadata: { type: "company", tier: "enterprise" },
  },
  // ─── Contractor Plans ─────────────────────────────────────────────────────
  {
    name: "Pro Contractor Plan",
    description: "Get notified of new jobs 20 minutes before free-tier contractors",
    monthly: 2900,   // $29/mo
    annual: 29000,   // $290/yr
    metadata: { type: "contractor", tier: "pro" },
  },
];

async function run() {
  const results = {};

  for (const plan of plans) {
    console.log(`\n─── ${plan.name} ───`);

    let productId = plan.existingProductId;
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: plan.metadata,
      });
      productId = product.id;
      console.log(`  Product created: ${productId}`);
    } else {
      console.log(`  Reusing existing product: ${productId}`);
    }

    let monthlyPriceId = plan.existingMonthlyPriceId;
    if (!monthlyPriceId) {
      const monthlyPrice = await stripe.prices.create({
        product: productId,
        unit_amount: plan.monthly,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { billing: "monthly", ...plan.metadata },
      });
      monthlyPriceId = monthlyPrice.id;
      console.log(`  Monthly price: ${monthlyPriceId} ($${plan.monthly / 100}/mo)`);
    } else {
      console.log(`  Reusing existing monthly price: ${monthlyPriceId}`);
    }

    const annualPrice = await stripe.prices.create({
      product: productId,
      unit_amount: plan.annual,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { billing: "annual", ...plan.metadata },
    });
    console.log(`  Annual price: ${annualPrice.id} ($${plan.annual / 100}/yr)`);

    results[plan.metadata.tier + "_" + plan.metadata.type] = {
      productId,
      monthlyPriceId,
      annualPriceId: annualPrice.id,
    };
  }

  console.log("\n\n═══ RESULTS (copy these into admin UI) ═══");
  console.log(JSON.stringify(results, null, 2));
}

run().catch(console.error);
