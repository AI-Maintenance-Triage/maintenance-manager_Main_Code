import { trpc } from "@/lib/trpc";
import { useViewAs } from "@/contexts/ViewAsContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, Clock, DollarSign, CheckCircle, AlertCircle, Zap, ArrowUpRight, XCircle, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ContractorOnboardingChecklist } from "@/components/ContractorOnboardingChecklist";
import { ContractorPayoutStatusCard } from "@/components/ContractorPayoutStatusCard";

function LockedAccountButton({ billingUrl }: { billingUrl: string }) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation(billingUrl)}
      className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
    >
      <ArrowUpRight className="h-4 w-4" />
      Choose a Plan
    </button>
  );
}

export default function ContractorDashboard() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const isAdmin = user?.role === "admin";
  const isViewingAsContractor = isAdmin && viewAs.mode === "contractor" && viewAs.contractorProfileId;

  // Admin viewing as contractor uses adminViewAs procedures
  const { data: adminProfile, isLoading: adminProfileLoading } = trpc.adminViewAs.contractorProfile.useQuery(
    { contractorProfileId: viewAs.contractorProfileId! },
    { enabled: !!isViewingAsContractor }
  );
  const { data: adminJobs, isLoading: adminJobsLoading } = trpc.adminViewAs.contractorJobs.useQuery(
    { contractorProfileId: viewAs.contractorProfileId! },
    { enabled: !!isViewingAsContractor }
  );
  const { data: adminAvailable } = trpc.adminViewAs.contractorAvailableJobs.useQuery(
    { contractorProfileId: viewAs.contractorProfileId! },
    { enabled: !!isViewingAsContractor }
  );

  // Regular contractor uses their own procedures
  const { data: myProfile, isLoading: myProfileLoading } = trpc.contractor.getProfile.useQuery(undefined, { enabled: !isViewingAsContractor });
  const { data: myJobs, isLoading: myJobsLoading } = trpc.contractor.myJobs.useQuery(undefined, { enabled: !isViewingAsContractor });
  const { data: myAvailable } = trpc.contractor.availableJobs.useQuery(undefined, { enabled: !isViewingAsContractor });

  const profile = isViewingAsContractor ? adminProfile : myProfile;
  const jobs = isViewingAsContractor ? adminJobs : myJobs;
  const availableJobs = isViewingAsContractor ? adminAvailable : myAvailable;
  const isLoading = isViewingAsContractor ? adminProfileLoading : myProfileLoading;

  if (!isViewingAsContractor && isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Contractor Dashboard</h1>
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Select a contractor from the "View as Contractor" dropdown above to see their dashboard.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </div>
    );
  }

  const activeJobs = jobs?.filter((j: any) => j.status === "in_progress" || j.status === "assigned") ?? [];
  const completedJobs = jobs?.filter((j: any) => j.status === "completed" || j.status === "paid") ?? [];

  // Locked account wall — show upgrade prompt instead of dashboard
  const contractorPlanStatus = (profile as any)?.planStatus ?? null;
  if (!isViewingAsContractor && contractorPlanStatus === "locked") {
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
        <LockedAccountButton billingUrl="/contractor/billing" />
        <p className="text-xs text-muted-foreground">
          Need help? Contact support or visit your billing page for options.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnnouncementBanner userType="contractor" />
      {profile && !isViewingAsContractor && (
        <ContractorOnboardingChecklist profile={profile} />
      )}
      {!isViewingAsContractor && <ContractorPayoutStatusCard />}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Contractor Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {profile?.isAvailable ? "Available for jobs" : "Currently set as unavailable"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Available Jobs</CardTitle>
            <Briefcase className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold text-card-foreground">{availableJobs?.length ?? 0}</div></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Jobs</CardTitle>
            <Clock className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold text-card-foreground">{activeJobs.length}</div></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold text-card-foreground">{completedJobs.length}</div></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold text-card-foreground">$0</div><p className="text-xs text-muted-foreground">Payment tracking coming soon</p></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rating</CardTitle>
            <Star className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold text-card-foreground">—</div><p className="text-xs text-muted-foreground">No ratings yet</p></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-card-foreground">Active Jobs</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {activeJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No active jobs. Check the job board for available work.</p>
              ) : (
                activeJobs.map((job: any) => (
                  <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div>
                      <p className="font-medium text-foreground">{job.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{job.status.replace("_", " ")} • {job.aiSkillTier || "Unclassified"}</p>
                    </div>
                    {job.hourlyRate && <span className="text-sm text-primary font-semibold">${job.hourlyRate}/hr</span>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
        <div>
          {!isViewingAsContractor && <ContractorPlanWidget />}
        </div>
      </div>
    </div>
  );
}

function ContractorPlanWidget() {
  const [, setLocation] = useLocation();
  const { data: planData, isLoading } = trpc.contractor.getMyPlan.useQuery();

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const plan = planData?.plan;
  const planStatus = planData?.planStatus ?? null;
  const daysRemaining = planData?.daysRemaining ?? null;
  const features = (plan?.features ?? {}) as Record<string, unknown>;
  const maxActiveJobs = features.maxActiveJobs as number | null | undefined;
  const activeJobCount = planData?.usage?.activeJobs ?? 0;
  const isNearLimit = maxActiveJobs != null && maxActiveJobs > 0 && activeJobCount / maxActiveJobs >= 0.8;
  // When no paid plan is assigned, display as Free Plan
  const displayPlanName = plan?.name ?? "Free Plan";
  const isFree = !plan;

  return (
    <Card className={`bg-card border-border ${isNearLimit ? "border-amber-500/40" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium text-card-foreground flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Plan Usage
        </CardTitle>
        <div className="flex items-center gap-1.5">
          {isFree && <Badge variant="secondary" className="text-xs">Free</Badge>}
          {planStatus === "active" && (
            <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">Active</Badge>
          )}
          {planStatus === "trialing" && (
            <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-xs">
              Trial{daysRemaining !== null ? ` · ${daysRemaining}d` : ""}
            </Badge>
          )}
          {planStatus === "expired" && (
            <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs gap-1">
              <XCircle className="h-3 w-3" /> Expired
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground font-medium">{displayPlanName}</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Briefcase className="h-3 w-3" /> Active Jobs
            </span>
            <span className={`font-medium ${
              maxActiveJobs != null && maxActiveJobs > 0 && activeJobCount / maxActiveJobs >= 0.8
                ? "text-amber-400" : "text-foreground"
            }`}>
              {activeJobCount}{maxActiveJobs != null ? ` / ${maxActiveJobs === 0 ? "∞" : maxActiveJobs}` : " / ∞"}
            </span>
          </div>
          {maxActiveJobs != null && maxActiveJobs > 0 ? (
            <Progress
              value={Math.min(100, (activeJobCount / maxActiveJobs) * 100)}
              className={`h-1.5 ${
                activeJobCount / maxActiveJobs >= 0.9 ? "[&>div]:bg-red-400" :
                activeJobCount / maxActiveJobs >= 0.8 ? "[&>div]:bg-amber-400" : ""
              }`}
            />
          ) : (
            <div className="h-1.5 rounded-full bg-secondary" />
          )}
        </div>
        {(isNearLimit || planStatus === "expired") && (
          <button
            onClick={() => setLocation("/contractor/billing")}
            className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ArrowUpRight className="h-3 w-3" />
            {planStatus === "expired" ? "Renew subscription" : "Upgrade plan"}
          </button>
        )}
        {isFree && (
          <button
            onClick={() => setLocation("/contractor/billing")}
            className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ArrowUpRight className="h-3 w-3" /> View available plans
          </button>
        )}
      </CardContent>
    </Card>
  );
}
