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
import { useViewAs } from "@/contexts/ViewAsContext";
import { Plus, Zap, Clock, CheckCircle, AlertTriangle, Globe, X, Route, DollarSign, FileDown, Star, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
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

export default function CompanyJobs() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const isAdmin = user?.role === "admin";
  const isViewingAsCompany = isAdmin && viewAs.mode === "company" && viewAs.companyId;

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [replayJob, setReplayJob] = useState<{ id: number; title: string } | null>(null);
  const [rateJob, setRateJob] = useState<{ id: number; contractorName?: string } | null>(null);
  const [commentsJob, setCommentsJob] = useState<{ id: number; title: string } | null>(null);
  const [expandedBreakdown, setExpandedBreakdown] = useState<number | null>(null);
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

  const jobs = isViewingAsCompany ? viewAsJobs.data : regularJobs.data;
  const isLoading = isViewingAsCompany ? viewAsJobs.isLoading : regularJobs.isLoading;

  const regularProperties = trpc.properties.list.useQuery(undefined, { enabled: !isViewingAsCompany });
  const viewAsProperties = trpc.adminViewAs.companyProperties.useQuery(
    { companyId: viewAs.companyId! },
    { enabled: !!isViewingAsCompany }
  );
  const properties = isViewingAsCompany ? viewAsProperties.data : regularProperties.data;

  const [form, setForm] = useState({
    propertyId: "", title: "", description: "", tenantName: "", tenantPhone: "", unitNumber: "",
  });

  const postToBoard = trpc.jobBoard.post.useMutation({
    onSuccess: () => {
      toast.success("Job posted to the contractor board!");
      utils.jobs.list.invalidate();
      utils.adminViewAs.companyJobs.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const removeFromBoard = trpc.jobBoard.remove.useMutation({
    onSuccess: () => {
      toast.success("Job removed from the board.");
      utils.jobs.list.invalidate();
      utils.adminViewAs.companyJobs.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createJob = trpc.jobs.create.useMutation({
    onSuccess: () => {
      toast.success("Job created and AI classification started!");
      utils.jobs.list.invalidate();
      utils.company.dashboardStats.invalidate();
      setOpen(false);
      setForm({ propertyId: "", title: "", description: "", tenantName: "", tenantPhone: "", unitNumber: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

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

      {/* Filter tabs */}
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

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !jobs || jobs.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {activeTab === "all"
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

            return (
              <Card key={job.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-card-foreground truncate">{job.title}</h3>
                        {job.isEmergency && <Badge variant="destructive" className="text-xs">Emergency</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{job.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {job.aiPriority && (
                          <span className={`px-2 py-0.5 rounded-full border ${priorityColors[job.aiPriority] || ""}`}>
                            {job.aiPriority} priority
                          </span>
                        )}
                        {job.aiSkillTier && <span className="text-primary">{job.aiSkillTier}</span>}
                        {job.hourlyRate && <span>${job.hourlyRate}/hr</span>}
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
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {statusIcons[job.status]}
                        <span className="capitalize">{job.status.replace(/_/g, " ")}</span>
                      </span>
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
                      {/* Post/Remove from board for open jobs */}
                      {job.status === "open" && (
                        job.postedToBoard ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1 h-7 border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
                            onClick={() => removeFromBoard.mutate({ jobId: job.id })}
                            disabled={removeFromBoard.isPending}
                          >
                            <X className="h-3 w-3" /> Remove from Board
                          </Button>
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
