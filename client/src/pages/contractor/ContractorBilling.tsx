import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Receipt, DollarSign, TrendingUp, Briefcase, Calendar, Download,
  Check, X, ClipboardList, Building2, ArrowUpRight, Zap,
  Star, Shield, Crown, CheckCircle2, AlertCircle, XCircle, CreditCard,
  Link2, ExternalLink, RefreshCw, Clock, FileText, Banknote,
} from "lucide-react";

const CONTRACTOR_FEATURE_LABELS: Record<string, string> = {
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

const PLAN_ICONS = [Zap, Star, Shield, Crown];

function fmt(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
}

function statusColor(status: string) {
  switch (status) {
    case "captured":
    case "paid_out": return "bg-green-500/15 text-green-400 border-green-500/30";
    case "pending":
    case "escrow": return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "refunded": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "failed": return "bg-red-500/15 text-red-400 border-red-500/30";
    default: return "bg-secondary text-muted-foreground";
  }
}

function planStatusBadge(status: string) {
  switch (status) {
    case "active": return <Badge className="bg-green-500/15 text-green-400 border-green-500/30 gap-1"><CheckCircle2 className="h-3 w-3" /> Active</Badge>;
    case "trialing": return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 gap-1"><Zap className="h-3 w-3" /> Trial</Badge>;
    case "canceled": return <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 gap-1"><AlertCircle className="h-3 w-3" /> Canceling</Badge>;
    case "expired": return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 gap-1"><XCircle className="h-3 w-3" /> Expired</Badge>;
    default: return null;
  }
}

function StripeConnectCard() {
  const utils = trpc.useUtils();
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [connectNotEnabled, setConnectNotEnabled] = useState(false);
  const prevIsComplete = useRef<boolean | null>(null);

  const { data: connectStatus, isLoading: connectLoading, refetch } =
    trpc.stripePayments.contractorOnboardingStatus.useQuery(
      undefined,
      {
        // Poll every 5 seconds while an account exists but onboarding is not yet complete
        // so the UI updates automatically once the contractor finishes in the Stripe-hosted tab
        refetchInterval: (query) => {
          const d = query.state.data as { onboardingComplete?: boolean; stripeAccountId?: string | null } | undefined;
          if (!d) return false;
          if (d.onboardingComplete) return false;
          return d.stripeAccountId ? 5000 : false;
        },
      }
    );

  const startOnboarding = trpc.stripePayments.contractorOnboardingLink.useMutation({
    onSuccess: (data) => {
      setOnboardingLoading(false);
      window.open(data.url, "_blank");
      toast.success("Stripe onboarding opened", {
        description: "Complete the form in the new tab — this page will update automatically once your account is verified.",
      });
    },
    onError: (err) => {
      setOnboardingLoading(false);
      if (err.message?.includes("STRIPE_CONNECT_NOT_ENABLED")) {
        setConnectNotEnabled(true);
        toast.error("Stripe Connect not enabled", {
          description: "Enable Connect on your Stripe account first: dashboard.stripe.com → Connect → Get started. It's free in test mode.",
          duration: 12000,
          action: {
            label: "Open Stripe",
            onClick: () => window.open("https://dashboard.stripe.com/connect/accounts/overview", "_blank"),
          },
        });
      } else {
        toast.error("Could not start onboarding", { description: err.message });
      }
    },
  });

  // Handle return from Stripe onboarding
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeParam = params.get("stripe");
    if (stripeParam === "success") {
      toast.success("Stripe onboarding complete!", {
        description: "Your payout account has been connected.",
      });
      refetch();
      utils.stripePayments.contractorOnboardingStatus.invalidate();
    } else if (stripeParam === "refresh") {
      toast.info("Onboarding session expired", {
        description: "Please start the onboarding process again.",
      });
    }
  }, []);

  const isComplete = connectStatus?.onboardingComplete ?? false;
  const hasAccount = !!connectStatus?.stripeAccountId;

  // Show a success toast when the status transitions to active via polling
  useEffect(() => {
    if (prevIsComplete.current === false && isComplete) {
      toast.success("Stripe account activated!", {
        description: "Your payout account is now active. You will receive automatic transfers for completed jobs.",
      });
    }
    prevIsComplete.current = isComplete;
  }, [isComplete]);

  return (
    <Card className={`border ${isComplete ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-2 rounded-lg ${isComplete ? "bg-green-500/20" : "bg-amber-500/20"}`}>
                <Link2 className={`h-5 w-5 ${isComplete ? "text-green-400" : "text-amber-400"}`} />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Stripe Payout Account</h3>
                <p className="text-xs text-muted-foreground">Required to receive job payments</p>
              </div>
              {isComplete ? (
                <Badge className="bg-green-500/15 text-green-400 border-green-500/30 gap-1 ml-auto sm:ml-0">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </Badge>
              ) : (
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1 ml-auto sm:ml-0">
                  <AlertCircle className="h-3 w-3" /> {hasAccount ? "Incomplete" : "Not Connected"}
                </Badge>
              )}
            </div>

            {connectNotEnabled && (
              <div className="mt-2 flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-red-400">Stripe Connect is not enabled on this platform</p>
                  <p className="text-xs text-muted-foreground">
                    To enable contractor payouts, the platform owner needs to enable Stripe Connect once in the Stripe dashboard. It's free in test mode.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={() => window.open("https://dashboard.stripe.com/connect/accounts/overview", "_blank")}
                    >
                      <ExternalLink className="h-3 w-3" /> Enable Connect in Stripe Dashboard
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => setConnectNotEnabled(false)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {isComplete ? (
              <div className="space-y-1.5">
                <p className="text-sm text-green-400">
                  Your Stripe account is connected and ready to receive payouts. When a company pays for a completed job, funds are automatically transferred to your Stripe account.
                </p>
                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Charges enabled
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Payouts enabled
                  </div>
                  {connectStatus?.stripeAccountId && (
                    <div className="text-xs text-muted-foreground font-mono">
                      ID: {connectStatus.stripeAccountId}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-amber-400">
                  {hasAccount
                    ? "Your Stripe account setup is not yet complete. Please finish the onboarding process to start receiving payouts."
                    : "Connect a Stripe account to receive automatic payouts when jobs are completed and verified. The platform fee is deducted from the company's payment — you receive the full agreed job amount."}
                </p>
                {!isComplete && (
                  <div className="bg-secondary/50 rounded-md p-3 mt-2 space-y-1">
                    <p className="text-xs font-medium text-foreground">How payouts work:</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-green-400 shrink-0" /> Company pays job cost + platform fee</li>
                      <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-green-400 shrink-0" /> Platform fee is kept by the platform</li>
                      <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-green-400 shrink-0" /> Full job cost transferred to your Stripe account</li>
                      <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-green-400 shrink-0" /> Funds available in your bank within 2 business days</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            {connectLoading ? (
              <Skeleton className="h-9 w-36" />
            ) : isComplete ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-green-500/30 text-green-400 hover:bg-green-500/10"
                onClick={() => {
                  setOnboardingLoading(true);
                  startOnboarding.mutate({ origin: window.location.origin });
                }}
                disabled={onboardingLoading}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Manage Account
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => {
                  setOnboardingLoading(true);
                  startOnboarding.mutate({ origin: window.location.origin });
                }}
                disabled={onboardingLoading || startOnboarding.isPending}
              >
                <Link2 className="h-3.5 w-3.5" />
                {onboardingLoading ? "Opening..." : hasAccount ? "Continue Setup" : "Connect Stripe"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-3 w-3" /> Refresh Status
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ContractorBilling() {
  const [, setLocation] = useLocation();
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<number | null>(null);

  const { data: earnings, isLoading: earningsLoading } = trpc.contractor.getEarnings.useQuery();
  const { data: planData, isLoading: planLoading } = trpc.contractor.getMyPlan.useQuery();
  const { data: availablePlans, isLoading: plansLoading } = trpc.contractor.listAvailablePlans.useQuery();
  const { data: invoiceData, isLoading: invoicesLoading } = trpc.stripePayments.getContractorInvoices.useQuery();

  const createCheckout = trpc.stripePayments.createContractorPlanCheckout.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank");
        toast.success("Redirecting to checkout", { description: "A new tab has been opened for payment." });
      }
      setCheckoutLoading(null);
    },
    onError: (err) => {
      toast.error("Checkout failed", { description: err.message });
      setCheckoutLoading(null);
    },
  });

  const cancelSubscription = trpc.stripePayments.cancelContractorPlanSubscription.useMutation({
    onSuccess: (data) => toast.success("Subscription canceled", { description: data.message }),
    onError: (err) => toast.error(err.message),
  });

  // Handle Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sub = params.get("subscription");
    if (sub === "success") {
      toast.success("Subscription activated!", { description: "Your plan has been updated." });
      setLocation("/contractor/billing", { replace: true });
    } else if (sub === "canceled") {
      toast.info("Checkout canceled", { description: "No changes were made." });
      setLocation("/contractor/billing", { replace: true });
    }
  }, []);

  const plan = planData?.plan;
  const usage = planData?.usage;
  const planStatus = planData?.planStatus ?? null;
  const daysRemaining = planData?.daysRemaining ?? null;
  const rawTxns = earnings?.transactions ?? [];
  const totalEarned = earnings?.totalEarned ?? 0;
  const totalGross = rawTxns.reduce((s: number, t: any) => s + parseFloat(String(t.totalCharged ?? "0")), 0);
  const avgPerJob = rawTxns.length > 0 ? totalEarned / rawTxns.length : 0;

  const activePlans = (availablePlans ?? []).filter((p) => p.isActive).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" /> Billing & Subscription
        </h1>
        <p className="text-muted-foreground mt-1">Manage your subscription plan and view your payment history</p>
      </div>

      {/* Stripe Connect Onboarding */}
      <StripeConnectCard />

      {/* Current Plan Summary */}
      {planLoading ? (
        <Skeleton className="h-36 w-full" />
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Plan</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-foreground">{plan?.name ?? "No Plan"}</h2>
                  {planStatus && planStatusBadge(planStatus)}
                  {planStatus === "trialing" && daysRemaining !== null && (
                    <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
                      <Calendar className="h-3 w-3" /> {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} left in trial
                    </Badge>
                  )}
                </div>
                {plan?.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
                {!plan && <p className="text-sm text-muted-foreground">You are not currently on a subscription plan. Choose a plan below to get started.</p>}
                {planStatus === "expired" && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span>Your plan has expired. Subscribe below to restore access to all features.</span>
                  </div>
                )}
                {planStatus === "trialing" && daysRemaining !== null && daysRemaining <= 3 && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Your trial ends in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}. Subscribe now to keep your access.</span>
                  </div>
                )}
              </div>
              {plan && (
                <div className="text-right shrink-0">
                  <p className="text-3xl font-bold text-foreground">
                    ${parseFloat(plan.priceMonthly ?? "0").toFixed(0)}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </p>
                </div>
              )}
            </div>

            {/* Usage gauges */}
            {plan && usage && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 pt-5 border-t border-border">
                {[
                  { icon: ClipboardList, label: "Active Jobs", value: usage.activeJobs, max: (plan.features as any)?.maxActiveJobs },
                  { icon: Building2, label: "Approved Companies", value: usage.approvedCompanies, max: (plan.features as any)?.maxCompanies },
                ].map(({ icon: Icon, label, value, max }) => (
                  <div key={label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground"><Icon className="h-3 w-3" /> {label}</span>
                      <span className="text-foreground font-medium">{value}{max != null ? ` / ${max}` : " / ∞"}</span>
                    </div>
                    {max != null ? (
                      <Progress value={Math.min(100, (value / max) * 100)} className="h-1.5" />
                    ) : (
                      <div className="h-1.5 rounded-full bg-secondary" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Cancel subscription */}
            {plan && (
              <div className="mt-4 pt-4 border-t border-border flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-red-400"
                  onClick={() => {
                    if (confirm("Are you sure you want to cancel your subscription? It will remain active until the end of the billing period.")) {
                      cancelSubscription.mutate();
                    }
                  }}
                  disabled={cancelSubscription.isPending}
                >
                  Cancel Subscription
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Available Plans */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Available Plans</h2>
            <p className="text-sm text-muted-foreground">Choose the plan that fits your workflow</p>
          </div>
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            <button
              onClick={() => setBillingInterval("monthly")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${billingInterval === "monthly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval("annual")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${billingInterval === "annual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Annual <span className="text-green-400 ml-1">Save ~17%</span>
            </button>
          </div>
        </div>

        {plansLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-72 w-full" />)}
          </div>
        ) : activePlans.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No subscription plans are available yet. Contact your account manager.</p>
              <Button variant="outline" className="mt-4 gap-2 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => window.open("mailto:support@example.com?subject=Plan Inquiry", "_blank")}>
                <ArrowUpRight className="h-4 w-4" /> Contact Us
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activePlans.map((p, idx) => {
              const isCurrent = plan?.id === p.id;
              const PlanIcon = PLAN_ICONS[idx % PLAN_ICONS.length];
              const displayPrice = billingInterval === "annual"
                ? parseFloat(p.priceAnnual ?? "0") / 12
                : parseFloat(p.priceMonthly ?? "0");
              const features = (p.features as any) ?? {};
              const hasStripePrice = billingInterval === "annual" ? !!p.stripePriceIdAnnual : !!p.stripePriceIdMonthly;
              const currentPlanIdx = activePlans.findIndex(ap => ap.id === plan?.id);

              return (
                <Card
                  key={p.id}
                  className={`relative flex flex-col transition-all ${isCurrent
                    ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                    : "border-border bg-card hover:border-border/80"}`}
                >
                  {isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">Current Plan</span>
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`p-1.5 rounded-md ${isCurrent ? "bg-primary/20" : "bg-secondary"}`}>
                        <PlanIcon className={`h-4 w-4 ${isCurrent ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <CardTitle className="text-base text-card-foreground">{p.name}</CardTitle>
                    </div>
                    {p.description && <CardDescription className="text-xs">{p.description}</CardDescription>}
                    <div className="mt-2">
                      <span className="text-3xl font-bold text-foreground">${displayPrice.toFixed(0)}</span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                      {billingInterval === "annual" && parseFloat(p.priceAnnual ?? "0") > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">Billed ${parseFloat(p.priceAnnual ?? "0").toFixed(0)}/yr</p>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-4">
                    {/* Early Notification Badge */}
                    {(p as any).earlyNotificationMinutes > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                        <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span className="text-xs font-medium text-amber-400">
                          {(p as any).earlyNotificationMinutes}-min early job access
                        </span>
                      </div>
                    )}
                    {/* Limits */}
                    <div className="space-y-1 text-xs">
                      {[
                        { label: "Active Jobs", val: features.maxActiveJobs },
                        { label: "Companies", val: features.maxCompanies },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex justify-between text-muted-foreground">
                          <span>{label}</span>
                          <span className="font-medium text-foreground">{val != null ? val : "Unlimited"}</span>
                        </div>
                      ))}
                    </div>
                    {/* Features */}
                    <div className="space-y-1.5">
                      {Object.entries(CONTRACTOR_FEATURE_LABELS).map(([key, label]) => {
                        const enabled = features[key] ?? false;
                        return (
                          <div key={key} className="flex items-center gap-1.5 text-xs">
                            {enabled
                              ? <Check className="h-3 w-3 text-green-400 shrink-0" />
                              : <X className="h-3 w-3 text-muted-foreground/30 shrink-0" />}
                            <span className={enabled ? "text-foreground" : "text-muted-foreground/50"}>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Action */}
                    <div className="mt-auto pt-2">
                      {isCurrent ? (
                        <Button variant="outline" className="w-full border-primary/30 text-primary" disabled>
                          <CheckCircle2 className="h-4 w-4 mr-2" /> Current Plan
                        </Button>
                      ) : hasStripePrice ? (
                        <Button
                          className="w-full"
                          variant={idx >= currentPlanIdx ? "default" : "outline"}
                          disabled={checkoutLoading === p.id}
                          onClick={() => {
                            setCheckoutLoading(p.id);
                            createCheckout.mutate({ planId: p.id, billingInterval, origin: window.location.origin });
                          }}
                        >
                          {checkoutLoading === p.id ? "Loading..." : plan ? (idx > currentPlanIdx ? "Upgrade" : "Switch") : "Subscribe"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full border-primary/30 text-primary hover:bg-primary/10"
                          onClick={() => window.open("mailto:support@example.com?subject=Plan Inquiry: " + p.name, "_blank")}
                        >
                          <ArrowUpRight className="h-4 w-4 mr-2" /> Contact Us
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Subscription Invoice History */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Subscription Invoice History</h2>
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            {invoicesLoading ? (
              <div className="p-6 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !invoiceData?.invoices?.length ? (
              <div className="p-10 text-center">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No subscription invoices yet. Subscribe to a plan to see billing history here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Invoice #</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Description</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Amount</th>
                      <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-center px-4 py-3 text-muted-foreground font-medium">Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceData.invoices.map((inv: any) => (
                      <tr key={inv.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {new Date(inv.created * 1000).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-foreground font-mono text-xs">{inv.number ?? inv.id.slice(0, 12)}</td>
                        <td className="px-4 py-3 text-foreground max-w-[200px] truncate">
                          {inv.description ?? `${plan?.name ?? "Subscription"} — ${new Date(inv.periodStart * 1000).toLocaleDateString()} to ${new Date(inv.periodEnd * 1000).toLocaleDateString()}`}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">
                          ${(inv.amountPaid / 100).toFixed(2)} {inv.currency?.toUpperCase()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            inv.status === "paid" ? "bg-green-500/15 text-green-400 border-green-500/30" :
                            inv.status === "open" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" :
                            "bg-secondary text-muted-foreground border-border"
                          }`}>{inv.status}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {inv.invoicePdf ? (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary hover:text-primary"
                              onClick={() => window.open(inv.invoicePdf, "_blank")}>
                              <Download className="h-3.5 w-3.5 mr-1" /> PDF
                            </Button>
                          ) : inv.hostedInvoiceUrl ? (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary hover:text-primary"
                              onClick={() => window.open(inv.hostedInvoiceUrl, "_blank")}>
                              <ExternalLink className="h-3.5 w-3.5 mr-1" /> View
                            </Button>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Job Earnings History */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Job Earnings History</h2>
          <Link href="/contractor/payouts">
            <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8">
              <Banknote className="h-3.5 w-3.5" /> View Stripe Payouts
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {[
            { icon: DollarSign, color: "text-green-400", label: "Total Earned", value: fmt(totalEarned), sub: `${rawTxns.length} paid jobs` },
            { icon: TrendingUp, color: "text-blue-400", label: "Gross Billed", value: fmt(totalGross), sub: "Before platform fee" },
            { icon: Briefcase, color: "text-purple-400", label: "Avg Per Job", value: fmt(avgPerJob), sub: null },
          ].map(({ icon: Icon, color, label, value, sub }) => (
            <Card key={label} className="bg-card border-border">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">Job Transactions</CardTitle>
            <CardDescription>Your payout is the full agreed job amount — platform fee is charged to the company</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {earningsLoading ? (
              <div className="p-6 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : rawTxns.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No payments yet. Completed and verified jobs will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Job</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Labor</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Parts</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Gross</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Your Payout</th>
                      <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-center px-4 py-3 text-muted-foreground font-medium">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawTxns.map((t: any) => (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {t.paidAt ? new Date(t.paidAt).toLocaleDateString() : new Date(t.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground max-w-[200px]">
                          <div className="truncate font-medium">{t.jobTitle ?? `Job #${t.maintenanceRequestId}`}</div>
                          {t.propertyName && <div className="text-xs text-muted-foreground truncate">{t.propertyName}</div>}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">{fmt(t.laborCost)}</td>
                        <td className="px-4 py-3 text-right text-foreground">{fmt(t.partsCost)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{fmt(t.totalCharged)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-400">{fmt(t.contractorPayout)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(t.status)}`}>
                            {t.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-primary hover:text-primary"
                            onClick={() => window.open(`/api/receipt/${t.maintenanceRequestId}`, "_blank")}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            PDF
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-secondary/30">
                      <td colSpan={2} className="px-4 py-3 font-semibold text-foreground">Totals</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {fmt(rawTxns.reduce((s: number, t: any) => s + parseFloat(String(t.laborCost ?? "0")), 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {fmt(rawTxns.reduce((s: number, t: any) => s + parseFloat(String(t.partsCost ?? "0")), 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-muted-foreground">{fmt(totalGross)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-400">{fmt(totalEarned)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
