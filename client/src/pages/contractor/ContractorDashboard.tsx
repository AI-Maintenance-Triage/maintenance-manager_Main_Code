import { trpc } from "@/lib/trpc";
import { useViewAs } from "@/contexts/ViewAsContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, Clock, DollarSign, CheckCircle, AlertCircle } from "lucide-react";

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

  return (
    <div className="space-y-6">
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
      </div>

      {activeJobs.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-card-foreground">Active Jobs</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {activeJobs.map((job: any) => (
              <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="font-medium text-foreground">{job.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{job.status.replace("_", " ")} • {job.aiSkillTier || "Unclassified"}</p>
                </div>
                {job.hourlyRate && <span className="text-sm text-primary font-semibold">${job.hourlyRate}/hr</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
