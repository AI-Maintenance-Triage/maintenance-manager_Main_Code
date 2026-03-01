import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  CreditCard, FileText, DollarSign, TrendingUp, Calendar, Download,
  Check, X, Building2, Users, ClipboardList, ArrowUpRight, Zap,
  Star, Shield, Crown, CheckCircle2, AlertCircle, XCircle, ExternalLink,
  Receipt, Plus, Trash2, Star as StarIcon, Wallet,
} from "lucide-react";

const COMPANY_FEATURE_LABELS: Record<string, string> = {
  gpsTimeTracking: "GPS Time Tracking",
  aiJobClassification: "AI Job Classification",
  expenseReports: "Expense Reports",
  contractorRatings: "Contractor Ratings",
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

function fmtCents(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
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

function invoiceStatusColor(status: string | null) {
  switch (status) {
    case "paid": return "bg-green-500/15 text-green-400 border-green-500/30";
    case "open": return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "void": return "bg-secondary text-muted-foreground";
    case "uncollectible": return "bg-red-500/15 text-red-400 border-red-500/30";
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

function CardBrandIcon({ brand }: { brand: string }) {
  const brands: Record<string, string> = {
    visa: "VISA", mastercard: "MC", amex: "AMEX", discover: "DISC",
    jcb: "JCB", unionpay: "UP", diners: "DC",
  };
  return (
    <span className="inline-flex items-center justify-center w-10 h-6 rounded bg-secondary text-[10px] font-bold text-foreground border border-border">
      {brands[brand.toLowerCase()] ?? brand.slice(0, 4).toUpperCase()}
    </span>
  );
}

function PaymentMethodsSection() {
  const utils = trpc.useUtils();
  const { data: pmData, isLoading: pmLoading } = trpc.stripePayments.listPaymentMethods.useQuery();
  const createSetupIntent = trpc.stripePayments.createSetupIntent.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank");
        toast.info("Opening card setup...", { description: "A new tab has been opened. Complete the form to save your card." });
      }
    },
    onError: (err) => toast.error("Could not open payment setup", { description: err.message }),
  });
  const setDefault = trpc.stripePayments.setDefaultPaymentMethod.useMutation({
    onSuccess: () => {
      toast.success("Default payment method updated");
      utils.stripePayments.listPaymentMethods.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const detach = trpc.stripePayments.detachPaymentMethod.useMutation({
    onSuccess: () => {
      toast.success("Payment method removed");
      utils.stripePayments.listPaymentMethods.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const pms = pmData?.paymentMethods ?? [];
  const defaultId = pmData?.defaultPaymentMethodId;

  const openAddCard = () => {
    // Create a Stripe Checkout session in setup mode to add a card
    createSetupIntent.mutate({ origin: window.location.origin });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-card-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" /> Payment Methods
            </CardTitle>
            <CardDescription>Saved cards used for subscription billing</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            onClick={openAddCard}
            disabled={createSetupIntent.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
            {createSetupIntent.isPending ? "Opening..." : "Add Card"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {pmLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : pms.length === 0 ? (
          <div className="text-center py-8">
            <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No payment methods saved.</p>
            <p className="text-xs text-muted-foreground mt-1">Add a card to use for subscription payments.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pms.map((pm: any) => {
              const isDefault = pm.id === defaultId;
              return (
                <div
                  key={pm.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    isDefault ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CardBrandIcon brand={pm.brand} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {pm.type === "us_bank_account" ? `Bank ••••${pm.last4}` : `••••  ••••  ••••  ${pm.last4}`}
                        </span>
                        {isDefault && (
                          <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0 gap-1">
                            <StarIcon className="h-2.5 w-2.5" /> Default
                          </Badge>
                        )}
                      </div>
                      {pm.expMonth > 0 && (
                        <p className="text-xs text-muted-foreground">Expires {String(pm.expMonth).padStart(2, "0")}/{pm.expYear}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setDefault.mutate({ paymentMethodId: pm.id })}
                        disabled={setDefault.isPending}
                      >
                        <StarIcon className="h-3 w-3 mr-1" /> Set Default
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => detach.mutate({ paymentMethodId: pm.id })}
                      disabled={detach.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CompanyBilling() {
  const [, setLocation] = useLocation();
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: txns, isLoading: txnsLoading } = trpc.transactions.listByCompany.useQuery();
  const { data: planData, isLoading: planLoading } = trpc.company.getMyPlan.useQuery();
  const { data: availablePlans, isLoading: plansLoading } = trpc.company.listAvailablePlans.useQuery();
  const { data: invoicesData, isLoading: invoicesLoading } = trpc.stripePayments.getInvoices.useQuery();

  const createCheckout = trpc.stripePayments.createPlanCheckout.useMutation({
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

  const openCustomerPortal = trpc.stripePayments.createCustomerPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
        toast.info("Opening billing portal...", { description: "Manage your subscription, invoices, and payment methods in Stripe." });
      }
    },
    onError: (err) => toast.error("Could not open billing portal", { description: err.message }),
  });

  const cancelSubscription = trpc.stripePayments.cancelPlanSubscription.useMutation({
    onSuccess: (data) => {
      toast.success("Subscription canceled", { description: data.message });
      utils.company.getMyPlan.invalidate();
      utils.stripePayments.getInvoices.invalidate();
    },
    onError: (err) => {
      toast.error("Cancellation failed", { description: err.message });
    },
  });

  // Handle success/cancel redirects from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sub = params.get("subscription");
    if (sub === "success") {
      toast.success("Subscription activated!", { description: "Your plan has been updated. It may take a moment to reflect." });
      setLocation("/company/billing", { replace: true });
      // Invalidate after a short delay to allow webhook processing
      setTimeout(() => {
        utils.company.getMyPlan.invalidate();
        utils.company.listAvailablePlans.invalidate();
        utils.stripePayments.getInvoices.invalidate();
      }, 2500);
    } else if (sub === "canceled") {
      toast.info("Checkout canceled", { description: "No changes were made." });
      setLocation("/company/billing", { replace: true });
    }
    const setup = params.get("setup");
    if (setup === "success") {
      toast.success("Card saved!", { description: "Your payment method has been added successfully." });
      setLocation("/company/billing", { replace: true });
      setTimeout(() => utils.stripePayments.listPaymentMethods.invalidate(), 1500);
    } else if (setup === "canceled") {
      toast.info("Card setup canceled", { description: "No card was saved." });
      setLocation("/company/billing", { replace: true });
    }
  }, []);

  // Poll every 5s when no plan is detected yet (catches webhook processing delay)
  useEffect(() => {
    if (!planData || planData.plan) return;
    const interval = setInterval(() => {
      utils.company.getMyPlan.invalidate();
    }, 5000);
    return () => clearInterval(interval);
  }, [!!planData?.plan]);

  const plan = planData?.plan;
  const usage = planData?.usage;
  const planPriceOverride = planData?.planPriceOverride;
  const planStatus = planData?.planStatus ?? null;
  const daysRemaining = planData?.daysRemaining ?? null;
  const invoices = invoicesData?.invoices ?? [];

  const totalCharged = txns?.reduce((s, t) => s + parseFloat(String(t.totalCharged ?? "0")), 0) ?? 0;
  const totalFees = txns?.reduce((s, t) => s + parseFloat(String(t.platformFee ?? "0")), 0) ?? 0;
  const totalLabor = txns?.reduce((s, t) => s + parseFloat(String(t.laborCost ?? "0")), 0) ?? 0;
  const totalParts = txns?.reduce((s, t) => s + parseFloat(String(t.partsCost ?? "0")), 0) ?? 0;

  const activePlans = (availablePlans ?? []).filter((p) => p.isActive).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const canCancel = planStatus === "active" || planStatus === "trialing";

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" /> Billing & Subscription
          </h1>
          <p className="text-muted-foreground mt-1">Manage your subscription plan and view payment history</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => openCustomerPortal.mutate({ origin: window.location.origin })}
          disabled={openCustomerPortal.isPending}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {openCustomerPortal.isPending ? "Opening..." : "Manage Billing in Stripe"}
        </Button>
      </div>

      {/* Current Plan Summary */}
      {(planLoading) ? (
        <Skeleton className="h-36 w-full" />
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1 flex-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Plan</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-foreground">{plan?.name ?? "No Plan"}</h2>
                  {planStatus && planStatusBadge(planStatus)}
                  {planStatus === "trialing" && daysRemaining !== null && (
                    <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
                      <Calendar className="h-3 w-3" /> {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} left in trial
                    </Badge>
                  )}
                  {planPriceOverride && (
                    <Badge variant="secondary" className="text-xs">Custom Pricing</Badge>
                  )}
                </div>
                {plan?.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
                {!plan && <p className="text-sm text-muted-foreground">You are not currently on a subscription plan. Choose a plan below to get started.</p>}
                {plan && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-400 bg-amber-500/10">
                      <DollarSign className="h-3 w-3" />
                      {(plan as any).platformFeePercent != null
                        ? `${parseFloat(String((plan as any).platformFeePercent)).toFixed(1)}%`
                        : "0%"} service charge per job
                    </span>
                    {(plan as any).perListingFeeEnabled ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-400 bg-amber-500/10">
                        <DollarSign className="h-3 w-3" />
                        ${parseFloat(String((plan as any).perListingFeeAmount ?? "0")).toFixed(2)} per job listing
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                        No per-listing fee
                      </span>
                    )}
                  </div>
                )}
                {planStatus === "expired" && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span>Your plan has expired. Subscribe below to restore access to all features.</span>
                  </div>
                )}
                {planStatus === "trialing" && daysRemaining !== null && daysRemaining <= 3 && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Your trial ends in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}. Subscribe now to avoid service interruption.</span>
                  </div>
                )}
                {planStatus === "canceled" && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-md px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Your subscription is set to cancel at the end of the current billing period. You can resubscribe at any time.</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                {plan && (
                  <div className="text-right">
                    <p className="text-3xl font-bold text-foreground">
                      {planPriceOverride
                        ? `$${parseFloat(planPriceOverride).toFixed(0)}`
                        : `$${parseFloat(plan.priceMonthly ?? "0").toFixed(0)}`}
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                    {planPriceOverride && (
                      <p className="text-xs text-muted-foreground line-through">${parseFloat(plan.priceMonthly ?? "0").toFixed(0)}/mo standard</p>
                    )}
                  </div>
                )}
                {plan && canCancel && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        disabled={cancelSubscription.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        {cancelSubscription.isPending ? "Canceling..." : "Cancel Subscription"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Your <strong>{plan.name}</strong> subscription will remain active until the end of the current billing period. After that, your account will revert to no plan and access to paid features will be restricted. You can resubscribe at any time.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => cancelSubscription.mutate()}
                        >
                          Yes, Cancel Subscription
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>

            {/* Usage gauges */}
            {plan && usage && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-border">
                {[
                  { icon: Building2, label: "Properties", value: usage.properties, max: (plan.features as any)?.maxProperties },
                  { icon: Users, label: "Contractors", value: usage.contractors, max: (plan.features as any)?.maxContractors },
                  { icon: ClipboardList, label: "Jobs This Month", value: usage.jobsThisMonth, max: (plan.features as any)?.maxJobsPerMonth },
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
          </CardContent>
        </Card>
      )}

      {/* Payment Methods */}
      <PaymentMethodsSection />

      {/* All Available Plans */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Available Plans</h2>
            <p className="text-sm text-muted-foreground">Choose the plan that best fits your portfolio size</p>
          </div>
          {/* Billing interval toggle */}
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
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80 w-full" />)}
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
                    {/* Fee info — always shown for company plans */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-400 bg-amber-500/10">
                        <DollarSign className="h-3 w-3" />
                        {(p as any).platformFeePercent != null
                          ? `${parseFloat((p as any).platformFeePercent).toFixed(1)}%`
                          : "0%"} service charge
                      </span>
                      {(p as any).perListingFeeEnabled ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-400 bg-amber-500/10">
                          <DollarSign className="h-3 w-3" />
                          ${parseFloat((p as any).perListingFeeAmount ?? "0").toFixed(2)} per listing
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                          No listing fee
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-4">
                    {/* Limits */}
                    <div className="space-y-1 text-xs">
                      {[
                        { label: "Properties", val: features.maxProperties },
                        { label: "Contractors", val: features.maxContractors },
                        { label: "Jobs/month", val: features.maxJobsPerMonth },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex justify-between text-muted-foreground">
                          <span>{label}</span>
                          <span className="font-medium text-foreground">{val != null ? val : "Unlimited"}</span>
                        </div>
                      ))}
                    </div>
                    {/* Features */}
                    <div className="space-y-1.5">
                      {Object.entries(COMPANY_FEATURE_LABELS).map(([key, label]) => {
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
                    {/* Action button */}
                    <div className="mt-auto pt-2">
                      {isCurrent ? (
                        <Button variant="outline" className="w-full border-primary/30 text-primary" disabled>
                          <CheckCircle2 className="h-4 w-4 mr-2" /> Current Plan
                        </Button>
                      ) : hasStripePrice ? (
                        <Button
                          className="w-full"
                          variant={idx >= (activePlans.findIndex(ap => ap.id === plan?.id) ?? -1) ? "default" : "outline"}
                          disabled={checkoutLoading === p.id}
                          onClick={() => {
                            setCheckoutLoading(p.id);
                            createCheckout.mutate({ planId: p.id, billingInterval, origin: window.location.origin });
                          }}
                        >
                          {checkoutLoading === p.id ? "Loading..." : plan ? "Switch to This Plan" : "Subscribe"}
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

      {/* Stripe Subscription Invoices */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" /> Subscription Invoices
        </h2>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">Stripe Invoices</CardTitle>
            <CardDescription>Your subscription billing history from Stripe</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {invoicesLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No subscription invoices yet. They will appear here after your first billing cycle.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Invoice #</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Description</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Amount</th>
                      <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-center px-4 py-3 text-muted-foreground font-medium">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{inv.number ?? inv.id.slice(0, 12)}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(inv.created * 1000).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground max-w-[200px]">
                          <div className="truncate">{inv.description ?? "Subscription"}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(inv.periodStart * 1000).toLocaleDateString()} – {new Date(inv.periodEnd * 1000).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">
                          {fmtCents(inv.amountPaid, inv.currency)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${invoiceStatusColor(inv.status)}`}>
                            {inv.status ?? "unknown"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {inv.invoicePdf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-primary hover:text-primary"
                                onClick={() => window.open(inv.invoicePdf!, "_blank")}
                              >
                                <Download className="h-3.5 w-3.5 mr-1" />
                                PDF
                              </Button>
                            )}
                            {inv.hostedInvoiceUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => window.open(inv.hostedInvoiceUrl!, "_blank")}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
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

      {/* Job Transaction History */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Job Payment History</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { icon: DollarSign, color: "text-primary", label: "Total Billed", value: fmt(totalCharged), sub: `${txns?.length ?? 0} transactions` },
            { icon: TrendingUp, color: "text-blue-400", label: "Labor Costs", value: fmt(totalLabor), sub: null },
            { icon: FileText, color: "text-yellow-400", label: "Parts & Materials", value: fmt(totalParts), sub: null },
            { icon: CreditCard, color: "text-purple-400", label: "Platform Fees", value: fmt(totalFees), sub: null },
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

        {/* Transaction table */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">Job Transactions</CardTitle>
            <CardDescription>Click "PDF" to download an invoice for any charge</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {txnsLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !txns || txns.length === 0 ? (
              <div className="p-12 text-center">
                <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No transactions yet. Charges will appear here once jobs are paid.</p>
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
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Fee</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Total</th>
                      <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-center px-4 py-3 text-muted-foreground font-medium">Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t) => (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {t.paidAt ? new Date(t.paidAt).toLocaleDateString() : new Date(t.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground max-w-[200px]">
                          <div className="truncate font-medium">{(t as any).jobTitle ?? `Job #${t.maintenanceRequestId}`}</div>
                          {(t as any).propertyName && <div className="text-xs text-muted-foreground truncate">{(t as any).propertyName}</div>}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">{fmt(t.laborCost)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{fmt(t.partsCost)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{fmt(t.platformFee)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">{fmt(t.totalCharged)}</td>
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
                            onClick={() => window.open(`/api/invoice/${t.maintenanceRequestId}`, "_blank")}
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
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{fmt(totalLabor)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{fmt(totalParts)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-muted-foreground">{fmt(totalFees)}</td>
                      <td className="px-4 py-3 text-right font-bold text-primary">{fmt(totalCharged)}</td>
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
