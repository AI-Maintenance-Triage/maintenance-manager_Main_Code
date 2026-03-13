import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useViewAs } from "@/contexts/ViewAsContext";
import { ClipboardList, HardHat, MapPin, DollarSign, AlertTriangle, Clock, Building2, Zap, Star, Shield, Crown, ArrowUpRight, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { toast } from "sonner";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";

export default function CompanyDashboard() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  // Admin viewing as a company — use adminViewAs procedures
  if (isAdmin && viewAs.mode === "company" && viewAs.companyId) {
    return <CompanyDashboardViewAs companyId={viewAs.companyId} companyName={viewAs.companyName || "Company"} />;
  }

  // Admin without selecting a company
  if (isAdmin && viewAs.mode !== "company") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Company Dashboard</h1>
          <p className="text-muted-foreground mt-1">Select a company from the "View as Company" dropdown above to view their dashboard.</p>
        </div>
      </div>
    );
  }

  // Regular company admin — check if they have a company
  const { data: company, isLoading: companyLoading, error: companyError } = trpc.company.get.useQuery(
    undefined,
    { retry: false, enabled: !isAdmin }
  );

  if (!isAdmin && !companyLoading && (companyError || !company)) {
    return <CompanySetup onCreated={() => {
      utils.company.get.invalidate();
      utils.company.dashboardStats.invalidate();
    }} />;
  }

  return <CompanyDashboardContent />;
}

function CompanyDashboardViewAs({ companyId, companyName }: { companyId: number; companyName: string }) {
  const { data: stats, isLoading } = trpc.adminViewAs.companyDashboard.useQuery({ companyId });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard — {companyName}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-card"><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Open Jobs", value: stats?.openJobs ?? 0, icon: ClipboardList, color: "text-blue-400" },
    { label: "In Progress", value: stats?.inProgressJobs ?? 0, icon: Clock, color: "text-yellow-400" },
    { label: "Active Contractors", value: stats?.activeContractors ?? 0, icon: HardHat, color: "text-green-400" },
    { label: "Trusted Contractors", value: (stats as any)?.trustedContractors ?? 0, icon: Shield, color: "text-emerald-400", hint: "View trusted list" },
    { label: "Properties", value: stats?.totalProperties ?? 0, icon: MapPin, color: "text-purple-400" },
    { label: "Completed", value: stats?.completedJobs ?? 0, icon: AlertTriangle, color: "text-red-400" },
    { label: "Total Spent", value: stats?.totalSpent ? `$${stats.totalSpent}` : "$0", icon: DollarSign, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard — {companyName}</h1>
        <p className="text-muted-foreground mt-1">Viewing as company admin</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat: any) => (
          <Card key={stat.label} className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-card-foreground">{stat.value}</div>
              {stat.hint && <p className="text-xs text-muted-foreground mt-1">{stat.hint} →</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CompanySetup({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const createCompany = trpc.company.create.useMutation({
    onSuccess: () => {
      toast.success("Company created! Refreshing...");
      setTimeout(() => window.location.reload(), 500);
    },
    onError: (err) => toast.error(err.message || "Failed to create company"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Set Up Your Company</h1>
        <p className="text-muted-foreground mt-1">Create your property management company to start managing maintenance requests.</p>
      </div>
      <Card className="bg-card border-border max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            <Building2 className="h-5 w-5 text-primary" />
            Company Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Company Name *</Label>
            <Input id="name" placeholder="e.g. Acme Property Management" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" placeholder="123 Main St, City, State" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" placeholder="info@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <Button
            onClick={() => createCompany.mutate({ name, address: address || undefined, phone: phone || undefined, email: email || undefined })}
            disabled={!name.trim() || createCompany.isPending}
            className="w-full mt-2"
          >
            {createCompany.isPending ? "Creating..." : "Create Company"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanUsageWidget() {
  const [, setLocation] = useLocation();
  const { data: planData, isLoading } = trpc.company.getMyPlan.useQuery();

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const plan = planData?.plan;
  const usage = planData?.usage;
  const planStatus = planData?.planStatus ?? null;
  const daysRemaining = planData?.daysRemaining ?? null;

  const features = (plan?.features ?? {}) as Record<string, unknown>;
  const maxProperties = features.maxProperties as number | null | undefined;
  const maxContractors = features.maxContractors as number | null | undefined;
  const maxJobs = features.maxJobsPerMonth as number | null | undefined;

  const usageItems = [
    { icon: MapPin, label: "Properties", value: usage?.properties ?? 0, max: maxProperties },
    { icon: HardHat, label: "Contractors", value: usage?.contractors ?? 0, max: maxContractors },
    { icon: ClipboardList, label: "Jobs This Month", value: usage?.jobsThisMonth ?? 0, max: maxJobs },
  ];

  const isNearLimit = usageItems.some(({ value, max }) => max != null && max > 0 && value / max >= 0.8);

  return (
    <Card className={`bg-card border-border ${isNearLimit ? "border-amber-500/40" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium text-card-foreground flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Plan Usage
        </CardTitle>
        <div className="flex items-center gap-2">
          {!plan && (
            <Badge variant="secondary" className="text-xs">No Plan</Badge>
          )}
          {planStatus === "active" && (
            <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs gap-1"><CheckCircle2 className="h-3 w-3" /> Active</Badge>
          )}
          {planStatus === "trialing" && (
            <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-xs gap-1"><Zap className="h-3 w-3" /> Trial{daysRemaining !== null ? ` · ${daysRemaining}d left` : ""}</Badge>
          )}
          {planStatus === "expired" && (
            <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs gap-1"><XCircle className="h-3 w-3" /> Expired</Badge>
          )}
          {planStatus === "grace_period" && (
            <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30 text-xs gap-1"><XCircle className="h-3 w-3" /> Grace Period</Badge>
          )}
          {planStatus === "locked" && (
            <Badge className="bg-red-600/20 text-red-500 border-red-600/40 text-xs gap-1"><XCircle className="h-3 w-3" /> Account Locked</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {plan ? (
          <>
            <p className="text-xs text-muted-foreground font-medium">{plan.name}</p>
            {usageItems.map(({ icon: Icon, label, value, max }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground"><Icon className="h-3 w-3" /> {label}</span>
                  <span className={`font-medium ${max != null && max > 0 && value / max >= 0.8 ? "text-amber-400" : "text-foreground"}`}>
                    {value}{max != null ? ` / ${max === 0 ? "∞" : max}` : " / ∞"}
                  </span>
                </div>
                {max != null && max > 0 ? (
                  <Progress
                    value={Math.min(100, (value / max) * 100)}
                    className={`h-1.5 ${value / max >= 0.9 ? "[&>div]:bg-red-400" : value / max >= 0.8 ? "[&>div]:bg-amber-400" : ""}`}
                  />
                ) : (
                  <div className="h-1.5 rounded-full bg-secondary" />
                )}
              </div>
            ))}
            {(isNearLimit || planStatus === "expired" || planStatus === "grace_period" || planStatus === "locked") && (
              <button
                onClick={() => setLocation("/company/billing")}
                className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ArrowUpRight className="h-3 w-3" />
                {planStatus === "locked" ? "Reactivate account" : planStatus === "grace_period" ? "Subscribe before account locks" : planStatus === "expired" ? "Renew subscription" : "Upgrade plan"}
              </button>
            )}
          </>
        ) : (
          <div className="text-center py-2">
            <p className="text-xs text-muted-foreground mb-2">No subscription plan assigned.</p>
            <button
              onClick={() => setLocation("/company/billing")}
              className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
            >
              <ArrowUpRight className="h-3 w-3" /> View available plans
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LockedAccountWall({ billingUrl, userType }: { billingUrl: string; userType: "company" | "contractor" }) {
  const [, setLocation] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 px-4">
      <div className="rounded-full bg-red-500/10 p-6">
        <XCircle className="h-16 w-16 text-red-500" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Account Locked</h1>
        <p className="text-muted-foreground max-w-md">
          Your free trial has ended and the 3-day grace period has passed. Your account is now locked.
          Subscribe to a plan to restore full access.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => setLocation(billingUrl)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
        >
          <ArrowUpRight className="h-4 w-4" />
          Choose a Plan
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Need help? Contact support or visit your billing page for options.
      </p>
    </div>
  );
}

function CompanyDashboardContent() {
  const { data: stats, isLoading } = trpc.company.dashboardStats.useQuery();
  const { data: planData } = trpc.company.getMyPlan.useQuery();
  const planStatus = planData?.planStatus ?? null;

  if (planStatus === "locked") {
    return <LockedAccountWall billingUrl="/company/billing" userType="company" />;
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-card"><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Open Jobs", value: stats?.openJobs ?? 0, icon: ClipboardList, color: "text-blue-400" },
    { label: "In Progress", value: stats?.inProgressJobs ?? 0, icon: Clock, color: "text-yellow-400" },
    { label: "Active Contractors", value: stats?.activeContractors ?? 0, icon: HardHat, color: "text-green-400" },
    { label: "Trusted Contractors", value: (stats as any)?.trustedContractors ?? 0, icon: Shield, color: "text-emerald-400", hint: "View trusted list" },
    { label: "Properties", value: stats?.totalProperties ?? 0, icon: MapPin, color: "text-purple-400" },
    { label: "Completed", value: stats?.completedJobs ?? 0, icon: AlertTriangle, color: "text-red-400" },
    { label: "Total Spent", value: stats?.totalSpent ? `$${stats.totalSpent}` : "$0", icon: DollarSign, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <AnnouncementBanner userType="company" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your maintenance operations</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat: any) => (
          <Card key={stat.label} className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-card-foreground">{stat.value}</div>
              {stat.hint && <p className="text-xs text-muted-foreground mt-1">{stat.hint} →</p>}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-card-foreground">Recent Jobs</CardTitle></CardHeader>
            <CardContent><RecentJobs /></CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <PlanUsageWidget />
        </div>
      </div>
    </div>
  );
}

function RecentJobs() {
  const { data: jobs, isLoading } = trpc.jobs.list.useQuery({});
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!jobs || jobs.length === 0) return <p className="text-sm text-muted-foreground">No jobs yet. Create your first maintenance request from the Jobs page.</p>;

  const recentJobs = jobs.slice(0, 5);
  return (
    <div className="space-y-3">
      {recentJobs.map((job: any) => (
        <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{job.title}</p>
            <p className="text-xs text-muted-foreground">{job.aiPriority ? `${job.aiPriority} priority` : "Unclassified"} • {job.status}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${
            job.status === "open" ? "bg-blue-500/20 text-blue-400" :
            job.status === "in_progress" ? "bg-yellow-500/20 text-yellow-400" :
            job.status === "completed" ? "bg-green-500/20 text-green-400" :
            "bg-muted text-muted-foreground"
          }`}>{job.status}</span>
        </div>
      ))}
    </div>
  );
}
