import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CreditCard, Check, X, Users, Building2, Infinity, DollarSign, ClipboardList, Zap, HardHat } from "lucide-react";

// ─── Feature definitions ────────────────────────────────────────────────────
const COMPANY_FEATURE_FLAGS = [
  { key: "gpsTimeTracking", label: "GPS Time Tracking", description: "Live GPS tracking and auto clock-out" },
  { key: "aiJobClassification", label: "AI Job Classification", description: "Automatic priority and skill tier assignment" },
  { key: "expenseReports", label: "Expense Reports", description: "Monthly expense charts and CSV export" },
  { key: "contractorRatings", label: "Contractor Ratings", description: "1–5 star ratings with reviews" },
  { key: "jobComments", label: "Job Comments", description: "Threaded notes between company and contractor" },
  { key: "emailNotifications", label: "Email Notifications", description: "Transactional emails for all job events" },
  { key: "billingHistory", label: "Billing History", description: "Full transaction history and invoice downloads" },
  { key: "apiAccess", label: "API Access", description: "REST/webhook integrations (Buildium, AppFolio, etc.)" },
  { key: "customBranding", label: "Custom Branding", description: "Upload logo and set brand colors" },
  { key: "prioritySupport", label: "Priority Support", description: "Dedicated support channel with SLA" },
] as const;

const CONTRACTOR_FEATURE_FLAGS = [
  { key: "jobBoard", label: "Job Board Access", description: "Browse and accept jobs from the public job board" },
  { key: "gpsTracking", label: "GPS Tracking", description: "Clock in/out with GPS verification" },
  { key: "earningsDashboard", label: "Earnings Dashboard", description: "Monthly earnings charts and payout history" },
  { key: "receiptDownload", label: "Receipt Download", description: "PDF payment receipts for completed jobs" },
  { key: "ratingDisplay", label: "Rating Display", description: "Show star rating on job board profile" },
  { key: "multiCompany", label: "Multi-Company", description: "Work with multiple property management companies" },
  { key: "priorityJobMatching", label: "Priority Job Matching", description: "Featured placement on job board listings" },
  { key: "stripePayouts", label: "Stripe Payouts", description: "Direct bank deposit via Stripe Connect" },
  { key: "emailNotifications", label: "Email Notifications", description: "Transactional emails for job events" },
  { key: "prioritySupport", label: "Priority Support", description: "Dedicated support channel with SLA" },
] as const;

type CompanyFeatureKey = typeof COMPANY_FEATURE_FLAGS[number]["key"];
type ContractorFeatureKey = typeof CONTRACTOR_FEATURE_FLAGS[number]["key"];

// ─── Shared form types ───────────────────────────────────────────────────────
interface PlanFormState {
  name: string;
  description: string;
  priceMonthly: string;
  priceAnnual: string;
  maxItems1: string;   // maxProperties (company) | maxActiveJobs (contractor)
  maxItems2: string;   // maxContractors (company) | maxCompanies (contractor)
  maxItems3: string;   // maxJobsPerMonth (company) | unused (contractor)
  isActive: boolean;
  sortOrder: string;
  features: Record<string, boolean>;
  platformFeePercent: string;
  perListingFeeEnabled: boolean;
  perListingFeeAmount: string;
  stripePriceIdMonthly: string;
  stripePriceIdAnnual: string;
}

function defaultFeatures(flags: readonly { key: string }[]): Record<string, boolean> {
  return Object.fromEntries(flags.map(f => [f.key, false]));
}

function emptyForm(planType: "company" | "contractor"): PlanFormState {
  const flags = planType === "company" ? COMPANY_FEATURE_FLAGS : CONTRACTOR_FEATURE_FLAGS;
  return {
    name: "", description: "",
    priceMonthly: "0", priceAnnual: "0",
    maxItems1: "", maxItems2: "", maxItems3: "",
    isActive: true, sortOrder: "0",
    features: defaultFeatures(flags),
    platformFeePercent: "",
    perListingFeeEnabled: false, perListingFeeAmount: "0",
    stripePriceIdMonthly: "", stripePriceIdAnnual: "",
  };
}

function planToForm(plan: any, planType: "company" | "contractor"): PlanFormState {
  const flags = planType === "company" ? COMPANY_FEATURE_FLAGS : CONTRACTOR_FEATURE_FLAGS;
  const f = plan.features ?? {};
  return {
    name: plan.name ?? "",
    description: plan.description ?? "",
    priceMonthly: String(parseFloat(plan.priceMonthly ?? "0")),
    priceAnnual: String(parseFloat(plan.priceAnnual ?? "0")),
    maxItems1: planType === "company"
      ? (f.maxProperties != null ? String(f.maxProperties) : "")
      : (f.maxActiveJobs != null ? String(f.maxActiveJobs) : ""),
    maxItems2: planType === "company"
      ? (f.maxContractors != null ? String(f.maxContractors) : "")
      : (f.maxCompanies != null ? String(f.maxCompanies) : ""),
    maxItems3: planType === "company"
      ? (f.maxJobsPerMonth != null ? String(f.maxJobsPerMonth) : "")
      : "",
    isActive: plan.isActive ?? true,
    sortOrder: String(plan.sortOrder ?? 0),
    features: Object.fromEntries(flags.map(ff => [ff.key, f[ff.key] ?? false])),
    platformFeePercent: plan.platformFeePercent != null ? String(parseFloat(plan.platformFeePercent)) : "",
    perListingFeeEnabled: plan.perListingFeeEnabled ?? false,
    perListingFeeAmount: plan.perListingFeeAmount != null ? String(parseFloat(plan.perListingFeeAmount)) : "0",
    stripePriceIdMonthly: plan.stripePriceIdMonthly ?? "",
    stripePriceIdAnnual: plan.stripePriceIdAnnual ?? "",
  };
}

function formToMutationInput(form: PlanFormState, planType: "company" | "contractor") {
  const featuresBase: Record<string, any> = { ...form.features };
  if (planType === "company") {
    featuresBase.maxProperties = form.maxItems1 !== "" ? parseInt(form.maxItems1) || null : null;
    featuresBase.maxContractors = form.maxItems2 !== "" ? parseInt(form.maxItems2) || null : null;
    featuresBase.maxJobsPerMonth = form.maxItems3 !== "" ? parseInt(form.maxItems3) || null : null;
  } else {
    featuresBase.maxActiveJobs = form.maxItems1 !== "" ? parseInt(form.maxItems1) || null : null;
    featuresBase.maxCompanies = form.maxItems2 !== "" ? parseInt(form.maxItems2) || null : null;
  }
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    priceMonthly: parseFloat(form.priceMonthly) || 0,
    priceAnnual: parseFloat(form.priceAnnual) || 0,
    isActive: form.isActive,
    sortOrder: parseInt(form.sortOrder) || 0,
    features: featuresBase,
    platformFeePercent: form.platformFeePercent !== "" ? parseFloat(form.platformFeePercent) : null,
    perListingFeeEnabled: form.perListingFeeEnabled,
    perListingFeeAmount: parseFloat(form.perListingFeeAmount) || 0,
    stripePriceIdMonthly: form.stripePriceIdMonthly.trim() || null,
    stripePriceIdAnnual: form.stripePriceIdAnnual.trim() || null,
    planType,
  };
}

// ─── Plan Form Dialog ────────────────────────────────────────────────────────
function PlanFormDialog({
  open, onOpenChange, title, initialForm, onSubmit, isPending, planType,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string;
  initialForm: PlanFormState; onSubmit: (form: PlanFormState) => void;
  isPending: boolean; planType: "company" | "contractor";
}) {
  const [form, setForm] = useState<PlanFormState>(initialForm);
  const flags = planType === "company" ? COMPANY_FEATURE_FLAGS : CONTRACTOR_FEATURE_FLAGS;

  const handleOpenChange = (v: boolean) => { if (v) setForm(initialForm); onOpenChange(v); };
  const set = (key: keyof PlanFormState, value: any) => setForm(prev => ({ ...prev, [key]: value }));
  const toggleFeature = (key: string) =>
    setForm(prev => ({ ...prev, features: { ...prev.features, [key]: !prev.features[key] } }));

  const limit1Label = planType === "company" ? "Max Properties" : "Max Active Jobs";
  const limit2Label = planType === "company" ? "Max Contractors" : "Max Companies";
  const limit3Label = planType === "company" ? "Max Jobs/Month" : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label>Plan Name *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)}
                placeholder={planType === "company" ? "e.g. Starter, Professional, Enterprise" : "e.g. Basic, Pro, Elite"}
                className="bg-secondary border-border" />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => set("description", e.target.value)}
                placeholder="Short description shown on pricing page" className="bg-secondary border-border" />
            </div>
          </div>

          {/* Pricing */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Subscription Pricing
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Monthly Price ($)</Label>
                <Input type="number" min="0" step="0.01" value={form.priceMonthly}
                  onChange={e => set("priceMonthly", e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label>Annual Price ($)</Label>
                <Input type="number" min="0" step="0.01" value={form.priceAnnual}
                  onChange={e => set("priceAnnual", e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" min="0" value={form.sortOrder}
                  onChange={e => set("sortOrder", e.target.value)} className="bg-secondary border-border" />
              </div>
            </div>
          </div>

          {/* Transaction Fees (company plans only) */}
          {planType === "company" && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Transaction Fees
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Leave Platform Fee blank to use the global default. Per-company overrides can be set on individual profiles.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-sm">Platform Fee %</Label>
                    <p className="text-xs text-muted-foreground">Charged ON TOP of job cost.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0" max="100" step="0.1" value={form.platformFeePercent}
                      onChange={e => set("platformFeePercent", e.target.value)}
                      placeholder="Global default" className="w-28 bg-secondary border-border" />
                    <span className="text-muted-foreground text-sm">%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      <Label className="text-sm">Per-Listing Fee</Label>
                      <span className="text-xs text-muted-foreground">(charged when a job is posted)</span>
                    </div>
                    <Switch checked={form.perListingFeeEnabled} onCheckedChange={v => set("perListingFeeEnabled", v)} />
                  </div>
                  {form.perListingFeeEnabled && (
                    <div className="flex items-center gap-2 pl-6">
                      <span className="text-muted-foreground text-sm">$</span>
                      <Input type="number" min="0" step="0.01" value={form.perListingFeeAmount}
                        onChange={e => set("perListingFeeAmount", e.target.value)} className="w-28 bg-secondary border-border" />
                      <span className="text-muted-foreground text-sm">per job posted</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stripe Auto-Sync Notice */}
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-400">Stripe Auto-Sync Enabled</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When you save this plan, the platform automatically creates or updates the corresponding
                  Stripe product and prices. If you change the price, the old Stripe price is archived and
                  a new one is created — no manual Stripe dashboard changes needed.
                </p>
              </div>
            </div>
          </div>

          {/* Limits */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Usage Limits
              <span className="text-xs font-normal text-muted-foreground">(leave blank = unlimited)</span>
            </h3>
            <div className={`grid gap-3 ${limit3Label ? "grid-cols-3" : "grid-cols-2"}`}>
              <div className="space-y-2">
                <Label>{limit1Label}</Label>
                <Input type="number" min="0" value={form.maxItems1}
                  onChange={e => set("maxItems1", e.target.value)} placeholder="∞" className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label>{limit2Label}</Label>
                <Input type="number" min="0" value={form.maxItems2}
                  onChange={e => set("maxItems2", e.target.value)} placeholder="∞" className="bg-secondary border-border" />
              </div>
              {limit3Label && (
                <div className="space-y-2">
                  <Label>{limit3Label}</Label>
                  <Input type="number" min="0" value={form.maxItems3}
                    onChange={e => set("maxItems3", e.target.value)} placeholder="∞" className="bg-secondary border-border" />
                </div>
              )}
            </div>
          </div>

          {/* Feature Flags */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Feature Flags</h3>
            <div className="grid grid-cols-1 gap-2">
              {flags.map(ff => (
                <div key={ff.key} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{ff.label}</p>
                    <p className="text-xs text-muted-foreground">{ff.description}</p>
                  </div>
                  <Switch checked={!!form.features[ff.key]} onCheckedChange={() => toggleFeature(ff.key)} />
                </div>
              ))}
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Plan Active</p>
              <p className="text-xs text-muted-foreground">Inactive plans are hidden but existing assignments are preserved.</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} />
          </div>

          <Button className="w-full" disabled={!form.name.trim() || isPending} onClick={() => onSubmit(form)}>
            {isPending ? "Saving..." : "Save Plan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Plan Card ───────────────────────────────────────────────────────────────
function PlanCard({
  plan, planType, onEdit, onDelete, companiesCount,
}: {
  plan: any; planType: "company" | "contractor";
  onEdit: () => void; onDelete: () => void; companiesCount: number;
}) {
  const flags = planType === "company" ? COMPANY_FEATURE_FLAGS : CONTRACTOR_FEATURE_FLAGS;
  const f = plan.features ?? {};
  const hasFee = plan.platformFeePercent != null;
  const hasStripe = plan.stripePriceIdMonthly || plan.stripePriceIdAnnual;
  const stripeProductId = plan.stripeProductId as string | null | undefined;
  const limit1 = planType === "company" ? f.maxProperties : f.maxActiveJobs;
  const limit2 = planType === "company" ? f.maxContractors : f.maxCompanies;
  const limit3 = planType === "company" ? f.maxJobsPerMonth : null;
  const limit1Label = planType === "company" ? "properties" : "active jobs";
  const limit2Label = planType === "company" ? "contractors" : "companies";

  return (
    <Card className={`bg-card border-border ${!plan.isActive ? "opacity-60" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg text-card-foreground">{plan.name}</CardTitle>
              {!plan.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
              {hasStripe ? (
                <Badge variant="outline" className="text-xs border-green-500/30 text-green-400" title={stripeProductId ? `Stripe Product: ${stripeProductId}` : undefined}>
                  <Zap className="h-3 w-3 mr-1" /> Stripe Synced
                </Badge>
              ) : parseFloat(plan.priceMonthly ?? "0") > 0 ? (
                <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">
                  <Zap className="h-3 w-3 mr-1" /> Stripe Pending
                </Badge>
              ) : null}
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                {planType === "company" ? <Building2 className="h-3 w-3 mr-1" /> : <HardHat className="h-3 w-3 mr-1" />}
                {companiesCount} {planType === "company" ? (companiesCount === 1 ? "company" : "companies") : (companiesCount === 1 ? "contractor" : "contractors")}
              </Badge>
            </div>
            {plan.description && <CardDescription className="mt-1">{plan.description}</CardDescription>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{plan.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {companiesCount > 0
                      ? `This plan has ${companiesCount} ${planType === "company" ? "compan" : "contractor"}${companiesCount === 1 ? (planType === "company" ? "y" : "") : (planType === "company" ? "ies" : "s")} assigned. They will be unassigned but their data is preserved.`
                      : "This action cannot be undone."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pricing */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-foreground">${parseFloat(plan.priceMonthly ?? "0").toFixed(0)}</span>
            <span className="text-sm text-muted-foreground">/mo</span>
          </div>
          {parseFloat(plan.priceAnnual ?? "0") > 0 && (
            <span className="text-sm text-muted-foreground">${parseFloat(plan.priceAnnual ?? "0").toFixed(0)}/yr</span>
          )}
          {hasFee && (
            <Badge variant="secondary" className="text-xs gap-1">
              <DollarSign className="h-3 w-3" />
              {parseFloat(plan.platformFeePercent).toFixed(1)}% fee
              {plan.perListingFeeEnabled && ` + $${parseFloat(plan.perListingFeeAmount ?? "0").toFixed(2)}/listing`}
            </Badge>
          )}
        </div>

        {/* Limits */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            {planType === "company" ? <Building2 className="h-3 w-3" /> : <ClipboardList className="h-3 w-3" />}
            {limit1 != null ? limit1 : <Infinity className="h-3 w-3" />} {limit1Label}
          </span>
          <span className="flex items-center gap-1">
            {planType === "company" ? <Users className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
            {limit2 != null ? limit2 : <Infinity className="h-3 w-3" />} {limit2Label}
          </span>
          {limit3 != null && <span>{limit3} jobs/mo</span>}
        </div>

        <Separator />

        {/* Features */}
        <div className="grid grid-cols-2 gap-1">
          {flags.map(ff => (
            <div key={ff.key} className="flex items-center gap-1.5 text-xs">
              {f[ff.key] ? (
                <Check className="h-3 w-3 text-green-400 shrink-0" />
              ) : (
                <X className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              )}
              <span className={f[ff.key] ? "text-foreground" : "text-muted-foreground/60"}>{ff.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Plans Tab ───────────────────────────────────────────────────────────────
function PlansTab({ planType }: { planType: "company" | "contractor" }) {
  const utils = trpc.useUtils();
  const queryKey = planType === "company" ? "listCompanyPlans" : "listContractorPlans";
  const { data: plans, isLoading } = planType === "company"
    ? trpc.adminViewAs.listCompanyPlans.useQuery()
    : trpc.adminViewAs.listContractorPlans.useQuery();
  const { data: companiesWithPlans } = trpc.adminViewAs.companiesWithPlans.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  const invalidate = () => {
    utils.adminViewAs.listCompanyPlans.invalidate();
    utils.adminViewAs.listContractorPlans.invalidate();
    utils.adminViewAs.listPlans.invalidate();
    utils.adminViewAs.companiesWithPlans.invalidate();
  };

  const createPlan = trpc.adminViewAs.createPlan.useMutation({
    onSuccess: () => { toast.success("Plan created!"); setCreateOpen(false); invalidate(); },
    onError: err => toast.error(err.message),
  });
  const updatePlan = trpc.adminViewAs.updatePlan.useMutation({
    onSuccess: () => { toast.success("Plan updated!"); setEditOpen(false); invalidate(); },
    onError: err => toast.error(err.message),
  });
  const deletePlan = trpc.adminViewAs.deletePlan.useMutation({
    onSuccess: () => { toast.success("Plan deleted."); invalidate(); },
    onError: err => toast.error(err.message),
  });

  const countForPlan = (planId: number) => {
    if (planType === "company") {
      return (companiesWithPlans ?? []).filter((r: any) => r.company?.planId === planId).length;
    }
    // For contractor plans we don't have a direct list yet — show 0
    return 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {planType === "company"
            ? "Plans assigned to property management companies. Controls job limits, contractor limits, and platform fees."
            : "Plans assigned to individual contractors. Controls active job limits, company relationships, and feature access."}
        </p>
        <Button className="gap-2 shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Plan
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : !plans || plans.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            {planType === "company" ? <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-4" /> : <HardHat className="h-10 w-10 text-muted-foreground mx-auto mb-4" />}
            <h3 className="text-lg font-medium text-card-foreground mb-2">No {planType === "company" ? "Company" : "Contractor"} Plans Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first plan to start assigning {planType === "company" ? "companies" : "contractors"}.</p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Create First Plan</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {plans.map((plan: any) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              planType={planType}
              companiesCount={countForPlan(plan.id)}
              onEdit={() => { setEditTarget(plan); setEditOpen(true); }}
              onDelete={() => deletePlan.mutate({ id: plan.id })}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <PlanFormDialog
        open={createOpen} onOpenChange={setCreateOpen}
        title={`Create New ${planType === "company" ? "Company" : "Contractor"} Plan`}
        initialForm={emptyForm(planType)}
        onSubmit={form => createPlan.mutate(formToMutationInput(form, planType) as any)}
        isPending={createPlan.isPending} planType={planType}
      />

      {/* Edit Dialog */}
      {editTarget && (
        <PlanFormDialog
          open={editOpen} onOpenChange={setEditOpen}
          title={`Edit Plan: ${editTarget.name}`}
          initialForm={planToForm(editTarget, planType)}
          onSubmit={form => updatePlan.mutate({ id: editTarget.id, ...formToMutationInput(form, planType) as any })}
          isPending={updatePlan.isPending} planType={planType}
        />
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function AdminSubscriptionPlans() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Subscription Plans</h1>
        <p className="text-muted-foreground mt-1">
          Manage plan tiers for companies and contractors separately. Changes apply immediately to all assigned accounts.
        </p>
      </div>

      <Tabs defaultValue="company">
        <TabsList className="mb-4">
          <TabsTrigger value="company" className="gap-2">
            <Building2 className="h-4 w-4" /> Company Plans
          </TabsTrigger>
          <TabsTrigger value="contractor" className="gap-2">
            <HardHat className="h-4 w-4" /> Contractor Plans
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <PlansTab planType="company" />
        </TabsContent>
        <TabsContent value="contractor">
          <PlansTab planType="contractor" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
