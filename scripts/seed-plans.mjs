/**
 * Seeds all subscription plans into the database.
 * Run with: node scripts/seed-plans.mjs
 */
import mysql from "mysql2/promise";
import { config } from "dotenv";
config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Plan definitions ──────────────────────────────────────────────────────
const plans = [
  // ─── Company Plans ─────────────────────────────────────────────────────
  {
    planType: "company",
    name: "Starter",
    description: "Essential tools for small property management companies getting started.",
    priceMonthly: "49.00",
    priceAnnual: "490.00",
    stripePriceIdMonthly: "price_1T6De9KAKVvgAItHEGOUn9BQ",
    stripePriceIdAnnual: "price_1T6De9KAKVvgAItHcwSgMdX3",
    earlyNotificationMinutes: 0,
    sortOrder: 1,
    features: {
      maxProperties: 5,
      maxContractors: 10,
      maxJobsPerMonth: 50,
      gpsTimeTracking: true,
      aiJobClassification: false,
      expenseReports: false,
      contractorRatings: false,
      jobComments: true,
      emailNotifications: true,
      billingHistory: true,
      apiAccess: false,
      customBranding: false,
      prioritySupport: false,
    },
  },
  {
    planType: "company",
    name: "Pro",
    description: "Full-featured plan for growing property management companies.",
    priceMonthly: "99.00",
    priceAnnual: "990.00",
    stripePriceIdMonthly: "price_1T6DKRKAKVvgAItH4S9mYP6Z",
    stripePriceIdAnnual: "price_1T6DeAKAKVvgAItHdqUJqE6I",
    earlyNotificationMinutes: 0,
    sortOrder: 2,
    features: {
      maxProperties: 25,
      maxContractors: null,
      maxJobsPerMonth: null,
      gpsTimeTracking: true,
      aiJobClassification: true,
      expenseReports: true,
      contractorRatings: true,
      jobComments: true,
      emailNotifications: true,
      billingHistory: true,
      apiAccess: false,
      customBranding: false,
      prioritySupport: false,
    },
  },
  {
    planType: "company",
    name: "Enterprise",
    description: "Unlimited scale for large property management operations with full platform access.",
    priceMonthly: "199.00",
    priceAnnual: "1990.00",
    stripePriceIdMonthly: "price_1T6DeBKAKVvgAItHRV0dbUyT",
    stripePriceIdAnnual: "price_1T6DeBKAKVvgAItHCWIvj3Zr",
    earlyNotificationMinutes: 0,
    sortOrder: 3,
    features: {
      maxProperties: null,
      maxContractors: null,
      maxJobsPerMonth: null,
      gpsTimeTracking: true,
      aiJobClassification: true,
      expenseReports: true,
      contractorRatings: true,
      jobComments: true,
      emailNotifications: true,
      billingHistory: true,
      apiAccess: true,
      customBranding: true,
      prioritySupport: true,
    },
  },
  // ─── Contractor Plans ──────────────────────────────────────────────────
  {
    planType: "contractor",
    name: "Free",
    description: "Get started on the job board at no cost. Standard job notification timing.",
    priceMonthly: "0.00",
    priceAnnual: "0.00",
    stripePriceIdMonthly: null,
    stripePriceIdAnnual: null,
    earlyNotificationMinutes: 0,
    sortOrder: 1,
    features: {
      maxProperties: null,
      maxContractors: null,
      maxJobsPerMonth: null,
      gpsTimeTracking: true,
      aiJobClassification: false,
      expenseReports: false,
      contractorRatings: true,
      jobComments: true,
      emailNotifications: true,
      billingHistory: false,
      apiAccess: false,
      customBranding: false,
      prioritySupport: false,
    },
  },
  {
    planType: "contractor",
    name: "Pro",
    description: "Get notified of new jobs 20 minutes before free-tier contractors — first access to the best jobs.",
    priceMonthly: "29.00",
    priceAnnual: "290.00",
    stripePriceIdMonthly: "price_1T6DeCKAKVvgAItHYaBNkoss",
    stripePriceIdAnnual: "price_1T6DeDKAKVvgAItHdDwCXBPw",
    earlyNotificationMinutes: 20,
    sortOrder: 2,
    features: {
      maxProperties: null,
      maxContractors: null,
      maxJobsPerMonth: null,
      gpsTimeTracking: true,
      aiJobClassification: false,
      expenseReports: true,
      contractorRatings: true,
      jobComments: true,
      emailNotifications: true,
      billingHistory: true,
      apiAccess: false,
      customBranding: false,
      prioritySupport: true,
    },
  },
];

// Delete existing plans and re-seed fresh
await conn.execute("DELETE FROM subscription_plans");
console.log("Cleared existing plans.");

for (const plan of plans) {
  await conn.execute(
    `INSERT INTO subscription_plans 
      (planType, name, description, priceMonthly, priceAnnual, stripePriceIdMonthly, stripePriceIdAnnual, earlyNotificationMinutes, features, isActive, sortOrder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      plan.planType,
      plan.name,
      plan.description,
      plan.priceMonthly,
      plan.priceAnnual,
      plan.stripePriceIdMonthly,
      plan.stripePriceIdAnnual,
      plan.earlyNotificationMinutes,
      JSON.stringify(plan.features),
      plan.sortOrder,
    ]
  );
  console.log(`✓ Created ${plan.planType} plan: ${plan.name} ($${plan.priceMonthly}/mo)`);
}

const [rows] = await conn.execute("SELECT id, planType, name, priceMonthly, earlyNotificationMinutes FROM subscription_plans ORDER BY planType, sortOrder");
console.log("\nAll plans in database:");
console.table(rows);

await conn.end();
