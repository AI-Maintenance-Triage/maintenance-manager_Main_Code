import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { CreditCard, FileText, DollarSign, TrendingUp, Calendar, Download, Check, X, Building2, Users, ClipboardList, ArrowUpRight } from "lucide-react";

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

export default function CompanyBilling() {
  const { data: txns, isLoading } = trpc.transactions.listByCompany.useQuery();

  const totalCharged = txns?.reduce((s, t) => s + parseFloat(String(t.totalCharged ?? "0")), 0) ?? 0;
  const totalFees = txns?.reduce((s, t) => s + parseFloat(String(t.platformFee ?? "0")), 0) ?? 0;
  const totalLabor = txns?.reduce((s, t) => s + parseFloat(String(t.laborCost ?? "0")), 0) ?? 0;
  const totalParts = txns?.reduce((s, t) => s + parseFloat(String(t.partsCost ?? "0")), 0) ?? 0;

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );

  const { data: planData } = trpc.company.getMyPlan.useQuery();
  const plan = planData?.plan;
  const usage = planData?.usage;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" /> Billing
        </h1>
        <p className="text-muted-foreground mt-1">Your subscription plan and payment history</p>
      </div>

      {/* Current Plan Card */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-card-foreground flex items-center gap-2">
                Current Plan
                {plan ? (
                  <Badge className="bg-primary/20 text-primary border-primary/30">{plan.name}</Badge>
                ) : (
                  <Badge variant="secondary">No Plan Assigned</Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                {plan?.description ?? (plan ? "" : "Contact your account manager to get started with a subscription plan.")}
              </CardDescription>
            </div>
            {plan && (
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-foreground">${parseFloat(plan.priceMonthly ?? "0").toFixed(0)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                {parseFloat(plan.priceAnnual ?? "0") > 0 && (
                  <p className="text-xs text-muted-foreground">${parseFloat(plan.priceAnnual ?? "0").toFixed(0)}/yr</p>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {plan ? (
            <>
              {/* Usage gauges */}
              {usage && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Properties */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground"><Building2 className="h-3 w-3" /> Properties</span>
                      <span className="text-foreground font-medium">
                        {usage.properties}
                        {plan.features?.maxProperties != null ? ` / ${plan.features.maxProperties}` : " / ∞"}
                      </span>
                    </div>
                    {plan.features?.maxProperties != null ? (
                      <Progress value={Math.min(100, (usage.properties / plan.features.maxProperties) * 100)}
                        className="h-1.5" />
                    ) : (
                      <div className="h-1.5 rounded-full bg-secondary flex items-center justify-end pr-1">
                        <span className="text-[9px] text-muted-foreground">∞</span>
                      </div>
                    )}
                  </div>
                  {/* Contractors */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground"><Users className="h-3 w-3" /> Contractors</span>
                      <span className="text-foreground font-medium">
                        {usage.contractors}
                        {plan.features?.maxContractors != null ? ` / ${plan.features.maxContractors}` : " / ∞"}
                      </span>
                    </div>
                    {plan.features?.maxContractors != null ? (
                      <Progress value={Math.min(100, (usage.contractors / plan.features.maxContractors) * 100)}
                        className="h-1.5" />
                    ) : (
                      <div className="h-1.5 rounded-full bg-secondary flex items-center justify-end pr-1">
                        <span className="text-[9px] text-muted-foreground">∞</span>
                      </div>
                    )}
                  </div>
                  {/* Jobs this month */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground"><ClipboardList className="h-3 w-3" /> Jobs This Month</span>
                      <span className="text-foreground font-medium">
                        {usage.jobsThisMonth}
                        {plan.features?.maxJobsPerMonth != null ? ` / ${plan.features.maxJobsPerMonth}` : " / ∞"}
                      </span>
                    </div>
                    {plan.features?.maxJobsPerMonth != null ? (
                      <Progress value={Math.min(100, (usage.jobsThisMonth / plan.features.maxJobsPerMonth) * 100)}
                        className="h-1.5" />
                    ) : (
                      <div className="h-1.5 rounded-full bg-secondary flex items-center justify-end pr-1">
                        <span className="text-[9px] text-muted-foreground">∞</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Feature list */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Included features</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {Object.entries(COMPANY_FEATURE_LABELS).map(([key, label]) => {
                    const enabled = (plan.features as any)?.[key] ?? false;
                    return (
                      <div key={key} className="flex items-center gap-1.5 text-xs">
                        {enabled ? (
                          <Check className="h-3 w-3 text-green-400 shrink-0" />
                        ) : (
                          <X className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                        )}
                        <span className={enabled ? "text-foreground" : "text-muted-foreground/60"}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Upgrade CTA */}
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Need more capacity or features?</p>
                  <p className="text-xs text-muted-foreground">Contact your account manager to upgrade your plan.</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2 border-primary/30 text-primary hover:bg-primary/10 shrink-0"
                  onClick={() => window.open("mailto:support@example.com?subject=Plan Upgrade Request", "_blank")}>
                  <ArrowUpRight className="h-4 w-4" /> Contact Us
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">No subscription plan is currently assigned to your account.</p>
              <Button variant="outline" className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => window.open("mailto:support@example.com?subject=Subscription Plan Inquiry", "_blank")}>
                <ArrowUpRight className="h-4 w-4" /> Contact Us to Get Started
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Billed</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{fmt(totalCharged)}</p>
            <p className="text-xs text-muted-foreground mt-1">{txns?.length ?? 0} transactions</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Labor Costs</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{fmt(totalLabor)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-yellow-400" />
              <span className="text-xs text-muted-foreground">Parts & Materials</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{fmt(totalParts)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">Platform Fees</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{fmt(totalFees)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Transactions</CardTitle>
          <CardDescription>Click "Invoice" to download a PDF invoice for any charge</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!txns || txns.length === 0 ? (
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
                        <div className="truncate font-medium">{t.jobTitle ?? `Job #${t.maintenanceRequestId}`}</div>
                        {t.propertyName && <div className="text-xs text-muted-foreground truncate">{t.propertyName}</div>}
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
  );
}
