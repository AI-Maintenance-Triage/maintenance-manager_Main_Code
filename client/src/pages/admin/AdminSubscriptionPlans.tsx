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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CreditCard, Check, X, Users, Building2, Infinity } from "lucide-react";

// ─── Feature definitions ────────────────────────────────────────────────────
const FEATURE_FLAGS = [
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

type FeatureKey = typeof FEATURE_FLAGS[number]["key"];

interface PlanFormState {
  name: string;
  description: string;
  priceMonthly: string;
  priceAnnual: string;
  maxProperties: string;
  maxContractors: string;
  maxJobsPerMonth: string;
  isActive: boolean;
  sortOrder: string;
  features: Record<FeatureKey, boolean>;
}

const defaultFeatures = (): Record<FeatureKey, boolean> =>
  Object.fromEntries(FEATURE_FLAGS.map(f => [f.key, false])) as Record<FeatureKey, boolean>;

const emptyForm = (): PlanFormState => ({
  name: "",
  description: "",
  priceMonthly: "0",
  priceAnnual: "0",
  maxProperties: "",
  maxContractors: "",
  maxJobsPerMonth: "",
  isActive: true,
  sortOrder: "0",
  features: defaultFeatures(),
});

function planToForm(plan: any): PlanFormState {
  const f = plan.features ?? {};
  return {
    name: plan.name ?? "",
    description: plan.description ?? "",
    priceMonthly: String(parseFloat(plan.priceMonthly ?? "0")),
    priceAnnual: String(parseFloat(plan.priceAnnual ?? "0")),
    maxProperties: f.maxProperties != null ? String(f.maxProperties) : "",
    maxContractors: f.maxContractors != null ? String(f.maxContractors) : "",
    maxJobsPerMonth: f.maxJobsPerMonth != null ? String(f.maxJobsPerMonth) : "",
    isActive: plan.isActive ?? true,
    sortOrder: String(plan.sortOrder ?? 0),
    features: Object.fromEntries(
      FEATURE_FLAGS.map(ff => [ff.key, f[ff.key] ?? false])
    ) as Record<FeatureKey, boolean>,
  };
}

function formToMutationInput(form: PlanFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    priceMonthly: parseFloat(form.priceMonthly) || 0,
    priceAnnual: parseFloat(form.priceAnnual) || 0,
    isActive: form.isActive,
    sortOrder: parseInt(form.sortOrder) || 0,
    features: {
      ...form.features,
      maxProperties: form.maxProperties !== "" ? parseInt(form.maxProperties) || null : null,
      maxContractors: form.maxContractors !== "" ? parseInt(form.maxContractors) || null : null,
      maxJobsPerMonth: form.maxJobsPerMonth !== "" ? parseInt(form.maxJobsPerMonth) || null : null,
    },
  };
}

// ─── Plan Form Dialog ────────────────────────────────────────────────────────
function PlanFormDialog({
  open,
  onOpenChange,
  title,
  initialForm,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initialForm: PlanFormState;
  onSubmit: (form: PlanFormState) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<PlanFormState>(initialForm);

  // Reset when dialog opens with new initial data
  const handleOpenChange = (v: boolean) => {
    if (v) setForm(initialForm);
    onOpenChange(v);
  };

  const set = (key: keyof PlanFormState, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const toggleFeature = (key: FeatureKey) =>
    setForm(prev => ({ ...prev, features: { ...prev.features, [key]: !prev.features[key] } }));

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
              <Input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="e.g. Starter, Professional, Enterprise"
                className="bg-secondary border-border"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={e => set("description", e.target.value)}
                placeholder="Short description shown on pricing page"
                className="bg-secondary border-border"
              />
            </div>
          </div>

          {/* Pricing */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Pricing
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Monthly Price ($)</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={form.priceMonthly}
                  onChange={e => set("priceMonthly", e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Annual Price ($)</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={form.priceAnnual}
                  onChange={e => set("priceAnnual", e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number" min="0"
                  value={form.sortOrder}
                  onChange={e => set("sortOrder", e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
            </div>
          </div>

          {/* Limits */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Usage Limits
              <span className="text-xs font-normal text-muted-foreground">(leave blank = unlimited)</span>
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Max Properties</Label>
                <Input
                  type="number" min="0"
                  value={form.maxProperties}
                  onChange={e => set("maxProperties", e.target.value)}
                  placeholder="∞"
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Contractors</Label>
                <Input
                  type="number" min="0"
                  value={form.maxContractors}
                  onChange={e => set("maxContractors", e.target.value)}
                  placeholder="∞"
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Jobs/Month</Label>
                <Input
                  type="number" min="0"
                  value={form.maxJobsPerMonth}
                  onChange={e => set("maxJobsPerMonth", e.target.value)}
                  placeholder="∞"
                  className="bg-secondary border-border"
                />
              </div>
            </div>
          </div>

          {/* Feature Flags */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Feature Flags</h3>
            <div className="grid grid-cols-1 gap-2">
              {FEATURE_FLAGS.map(ff => (
                <div key={ff.key} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{ff.label}</p>
                    <p className="text-xs text-muted-foreground">{ff.description}</p>
                  </div>
                  <Switch
                    checked={form.features[ff.key]}
                    onCheckedChange={() => toggleFeature(ff.key)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Plan Active</p>
              <p className="text-xs text-muted-foreground">Inactive plans are hidden from the pricing page</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} />
          </div>

          <Button
            className="w-full"
            disabled={!form.name.trim() || isPending}
            onClick={() => onSubmit(form)}
          >
            {isPending ? "Saving..." : "Save Plan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function AdminSubscriptionPlans() {
  const utils = trpc.useUtils();
  const { data: plans, isLoading } = trpc.adminViewAs.listPlans.useQuery();
  const { data: companiesWithPlans } = trpc.adminViewAs.companiesWithPlans.useQuery();

  // Create
  const [createOpen, setCreateOpen] = useState(false);
  const createPlan = trpc.adminViewAs.createPlan.useMutation({
    onSuccess: () => {
      toast.success("Plan created!");
      setCreateOpen(false);
      utils.adminViewAs.listPlans.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  // Edit
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const updatePlan = trpc.adminViewAs.updatePlan.useMutation({
    onSuccess: () => {
      toast.success("Plan updated! All companies on this plan see the changes immediately.");
      setEditOpen(false);
      utils.adminViewAs.listPlans.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  // Delete
  const deletePlan = trpc.adminViewAs.deletePlan.useMutation({
    onSuccess: () => {
      toast.success("Plan deleted. Companies on this plan have been unassigned.");
      utils.adminViewAs.listPlans.invalidate();
      utils.adminViewAs.companiesWithPlans.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const openEdit = (plan: any) => {
    setEditTarget(plan);
    setEditOpen(true);
  };

  // Count companies per plan
  const companiesPerPlan = (planId: number) =>
    (companiesWithPlans ?? []).filter((row: any) => row.company?.planId === planId).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subscription Plans</h1>
          <p className="text-muted-foreground mt-1">
            Global plan tiers — changes apply immediately to all companies on that plan.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Plan
        </Button>
      </div>

      {/* Plans list */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : !plans || plans.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-card-foreground mb-2">No Plans Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first subscription plan to start assigning companies.
            </p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Create First Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {plans.map((plan: any) => {
            const f = plan.features ?? {};
            const activeFeatures = FEATURE_FLAGS.filter(ff => f[ff.key]);
            const count = companiesPerPlan(plan.id);
            return (
              <Card key={plan.id} className={`bg-card border-border ${!plan.isActive ? "opacity-60" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg text-card-foreground">{plan.name}</CardTitle>
                        {!plan.isActive && (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                        <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                          <Building2 className="h-3 w-3 mr-1" />
                          {count} {count === 1 ? "company" : "companies"}
                        </Badge>
                      </div>
                      {plan.description && (
                        <CardDescription className="mt-1">{plan.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(plan)}>
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
                              {count > 0
                                ? `This plan has ${count} ${count === 1 ? "company" : "companies"} assigned. They will be unassigned (no plan) but their data is preserved.`
                                : "This action cannot be undone."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletePlan.mutate({ id: plan.id })}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Pricing */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">
                        ${parseFloat(plan.priceMonthly ?? "0").toFixed(0)}
                      </span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </div>
                    {parseFloat(plan.priceAnnual ?? "0") > 0 && (
                      <div className="flex items-baseline gap-1 text-muted-foreground">
                        <span className="text-sm">${parseFloat(plan.priceAnnual ?? "0").toFixed(0)}/yr</span>
                      </div>
                    )}
                  </div>

                  {/* Limits */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {f.maxProperties != null ? f.maxProperties : <Infinity className="h-3 w-3" />} properties
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {f.maxContractors != null ? f.maxContractors : <Infinity className="h-3 w-3" />} contractors
                    </span>
                    {f.maxJobsPerMonth != null && (
                      <span>{f.maxJobsPerMonth} jobs/mo</span>
                    )}
                  </div>

                  <Separator />

                  {/* Features */}
                  <div className="grid grid-cols-2 gap-1">
                    {FEATURE_FLAGS.map(ff => (
                      <div key={ff.key} className="flex items-center gap-1.5 text-xs">
                        {f[ff.key] ? (
                          <Check className="h-3 w-3 text-green-400 shrink-0" />
                        ) : (
                          <X className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                        )}
                        <span className={f[ff.key] ? "text-foreground" : "text-muted-foreground/60"}>
                          {ff.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Companies without a plan */}
      {companiesWithPlans && companiesWithPlans.filter((r: any) => !r.company?.planId).length > 0 && (
        <Card className="bg-card border-border border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Companies Without a Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {companiesWithPlans
                .filter((r: any) => !r.company?.planId)
                .map((r: any) => (
                  <Badge key={r.company.id} variant="secondary" className="text-xs">
                    {r.company.name}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <PlanFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create New Plan"
        initialForm={emptyForm()}
        onSubmit={form => createPlan.mutate(formToMutationInput(form))}
        isPending={createPlan.isPending}
      />

      {/* Edit Dialog */}
      {editTarget && (
        <PlanFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          title={`Edit Plan: ${editTarget.name}`}
          initialForm={planToForm(editTarget)}
          onSubmit={form => updatePlan.mutate({ id: editTarget.id, ...formToMutationInput(form) })}
          isPending={updatePlan.isPending}
        />
      )}
    </div>
  );
}
