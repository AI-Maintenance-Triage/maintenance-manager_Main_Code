import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Zap, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
  completed: <CheckCircle className="h-3.5 w-3.5" />,
  verified: <CheckCircle className="h-3.5 w-3.5" />,
  paid: <CheckCircle className="h-3.5 w-3.5" />,
};

export default function CompanyJobs() {
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const utils = trpc.useUtils();
  const { data: jobs, isLoading } = trpc.jobs.list.useQuery(statusFilter !== "all" ? { status: statusFilter } : {});
  const { data: properties } = trpc.properties.list.useQuery();

  const [form, setForm] = useState({
    propertyId: "",
    title: "",
    description: "",
    tenantName: "",
    tenantPhone: "",
    unitNumber: "",
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
          <p className="text-muted-foreground mt-1">Manage maintenance requests across your properties</p>
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
                  propertyId: Number(form.propertyId),
                  title: form.title,
                  description: form.description,
                  tenantName: form.tenantName || undefined,
                  tenantPhone: form.tenantPhone || undefined,
                  unitNumber: form.unitNumber || undefined,
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

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "open", "assigned", "in_progress", "completed", "paid"].map((s) => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)} className="capitalize">
            {s === "all" ? "All" : s.replace("_", " ")}
          </Button>
        ))}
      </div>

      {/* Jobs List */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !jobs || jobs.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No maintenance jobs found. Create your first job to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: any) => (
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
                    </div>
                    {job.aiReasoning && (
                      <p className="text-xs text-muted-foreground/70 mt-2 italic">AI: {job.aiReasoning}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {statusIcons[job.status]}
                      <span className="capitalize">{job.status.replace("_", " ")}</span>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
