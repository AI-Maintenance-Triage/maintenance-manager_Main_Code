import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useViewAs } from "@/contexts/ViewAsContext";
import { Plus, Zap, Clock, CheckCircle, AlertTriangle, Globe, X, Route, DollarSign, FileDown, Star, MessageSquare, ChevronDown, ChevronUp, Lock, Unlock, Pencil, MoreVertical, Trash2, Edit, History } from "lucide-react";
import { useState } from "react";
import { JobCostBreakdown } from "@/components/JobCostBreakdown";
import { toast } from "sonner";
import { RouteReplayDialog } from "@/components/RouteReplayDialog";
import { RateContractorDialog } from "@/components/RateContractorDialog";
import { JobComments } from "@/components/JobComments";

const priorityColors: Record<string, string> = {
  emergency: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-green-500/20 text-green-400 border-green-500/30",
};

const statusIcons: Record<string, React.ReactNode> = {
  open: <Clock className="h-3.5 w-3.5" />,
  assigned: <Zap className="h-3.5 w-3.5" />,
  in_progress: <Zap className="h-3.5 w-3.5" />,
  pending_verification: <Clock className="h-3.5 w-3.5 text-orange-400" />,
  completed: <CheckCircle className="h-3.5 w-3.5" />,
  verified: <CheckCircle className="h-3.5 w-3.5 text-blue-400" />,
  payment_pending_ach: <Clock className="h-3.5 w-3.5 text-yellow-400" />,
  paid: <CheckCircle className="h-3.5 w-3.5 text-green-400" />,
};

// Statuses where the job can still be edited/deleted
const EDITABLE_STATUSES = ["open"];

// Filter tab definitions — "paid" tab shows both verified and paid
const FILTER_TABS: { label: string; value: string; queryStatus: string | string[] | undefined }[] = [
  { label: "All", value: "all", queryStatus: undefined },
  { label: "Open", value: "open", queryStatus: "open" },
  { label: "Assigned", value: "assigned", queryStatus: "assigned" },
  { label: "In Progress", value: "in_progress", queryStatus: "in_progress" },
  { label: "Pending Review", value: "pending_verification", queryStatus: "pending_verification" },
  { label: "Completed", value: "completed", queryStatus: "completed" },
  { label: "Paid", value: "paid", queryStatus: ["verified", "paid", "payment_pending_ach"] },
];

// Priority filter chips
const PRIORITY_FILTERS: { label: string; value: string | null; chipClass: string }[] = [
  { label: "All Priorities", value: null, chipClass: "border-border text-muted-foreground hover:bg-muted/50" },
  { label: "Low", value: "low", chipClass: "border-green-500/40 text-green-400 bg-green-500/10 hover:bg-green-500/20" },
  { label: "Medium", value: "medium", chipClass: "border-yellow-500/40 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20" },
  { label: "High", value: "high", chipClass: "border-orange-500/40 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20" },
  { label: "Emergency", value: "emergency", chipClass: "border-red-500/40 text-red-400 bg-red-500/10 hover:bg-red-500/20" },
];

// Change history type labels
const CHANGE_TYPE_LABELS: Record<string, string> = {
  priority_override: "Priority changed",
  skill_tier_override: "Skill tier changed",
  status_change: "Status changed",
  visibility_change: "Visibility changed",
};

function ChangeHistoryPanel({ jobId }: { jobId: number }) {
  const { data: history, isLoading } = trpc.jobs.changeHistory.useQuery({ jobId });

  if (isLoading) {
    return (
      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground italic">No changes recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className="space-y-2">
        {history.map((entry: any) => (
          <div key={entry.id} className="flex items-start gap-2 text-xs">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{entry.userName ?? "Unknown"}</span>
                {" "}{CHANGE_TYPE_LABELS[entry.changeType] ?? entry.changeType}:{" "}
                {entry.fromValue && (
                  <>
                    <span className="line-through text-muted-foreground/60">{entry.fromValue}</span>
                    {" → "}
                  </>
                )}
                <span className="font-medium text-foreground">{entry.toValue}</span>
              </span>
              {entry.note && (
                <span className="text-muted-foreground/70 ml-1">— {entry.note}</span>
              )}
              <span className="text-muted-foreground/50 ml-2">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CompanyJobs() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const isAdmin = user?.role === "admin";
  const isViewingAsCompany = isAdmin && viewAs.mode === "company" && viewAs.companyId;

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [activePriority, setActivePriority] = useState<string | null>(null);
  const [replayJob, setReplayJob] = useState<{ id: number; title: string } | null>(null);
  const [rateJob, setRateJob] = useState<{ id: number; contractorName?: string } | null>(null);
  const [commentsJob, setCommentsJob] = useState<{ id: number; title: string } | null>(null);
  const [expandedBreakdown, setExpandedBreakdown] = useState<number | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);

  // Edit / delete state
  const [editJob, setEditJob] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [deleteConfirmJob, setDeleteConfirmJob] = useState<any | null>(null);

  const utils = trpc.useUtils();

  const currentTab = FILTER_TABS.find(t => t.value === activeTab) ?? FILTER_TABS[0];

  // Use adminViewAs for admin impersonation, regular for company admin
  const regularJobs = trpc.jobs.list.useQuery(
    currentTab.queryStatus !== undefined ? { status: currentTab.queryStatus as any } : {},
    { enabled: !isViewingAsCompany }
  );
  const viewAsJobs = trpc.adminViewAs.companyJobs.useQuery(
    { companyId: viewAs.companyId!, status: currentTab.queryStatus as any },
    { enabled: !!isViewingAsCompany }
  );

  const allJobs = isViewingAsCompany ? viewAsJobs.data : regularJobs.data;
  const isLoading = isViewingAsCompany ? viewAsJobs.isLoading : regularJobs.isLoading;

  // Client-side priority filter
  const jobs = activePriority
    ? allJobs?.filter((job: any) => {
        const effective = job.overridePriority ?? job.aiPriority;
        return effective === activePriority;
      })
    : allJobs;

  const regularProperties = trpc.properties.list.useQuery(undefined, { enabled: !isViewingAsCompany });
  const viewAsProperties = trpc.adminViewAs.companyProperties.useQuery(
    { companyId: viewAs.companyId! },
    { enabled: !!isViewingAsCompany }
  );
  const properties = isViewingAsCompany ? viewAsProperties.data : regularProperties.data;

  // Skill tiers for override dropdown
  const skillTiers = trpc.skillTiers.list.useQuery(undefined, { enabled: !isViewingAsCompany });

  const [form, setForm] = useState({
    propertyId: "", title: "", description: "", tenantName: "", tenantPhone: "", unitNumber: "",
  });

  const invalidateJobs = () => {
    utils.jobs.list.invalidate();
    utils.adminViewAs.companyJobs.invalidate();
  };

  const postToBoard = trpc.jobBoard.post.useMutation({
    onSuccess: () => { toast.success("Job posted to the contractor board!"); invalidateJobs(); },
    onError: (err: any) => toast.error(err.message),
  });

  const removeFromBoard = trpc.jobBoard.remove.useMutation({
    onSuccess: () => { toast.success("Job removed from the board."); invalidateJobs(); },
    onError: (err: any) => toast.error(err.message),
  });

  const setVisibility = trpc.jobBoard.setVisibility.useMutation({
    onSuccess: (_data: any, vars: any) => {
      toast.success(vars.visibility === "private" ? "Job moved to Private Board (trusted contractors only)." : "Job moved to Public Board.");
      invalidateJobs();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const overridePriority = trpc.jobs.overridePriority.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Priority updated${data.newHourlyRate ? ` — new rate: $${data.newHourlyRate}/hr` : ''}.`);
      invalidateJobs();
      // Refresh change history if open
      utils.jobs.changeHistory.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const overrideSkillTier = trpc.jobs.overrideSkillTier.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Skill tier updated to "${data.tierName}" — new rate: $${data.newHourlyRate}/hr.`);
      invalidateJobs();
      utils.jobs.changeHistory.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateJob = trpc.jobs.updateJob.useMutation({
    onSuccess: () => {
      toast.success("Job updated successfully.");
      setEditJob(null);
      invalidateJobs();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteJob = trpc.jobs.deleteJob.useMutation({
    onSuccess: () => {
      toast.success("Job deleted.");
      setDeleteConfirmJob(null);
      invalidateJobs();
      utils.company.dashboardStats.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createJob = trpc.jobs.create.useMutation({
    onSuccess: () => {
      toast.success("Job created and AI classification started!");
      invalidateJobs();
      utils.company.dashboardStats.invalidate();
      setOpen(false);
      setForm({ propertyId: "", title: "", description: "", tenantName: "", tenantPhone: "", unitNumber: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openEditDialog = (job: any) => {
    setEditJob(job);
    setEditForm({
      title: job.title ?? "",
      description: job.description ?? "",
      propertyId: job.propertyId ? String(job.propertyId) : "",
      tenantName: job.tenantName ?? "",
      tenantPhone: job.tenantPhone ?? "",
      tenantEmail: job.tenantEmail ?? "",
      notes: job.notes ?? "",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Maintenance Jobs</h1>
          <p className="text-muted-foreground mt-1">
            {isViewingAsCompany ? `Managing jobs for ${viewAs.companyName}` : "Manage maintenance requests across your properties"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Job</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-card">
            <DialogHeader>
              <DialogTitle className="text-card-foreground">Create Maintenance Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Property</Label>
                <Select value={form.propertyId} onValueChange={(v) => setForm({ ...form, propertyId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>
                    {properties?.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name} — {p.address}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input placeholder="e.g. Water leaking under kitchen sink" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea placeholder="Describe the issue in detail..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tenant Name</Label>
                  <Input placeholder="John Doe" value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Unit #</Label>
                  <Input placeholder="e.g. 2B" value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tenant Phone</Label>
                <Input placeholder="(555) 123-4567" value={form.tenantPhone} onChange={(e) => setForm({ ...form, tenantPhone: e.target.value })} />
              </div>
              <Button
                onClick={() => createJob.mutate({
                  propertyId: Number(form.propertyId), title: form.title, description: form.description,
                  tenantName: form.tenantName || undefined, tenantPhone: form.tenantPhone || undefined, unitNumber: form.unitNumber || undefined,
                })}
                disabled={!form.propertyId || !form.title || !form.description || createJob.isPending}
                className="w-full"
              >
                {createJob.isPending ? "Creating & Classifying..." : "Create Job"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={activeTab === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Priority filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium mr-1">Priority:</span>
        {PRIORITY_FILTERS.map((pf) => (
          <button
            key={pf.value ?? "all"}
            onClick={() => setActivePriority(pf.value)}
            className={`px-3 py-1 rounded-full border text-xs font-medium transition-all ${pf.chipClass} ${
              activePriority === pf.value
                ? "ring-2 ring-offset-1 ring-offset-background ring-current opacity-100"
                : "opacity-70 hover:opacity-100"
            }`}
          >
            {pf.label}
            {activePriority === pf.value && pf.value !== null && (
              <span className="ml-1 opacity-70">
                ({allJobs?.filter((j: any) => (j.overridePriority ?? j.aiPriority) === pf.value).length ?? 0})
              </span>
            )}
          </button>
        ))}
        {activePriority && (
          <button
            onClick={() => setActivePriority(null)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 ml-1"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !jobs || jobs.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {activePriority
                ? `No ${activePriority} priority jobs${activeTab !== "all" ? ` with status "${currentTab.label}"` : ""}.`
                : activeTab === "all"
                ? "No maintenance jobs found. Create your first job to get started."
                : `No jobs with status "${currentTab.label}".`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: any) => {
            const laborCost = parseFloat(job.totalLaborCost ?? "0");
            const partsCost = parseFloat(job.totalPartsCost ?? "0");
            const totalCost = laborCost + partsCost;
            const isPaid = job.status === "paid" || job.status === "verified" || job.status === "payment_pending_ach";
            const isBreakdownOpen = expandedBreakdown === job.id;
            const isHistoryOpen = expandedHistory === job.id;
            const isEditable = EDITABLE_STATUSES.includes(job.status);
            const effectivePriority = job.overridePriority ?? job.aiPriority;
            const hasHistory = !!(job.overridePriority || job.overrideSkillTierId);

            return (
              <Card key={job.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-card-foreground truncate">{job.title}</h3>
                        {effectivePriority === 'emergency' && <Badge variant="destructive" className="text-xs">Emergency</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{job.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {/* Effective priority badge */}
                        {effectivePriority && (
                          <span className={`px-2 py-0.5 rounded-full border ${priorityColors[effectivePriority] || ""}`}>
                            {job.overridePriority ? (
                              <span className="flex items-center gap-1">
                                <Pencil className="h-2.5 w-2.5" />
                                {job.overridePriority} priority
                              </span>
                            ) : (
                              <>{job.aiPriority} priority</>
                            )}
                          </span>
                        )}
                        {/* Priority override dropdown — only on open/assigned/in_progress jobs */}
                        {(job.status === "open" || job.status === "assigned" || job.status === "in_progress") && (
                          <Select
                            value={job.overridePriority ?? job.aiPriority ?? ""}
                            onValueChange={(val) => overridePriority.mutate({ jobId: job.id, priority: val as any })}
                          >
                            <SelectTrigger className="h-5 text-xs border-border/50 bg-transparent w-auto px-1.5 gap-1 [&>svg]:h-3 [&>svg]:w-3">
                              <SelectValue placeholder="Set priority" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low"><span className="text-green-400">● Low</span></SelectItem>
                              <SelectItem value="medium"><span className="text-yellow-400">● Medium</span></SelectItem>
                              <SelectItem value="high"><span className="text-orange-400">● High</span></SelectItem>
                              <SelectItem value="emergency"><span className="text-red-400">● Emergency</span></SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {/* Effective skill tier name */}
                        {(job.effectiveSkillTierName || job.aiSkillTier) && (
                          <span className="text-primary">
                            {job.effectiveSkillTierName || job.aiSkillTier}
                            {job.overridePriority && job.effectiveSkillTierName !== job.aiSkillTier && (
                              <span className="text-muted-foreground ml-1">(AI: {job.aiSkillTier})</span>
                            )}
                          </span>
                        )}
                        {/* Skill tier override dropdown — only on open/assigned/in_progress jobs */}
                        {(job.status === "open" || job.status === "assigned" || job.status === "in_progress") && skillTiers.data && skillTiers.data.length > 0 && (
                          <Select
                            value={job.overrideSkillTierId ? String(job.overrideSkillTierId) : (job.skillTierId ? String(job.skillTierId) : "")}
                            onValueChange={(val) => overrideSkillTier.mutate({ jobId: job.id, skillTierId: Number(val) })}
                          >
                            <SelectTrigger className="h-5 text-xs border-border/50 bg-transparent w-auto px-1.5 gap-1 [&>svg]:h-3 [&>svg]:w-3 max-w-[130px]">
                              <SelectValue placeholder="Set tier" />
                            </SelectTrigger>
                            <SelectContent>
                              {skillTiers.data.map((tier: any) => (
                                <SelectItem key={tier.id} value={String(tier.id)}>
                                  {tier.name} — ${tier.hourlyRate}/hr
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {/* Hourly rate */}
                        {job.hourlyRate && (
                          <span className={(job.overridePriority || job.overrideSkillTierId) ? "text-amber-400 font-medium" : ""}>
                            ${job.hourlyRate}/hr
                            {(job.overridePriority || job.overrideSkillTierId) && <span className="text-muted-foreground ml-0.5">(updated)</span>}
                          </span>
                        )}
                        {job.tenantName && <span>Tenant: {job.tenantName}</span>}
                        {/* Show final cost on paid/verified jobs */}
                        {isPaid && totalCost > 0 && (
                          <span className="flex items-center gap-0.5 text-green-400 font-medium">
                            <DollarSign className="h-3 w-3" />{totalCost.toFixed(2)} total
                          </span>
                        )}
                      </div>
                      {job.aiReasoning && (
                        <p className="text-xs text-muted-foreground/70 mt-2 italic">AI: {job.aiReasoning}</p>
                      )}
                      {/* Change History toggle — shown when there are overrides */}
                      {hasHistory && (
                        <button
                          onClick={() => setExpandedHistory(isHistoryOpen ? null : job.id)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
                        >
                          <History className="h-3 w-3" />
                          {isHistoryOpen ? "Hide" : "Change History"}
                          {isHistoryOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      )}
                      {/* Change History panel */}
                      {isHistoryOpen && <ChangeHistoryPanel jobId={job.id} />}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {statusIcons[job.status]}
                          <span className="capitalize">{job.status.replace(/_/g, " ")}</span>
                        </span>
                        {/* 3-dot menu — only for open jobs */}
                        {isEditable && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem onClick={() => openEditDialog(job)} className="gap-2 cursor-pointer">
                                <Edit className="h-3.5 w-3.5" /> Edit Job
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteConfirmJob(job)}
                                className="gap-2 cursor-pointer text-red-400 focus:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete Job
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      {/* View Route button for completed/verified/paid jobs */}
                      {(job.status === "completed" || job.status === "verified" || job.status === "paid") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1 h-7 border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                          onClick={() => setReplayJob({ id: job.id, title: job.title })}
                        >
                          <Route className="h-3 w-3" /> View Route
                        </Button>
                      )}
                      {/* ACH pending notice */}
                      {job.status === "payment_pending_ach" && (
                        <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1 max-w-[180px] text-center">
                          <Clock className="h-3 w-3 shrink-0" />
                          ACH settling (1–3 days)
                        </span>
                      )}
                      {/* Download Invoice button for verified/paid jobs */}
                      {(job.status === "verified" || job.status === "paid" || job.status === "payment_pending_ach") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1 h-7 border-green-500/40 text-green-400 hover:bg-green-500/10"
                          onClick={() => {
                            const link = document.createElement("a");
                            link.href = `/api/invoice/${job.id}`;
                            link.download = `invoice-job-${job.id}.pdf`;
                            link.click();
                          }}
                        >
                          <FileDown className="h-3 w-3" /> Invoice
                        </Button>
                      )}
                      {/* Cost Breakdown toggle for paid/verified jobs */}
                      {isPaid && totalCost > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs gap-1 h-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setExpandedBreakdown(isBreakdownOpen ? null : job.id)}
                        >
                          {isBreakdownOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {isBreakdownOpen ? "Hide" : "Breakdown"}
                        </Button>
                      )}
                      {/* Rate contractor button for paid/verified jobs */}
                      {(job.status === "verified" || job.status === "paid") && job.assignedContractorId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1 h-7 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                          onClick={() => setRateJob({ id: job.id })}
                        >
                          <Star className="h-3 w-3" /> Rate
                        </Button>
                      )}
                      {/* Notes/Comments button — always visible */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 h-7"
                        onClick={() => setCommentsJob({ id: job.id, title: job.title })}
                      >
                        <MessageSquare className="h-3 w-3" /> Notes
                      </Button>
                      {/* Visibility badge — shown when job is on the board */}
                      {job.postedToBoard && (
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${
                          job.jobBoardVisibility === "private"
                            ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                            : "border-green-500/40 text-green-400 bg-green-500/10"
                        }`}>
                          {job.jobBoardVisibility === "private" ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                          {job.jobBoardVisibility === "private" ? "Private" : "Public"}
                        </span>
                      )}
                      {/* Post/Remove from board for open jobs */}
                      {job.status === "open" && (
                        job.postedToBoard ? (
                          <>
                            {/* Visibility toggle — only shown when on the board */}
                            {job.jobBoardVisibility === "private" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs gap-1 h-7 border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                                onClick={() => setVisibility.mutate({ jobId: job.id, visibility: "public" })}
                                disabled={setVisibility.isPending}
                                title="Move to public board"
                              >
                                <Unlock className="h-3 w-3" /> Make Public
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs gap-1 h-7 border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10"
                                onClick={() => setVisibility.mutate({ jobId: job.id, visibility: "private" })}
                                disabled={setVisibility.isPending}
                                title="Move to private board (trusted contractors only)"
                              >
                                <Lock className="h-3 w-3" /> Make Private
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs gap-1 h-7 border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
                              onClick={() => removeFromBoard.mutate({ jobId: job.id })}
                              disabled={removeFromBoard.isPending}
                            >
                              <X className="h-3 w-3" /> Remove from Board
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1 h-7 border-primary/40 text-primary hover:bg-primary/10"
                            onClick={() => postToBoard.mutate({ jobId: job.id, origin: window.location.origin })}
                            disabled={postToBoard.isPending}
                          >
                            <Globe className="h-3 w-3" /> Post to Board
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                  {/* Inline cost breakdown */}
                  {isBreakdownOpen && isPaid && (
                    <JobCostBreakdown jobId={job.id} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Job Dialog */}
      <Dialog open={!!editJob} onOpenChange={(o) => { if (!o) setEditJob(null); }}>
        <DialogContent className="max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle className="text-card-foreground">Edit Job</DialogTitle>
          </DialogHeader>
          {editJob && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Job title" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} placeholder="Describe the issue..." />
              </div>
              <div className="space-y-2">
                <Label>Property</Label>
                <Select value={editForm.propertyId} onValueChange={(v) => setEditForm({ ...editForm, propertyId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>
                    {properties?.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name} — {p.address}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tenant Name</Label>
                  <Input value={editForm.tenantName} onChange={(e) => setEditForm({ ...editForm, tenantName: e.target.value })} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label>Tenant Phone</Label>
                  <Input value={editForm.tenantPhone} onChange={(e) => setEditForm({ ...editForm, tenantPhone: e.target.value })} placeholder="(555) 123-4567" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tenant Email</Label>
                <Input value={editForm.tenantEmail} onChange={(e) => setEditForm({ ...editForm, tenantEmail: e.target.value })} placeholder="tenant@example.com" type="email" />
              </div>
              <div className="space-y-2">
                <Label>Internal Notes</Label>
                <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} placeholder="Internal notes (not visible to contractors)..." />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  onClick={() => updateJob.mutate({
                    jobId: editJob.id,
                    title: editForm.title || undefined,
                    description: editForm.description || undefined,
                    propertyId: editForm.propertyId ? Number(editForm.propertyId) : undefined,
                    tenantName: editForm.tenantName || null,
                    tenantPhone: editForm.tenantPhone || null,
                    tenantEmail: editForm.tenantEmail || null,
                    notes: editForm.notes || null,
                  })}
                  disabled={updateJob.isPending || !editForm.title}
                >
                  {updateJob.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <Button variant="outline" onClick={() => setEditJob(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmJob} onOpenChange={(o) => { if (!o) setDeleteConfirmJob(null); }}>
        <DialogContent className="max-w-sm bg-card">
          <DialogHeader>
            <DialogTitle className="text-card-foreground">Delete Job?</DialogTitle>
          </DialogHeader>
          {deleteConfirmJob && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to permanently delete <span className="font-medium text-foreground">"{deleteConfirmJob.title}"</span>? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => deleteJob.mutate({ jobId: deleteConfirmJob.id })}
                  disabled={deleteJob.isPending}
                >
                  {deleteJob.isPending ? "Deleting..." : "Delete Job"}
                </Button>
                <Button variant="outline" onClick={() => setDeleteConfirmJob(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {replayJob && (
        <RouteReplayDialog
          open={!!replayJob}
          onOpenChange={(open) => { if (!open) setReplayJob(null); }}
          jobId={replayJob.id}
          jobTitle={replayJob.title}
        />
      )}
      {rateJob && (
        <RateContractorDialog
          open={!!rateJob}
          onOpenChange={(open) => { if (!open) setRateJob(null); }}
          maintenanceRequestId={rateJob.id}
          contractorName={rateJob.contractorName}
          onRated={() => {
            utils.jobs.list.invalidate();
            utils.adminViewAs.companyJobs.invalidate();
          }}
        />
      )}
      {commentsJob && (
        <Sheet open={!!commentsJob} onOpenChange={(open) => { if (!open) setCommentsJob(null); }}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
            <SheetHeader className="px-4 pt-4 pb-0 shrink-0">
              <SheetTitle className="text-base truncate">{commentsJob.title}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 overflow-hidden">
              <JobComments maintenanceRequestId={commentsJob.id} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
