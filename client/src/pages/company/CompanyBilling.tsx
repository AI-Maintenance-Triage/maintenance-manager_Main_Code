import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  CreditCard, FileText, DollarSign, TrendingUp, Calendar, Download,
  Check, X, Building2, Users, ClipboardList, ArrowUpRight, Zap,
  Star, Shield, Crown, CheckCircle2, AlertCircle, XCircle,
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

export default function CompanyBilling() {
  const [, setLocation] = useLocation();
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<number | null>(null);

  const { data: txns, isLoading: txnsLoading } = trpc.transactions.listByCompany.useQuery();
  const { data: planData, isLoading: planLoading } = trpc.company.getMyPlan.useQuery();
  const { data: availablePlans, isLoading: plansLoading } = trpc.company.listAvailablePlans.useQuery();

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

  const cancelSubscription = trpc.stripePayments.cancelPlanSubscription.useMutation({
    onSuccess: (data) => {
      toast.success("Subscription canceled", { description: data.message });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Handle success/cancel redirects from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sub = params.get("subscription");
    if (sub === "success") {
      toast.success("Subscription activated!", { description: "Your plan has been updated. It may take a moment to reflect." });
      setLocation("/company/billing", { replace: true });
    } else if (sub === "canceled") {
      toast.info("Checkout canceled", { description: "No changes were made." });
      setLocation("/company/billing", { replace: true });
    }
  }, []);

  const plan = planData?.plan;
  const usage = planData?.usage;
  const planPriceOverride = planData?.planPriceOverride;
  const planStatus = planData?.planStatus ?? null;
  const daysRemaining = planData?.daysRemaining ?? null;

  const totalCharged = txns?.reduce((s, t) => s + parseFloat(String(t.totalCharged ?? "0")), 0) ?? 0;
  const totalFees = txns?.reduce((s, t) => s + parseFloat(String(t.platformFee ?? "0")), 0) ?? 0;
  const totalLabor = txns?.reduce((s, t) => s + parseFloat(String(t.laborCost ?? "0")), 0) ?? 0;
  const totalParts = txns?.reduce((s, t) => s + parseFloat(String(t.partsCost ?? "0")), 0) ?? 0;

  const activePlans = (availablePlans ?? []).filter((p) => p.isActive).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" /> Billing & Subscription
        </h1>
        <p className="text-muted-foreground mt-1">Manage your subscription plan and view payment history</p>
      </div>

      {/* Current Plan Summary */}
      {(planLoading) ? (
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
                  {planPriceOverride && (
                    <Badge variant="secondary" className="text-xs">Custom Pricing</Badge>
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
                    <span>Your trial ends in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}. Subscribe now to avoid service interruption.</span>
                  </div>
                )}
              </div>
              {plan && (
                <div className="text-right shrink-0">
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

      {/* All Available Plans */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Available Plans</h2>
            <p className="text-sm text-muted-foreground">Choose the plan that fits your business</p>
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
                    {/* Fee info */}
                    {((p as any).platformFeePercent != null || (p as any).perListingFeeEnabled) && (
                      <div className="mt-2 space-y-0.5">
                        {(p as any).platformFeePercent != null && (
                          <p className="text-xs text-muted-foreground">Platform fee: {parseFloat((p as any).platformFeePercent).toFixed(1)}%</p>
                        )}
                        {(p as any).perListingFeeEnabled && (
                          <p className="text-xs text-muted-foreground">Per-listing fee: ${parseFloat((p as any).perListingFeeAmount ?? "0").toFixed(2)}</p>
                        )}
                      </div>
                    )}
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

      {/* Summary cards */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Payment History</h2>
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
            <CardTitle className="text-card-foreground">Transactions</CardTitle>
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
                        <td className="px-4 py-3 text-right text-foreground">{fmt(t.partsCost)}</td>
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
