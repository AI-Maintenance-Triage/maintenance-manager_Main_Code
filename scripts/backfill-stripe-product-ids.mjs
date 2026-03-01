/**
 * Backfills stripeProductId on existing subscription plans so the auto-sync
 * logic can update Stripe when admins edit plans.
 * Run with: node scripts/backfill-stripe-product-ids.mjs
 */
import mysql from "mysql2/promise";
import { config } from "dotenv";
config();

const PLAN_STRIPE_MAP = [
  // id=2 Starter Company Plan
  {
    id: 2,
    stripeProductId: "prod_U4MW2vaSwBSpkm",
    stripePriceIdMonthly: "price_1T6DnuKAKVvgAItHAZb8Lcix",
    stripePriceIdAnnual: "price_1T6DnvKAKVvgAItHuypR3inw",
  },
  // id=3 Pro Company Plan
  {
    id: 3,
    stripeProductId: "prod_U4M24No9XfNOD4",
    stripePriceIdMonthly: "price_1T6DKRKAKVvgAItH4S9mYP6Z",
    stripePriceIdAnnual: "price_1T6DnvKAKVvgAItHhIzw099g",
  },
  // id=4 Enterprise Company Plan
  {
    id: 4,
    stripeProductId: "prod_U4MW33GudTmekh",
    stripePriceIdMonthly: "price_1T6DnvKAKVvgAItHSbftuVVN",
    stripePriceIdAnnual: "price_1T6DnvKAKVvgAItHFpAbGhcv",
  },
  // id=6 Pro Contractor Plan (id=5 is Free Contractor — no Stripe product)
  {
    id: 6,
    stripeProductId: "prod_U4MXbDxS7ayLaf",
    stripePriceIdMonthly: "price_1T6DnwKAKVvgAItHavrJivlb",
    stripePriceIdAnnual: "price_1T6DnwKAKVvgAItH2PK4DafB",
  },
];

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  for (const plan of PLAN_STRIPE_MAP) {
    await conn.execute(
      `UPDATE subscription_plans SET stripeProductId=?, stripePriceIdMonthly=?, stripePriceIdAnnual=? WHERE id=?`,
      [plan.stripeProductId, plan.stripePriceIdMonthly, plan.stripePriceIdAnnual, plan.id]
    );
    console.log(`✓ Plan ${plan.id} → product ${plan.stripeProductId}`);
  }
  await conn.end();
  console.log("Done.");
}
run().catch(console.error);
