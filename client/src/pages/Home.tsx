import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  Wrench, Building2, HardHat, ArrowRight, Zap, MapPin,
  CreditCard, Clock, Shield, BarChart3, Bell, CheckCircle2,
  Globe, Users, FileText, Star, Check, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

const FEATURE_LABELS: Record<string, string> = {
  gpsTimeTracking: "GPS Time Tracking",
  aiJobClassification: "AI Job Classification",
  expenseReports: "Expense Reports",
  contractorRatings: "Ratings & Reviews",
  jobComments: "Job Comments",
  emailNotifications: "Email Notifications",
  billingHistory: "Billing History",
  apiAccess: "API Access",
  customBranding: "Custom Branding",
  prioritySupport: "Priority Support",
};

const FEATURE_ORDER = [
  "gpsTimeTracking",
  "aiJobClassification",
  "expenseReports",
  "contractorRatings",
  "jobComments",
  "emailNotifications",
  "billingHistory",
  "apiAccess",
  "customBranding",
  "prioritySupport",
];

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [pricingTab, setPricingTab] = useState<"company" | "contractor">("company");
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");

  const { data: companyPlans, isLoading: companyPlansLoading } = trpc.public.listCompanyPlans.useQuery();
  const { data: contractorPlans, isLoading: contractorPlansLoading } = trpc.public.listContractorPlans.useQuery();

  useEffect(() => {
    if (!loading && user) {
      if (user.role === "admin") setLocation("/admin");
      else if (user.role === "company_admin") setLocation("/company");
      else if (user.role === "contractor") setLocation("/contractor");
      else setLocation("/register");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Wrench className="h-10 w-10 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) return null;

  const activePlans = pricingTab === "company"
    ? (companyPlans ?? [])
    : (contractorPlans ?? []);
  const plansLoading = pricingTab === "company" ? companyPlansLoading : contractorPlansLoading;

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-semibold text-foreground">Maintenance Manager</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
              className="text-muted-foreground hover:text-foreground hidden sm:flex"
            >
              Pricing
            </Button>
            <Button variant="ghost" onClick={() => setLocation("/signin")} className="text-muted-foreground hover:text-foreground">
              Sign In
            </Button>
            <Button onClick={() => setLocation("/get-started")} className="gap-2">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-primary/4" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Zap className="h-3.5 w-3.5" />
              AI-Powered Maintenance Automation
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6 leading-tight">
              Property Maintenance,{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Fully Automated
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
              From tenant request to contractor payment — AI classifies jobs, GPS tracks time,
              and payments flow automatically. Built for property management companies who want
              to stop chasing contractors and start scaling.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button size="lg" onClick={() => setLocation("/get-started")} className="gap-2 h-12 px-8 text-base">
                Start Free <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="h-12 px-8 text-base border-border text-foreground hover:bg-accent">
                See How It Works
              </Button>
            </div>
            <div className="flex items-center gap-6 mt-10 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Free during beta</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Setup in minutes</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Four steps from tenant complaint to paid contractor — most of it happens automatically.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", icon: Bell, title: "Request Comes In", desc: "Tenant submits a maintenance request through your property management software, or you create one manually." },
              { step: "02", icon: Zap, title: "AI Classifies It", desc: "Our AI reads the description, assigns priority (emergency, high, medium, low), and determines the skill tier and hourly rate." },
              { step: "03", icon: HardHat, title: "Contractor Accepts", desc: "Qualified contractors in your network get notified. They accept the job, clock in with GPS, and get to work." },
              { step: "04", icon: CreditCard, title: "Auto Payment", desc: "When the job is done, time is verified via GPS, and payment flows automatically — contractor gets paid, you get your fee." },
            ].map((item) => (
              <div key={item.step} className="relative">
                <div className="text-5xl font-bold text-primary/10 mb-4">{item.step}</div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">Everything You Need</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">A complete platform for managing maintenance at scale — from a single duplex to thousands of units.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard icon={Zap} title="AI Job Classification" description="Automatically categorizes jobs by trade, priority, and skill level. Assigns the right hourly rate tier based on job complexity." />
            <FeatureCard icon={MapPin} title="GPS Time Tracking" description="Contractors clock in/out with GPS verification. Auto clock-out when they return home. Full trip timeline with geofence validation." />
            <FeatureCard icon={CreditCard} title="Automated Payments" description="Stripe-powered marketplace. Escrow holds on acceptance, auto-split on completion. Companies pay, contractors get paid, you earn your fee." />
            <FeatureCard icon={Clock} title="Smart Time Policies" description="Configure billable time rules — on-site only, full trip, or hybrid. Set geofence radius, auto clock-out timers, and max session limits." />
            <FeatureCard icon={Globe} title="Software Integrations" description="Connect Buildium, AppFolio, Rent Manager, Yardi, and more. Self-service setup wizard pulls maintenance requests automatically." />
            <FeatureCard icon={BarChart3} title="Financial Reporting" description="Per-property expense reports, contractor income dashboards, payment history, and automated 1099-K generation at year end." />
            <FeatureCard icon={Users} title="Contractor Marketplace" description="Contractors sign up once and connect to multiple companies. Profiles include trades, service area, licenses, and performance ratings." />
            <FeatureCard icon={FileText} title="Parts & Receipts" description="Contractors photograph and upload receipts. Companies review and approve with configurable markup percentages." />
            <FeatureCard icon={Shield} title="Configurable Skill Tiers" description="Set your own hourly rates by skill level — General, Skilled, Specialty, Emergency. Each with customizable rates and multipliers." />
          </div>
        </div>
      </section>

      {/* Two Audiences */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">Built for Both Sides</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Whether you manage properties or fix them, Maintenance Manager works for you.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 rounded-2xl bg-card border border-border">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-card-foreground">Property Managers</h3>
                  <p className="text-sm text-muted-foreground">Automate your maintenance workflow</p>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  "AI auto-classifies every maintenance request",
                  "GPS-verified contractor time tracking",
                  "Automated payments through the platform",
                  "Per-property expense reports and analytics",
                  "Connect your existing PM software",
                  "Customizable hourly rate tiers",
                  "Contractor performance benchmarking",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button onClick={() => setLocation("/get-started?role=company")} className="w-full mt-8 gap-2">
                Get Started as Property Manager <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-8 rounded-2xl bg-card border border-border">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <HardHat className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-card-foreground">Contractors & Handymen</h3>
                  <p className="text-sm text-muted-foreground">Find jobs and get paid faster</p>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  "Browse jobs from multiple companies",
                  "Accept jobs that match your skills",
                  "Simple clock in/out with GPS",
                  "Upload parts receipts on the go",
                  "Get paid automatically after job completion",
                  "Build your reputation with ratings",
                  "Set your availability and service area",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button onClick={() => setLocation("/get-started?role=contractor")} variant="outline" className="w-full mt-8 gap-2 border-primary/30 text-foreground hover:bg-primary/10">
                Get Started as Contractor <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Pricing Section ─────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 bg-card/30 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-4">Simple, Transparent Pricing</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that fits your business. All plans include a 14-day free trial — no credit card required.
            </p>
          </div>

          {/* Audience tabs */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-1 bg-secondary rounded-xl p-1">
              <button
                onClick={() => setPricingTab("company")}
                className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${pricingTab === "company" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Building2 className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                Property Managers
              </button>
              <button
                onClick={() => setPricingTab("contractor")}
                className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${pricingTab === "contractor" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <HardHat className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                Contractors
              </button>
            </div>
          </div>

          {/* Billing interval toggle */}
          <div className="flex justify-center mb-10">
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
              <button
                onClick={() => setBillingInterval("monthly")}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${billingInterval === "monthly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval("annual")}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${billingInterval === "annual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Annual
                <Badge className="ml-1.5 bg-green-500/15 text-green-400 border-green-500/30 text-[10px] px-1 py-0">Save ~17%</Badge>
              </button>
            </div>
          </div>

          {/* Plan cards */}
          {plansLoading ? (
            <div className="grid md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-full rounded-2xl" />)}
            </div>
          ) : activePlans.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg">Plans coming soon — <button onClick={() => setLocation("/get-started")} className="text-primary underline">sign up free</button> to be notified.</p>
            </div>
          ) : (
            <div className={`grid gap-6 ${activePlans.length === 1 ? "max-w-sm mx-auto" : activePlans.length === 2 ? "md:grid-cols-2 max-w-2xl mx-auto" : "md:grid-cols-3"}`}>
              {activePlans.map((plan, idx) => {
                const features = (plan.features ?? {}) as Record<string, unknown>;
                const isFeatured = features.featured === true || idx === Math.floor(activePlans.length / 2);
                const price = billingInterval === "annual"
                  ? parseFloat(plan.priceAnnual ?? plan.priceMonthly ?? "0") / 12
                  : parseFloat(plan.priceMonthly ?? "0");
                const maxProps = features.maxProperties as number | null | undefined;
                const maxContractors = features.maxContractors as number | null | undefined;
                const maxJobs = features.maxJobsPerMonth as number | null | undefined;
                const maxActiveJobs = features.maxActiveJobs as number | null | undefined;
                const platformFee = features.platformFeePercent as number | null | undefined;

                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl border p-6 flex flex-col transition-all ${
                      isFeatured
                        ? "border-primary bg-primary/5 shadow-lg shadow-primary/10 scale-[1.02]"
                        : "border-border bg-card"
                    }`}
                  >
                    {isFeatured && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground px-3 py-0.5 text-xs font-semibold shadow-sm">
                          Most Popular
                        </Badge>
                      </div>
                    )}

                    <div className="mb-5">
                      <h3 className="text-lg font-bold text-foreground mb-1">{plan.name}</h3>
                      {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
                    </div>

                    <div className="mb-6">
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-bold text-foreground">
                          {price === 0 ? "Free" : `$${price.toFixed(0)}`}
                        </span>
                        {price > 0 && <span className="text-sm text-muted-foreground mb-1">/mo</span>}
                      </div>
                      {billingInterval === "annual" && price > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Billed annually (${(price * 12).toFixed(0)}/yr)
                        </p>
                      )}
                    </div>

                    {/* Usage limits */}
                    {(maxProps != null || maxContractors != null || maxJobs != null || maxActiveJobs != null || platformFee != null) && (
                      <div className="mb-5 space-y-1.5 p-3 rounded-lg bg-secondary/50">
                        {pricingTab === "company" && maxProps != null && (
                          <p className="text-xs text-muted-foreground flex justify-between">
                            <span>Properties</span>
                            <span className="font-medium text-foreground">{maxProps === 0 ? "Unlimited" : `Up to ${maxProps}`}</span>
                          </p>
                        )}
                        {pricingTab === "company" && maxContractors != null && (
                          <p className="text-xs text-muted-foreground flex justify-between">
                            <span>Contractors</span>
                            <span className="font-medium text-foreground">{maxContractors === 0 ? "Unlimited" : `Up to ${maxContractors}`}</span>
                          </p>
                        )}
                        {pricingTab === "company" && maxJobs != null && (
                          <p className="text-xs text-muted-foreground flex justify-between">
                            <span>Jobs / month</span>
                            <span className="font-medium text-foreground">{maxJobs === 0 ? "Unlimited" : `Up to ${maxJobs}`}</span>
                          </p>
                        )}
                        {pricingTab === "contractor" && maxActiveJobs != null && (
                          <p className="text-xs text-muted-foreground flex justify-between">
                            <span>Active jobs</span>
                            <span className="font-medium text-foreground">{maxActiveJobs === 0 ? "Unlimited" : `Up to ${maxActiveJobs}`}</span>
                          </p>
                        )}
                        {platformFee != null && (
                          <p className="text-xs text-muted-foreground flex justify-between">
                            <span>Platform fee</span>
                            <span className="font-medium text-foreground">{platformFee}%</span>
                          </p>
                        )}
                      </div>
                    )}

                    {/* Feature list */}
                    <ul className="space-y-2 mb-6 flex-1">
                      {FEATURE_ORDER.map((key) => {
                        const enabled = features[key] === true;
                        return (
                          <li key={key} className={`flex items-center gap-2 text-sm ${enabled ? "text-foreground" : "text-muted-foreground/50"}`}>
                            {enabled
                              ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                              : <X className="h-3.5 w-3.5 shrink-0" />}
                            {FEATURE_LABELS[key] ?? key}
                          </li>
                        );
                      })}
                    </ul>

                    <Button
                      onClick={() => setLocation(pricingTab === "company" ? "/get-started?role=company" : "/get-started?role=contractor")}
                      className={`w-full gap-2 ${isFeatured ? "" : "variant-outline"}`}
                      variant={isFeatured ? "default" : "outline"}
                    >
                      Get Started <ArrowRight className="h-4 w-4" />
                    </Button>
                    <p className="text-center text-xs text-muted-foreground mt-2">14-day free trial · No credit card</p>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-center text-sm text-muted-foreground mt-8">
            Need a custom plan for a large portfolio?{" "}
            <button onClick={() => setLocation("/contact")} className="text-primary underline">Contact us</button>
          </p>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-16 bg-card/30 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <StatBlock value="100%" label="Automated Payments" />
            <StatBlock value="AI" label="Job Classification" />
            <StatBlock value="GPS" label="Time Verification" />
            <StatBlock value="24/7" label="Always Running" />
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="py-20 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">Works With Your Existing Software</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Connect your property management platform in minutes. Maintenance requests sync automatically — no manual data entry.
            </p>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-10">
            {[
              {
                name: "Buildium",
                logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663387010889/bBuQZrfKLoBs6LmtvQ4y6E/buildium_6bc7dc8f.jpg",
                bg: "bg-white",
                color: "#0052CC",
                font: "font-bold tracking-tight",
              },
              {
                name: "AppFolio",
                logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663387010889/bBuQZrfKLoBs6LmtvQ4y6E/appfolio_fc72cc59.png",
                bg: "bg-white",
                color: "#1E3A5F",
                font: "font-semibold",
              },
              {
                name: "DoorLoop",
                logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663387010889/bBuQZrfKLoBs6LmtvQ4y6E/doorloop_69ba234b.png",
                bg: "bg-white",
                color: "#7C3AED",
                font: "font-bold",
              },
              {
                name: "Yardi",
                logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663387010889/bBuQZrfKLoBs6LmtvQ4y6E/yardi_d99ef5d4.png",
                bg: "bg-white",
                color: "#C8102E",
                font: "font-bold",
              },
              {
                name: "Rent Manager",
                logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663387010889/bBuQZrfKLoBs6LmtvQ4y6E/rentmanager_3177aba3.png",
                bg: "bg-white",
                color: "#2563EB",
                font: "font-semibold",
              },
              {
                name: "RealPage",
                logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663387010889/bBuQZrfKLoBs6LmtvQ4y6E/realpage_e7f8ae12.jpg",
                bg: "bg-white",
                color: "#E05A00",
                font: "font-bold tracking-wide",
              },
              {
                name: "Propertyware",
                logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663387010889/bBuQZrfKLoBs6LmtvQ4y6E/propertyware_dec78994.png",
                bg: "bg-white",
                color: "#1565C0",
                font: "font-semibold",
              },
            ].map((integration) => (
              <div
                key={integration.name}
                className="flex flex-col items-center gap-3 group"
              >
                <div className="h-20 w-44 rounded-xl border border-border bg-white flex items-center justify-center p-3 shadow-sm group-hover:shadow-md group-hover:border-primary/30 transition-all duration-200">
                  <img
                    src={integration.logo}
                    alt={`${integration.name} logo`}
                    className="max-h-12 max-w-full object-contain"
                  />
                </div>
                <span className={`text-xs text-muted-foreground group-hover:text-foreground transition-colors ${integration.font}`}>
                  {integration.name}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <p className="text-sm text-muted-foreground">
              More integrations coming soon.{" "}
              <button onClick={() => setLocation("/contact")} className="text-primary underline hover:text-primary/80">
                Request an integration
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="flex -space-x-1">
              {[Star, Star, Star, Star, Star].map((Icon, i) => (
                <Icon key={i} className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              ))}
            </div>
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-4">Ready to Automate Your Maintenance?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join property managers who are saving hours every week by letting AI handle job classification,
            GPS handle time tracking, and Stripe handle payments.
          </p>
          <Button size="lg" onClick={() => setLocation("/get-started")} className="gap-2 h-12 px-8 text-base">
            Get Started Free <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Maintenance Manager</span>
          </div>
          <p className="text-sm text-muted-foreground">Property maintenance automation platform</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-base font-semibold text-card-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-primary mb-1">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
