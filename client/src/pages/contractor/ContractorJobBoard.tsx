import { trpc } from "@/lib/trpc";
import { useViewAs } from "@/contexts/ViewAsContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, DollarSign, AlertTriangle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const priorityColors: Record<string, string> = {
  emergency: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-green-500/20 text-green-400 border-green-500/30",
};

export default function ContractorJobBoard() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const isViewingAsContractor = isAdmin && viewAs.mode === "contractor" && viewAs.contractorProfileId;

  const { data: adminJobs, isLoading: adminLoading } = trpc.adminViewAs.contractorAvailableJobs.useQuery(
    { contractorProfileId: viewAs.contractorProfileId! },
    { enabled: !!isViewingAsContractor }
  );

  const { data: myJobs, isLoading: myLoading } = trpc.contractor.availableJobs.useQuery(undefined, { enabled: !isViewingAsContractor });

  const jobs = isViewingAsContractor ? adminJobs : myJobs;
  const isLoading = isViewingAsContractor ? adminLoading : myLoading;

  const acceptJob = trpc.contractor.acceptJob.useMutation({
    onSuccess: () => {
      toast.success("Job accepted! You can now clock in when you arrive.");
      utils.contractor.availableJobs.invalidate();
      utils.contractor.myJobs.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!isViewingAsContractor && isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Job Board</h1>
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Select a contractor from the "View as Contractor" dropdown above to see their available jobs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Available Jobs</h1>
        <p className="text-muted-foreground mt-1">Browse and accept maintenance jobs in your area</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : !jobs || jobs.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No available jobs right now. Check back soon!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: any) => (
            <Card key={job.id} className="bg-card border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-card-foreground">{job.title}</h3>
                      {job.isEmergency && <Badge variant="destructive" className="text-xs">Emergency</Badge>}
                      {job.aiPriority && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityColors[job.aiPriority] || ""}`}>
                          {job.aiPriority}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{job.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {job.aiSkillTier && (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> {job.aiSkillTier}
                        </span>
                      )}
                      {job.hourlyRate && (
                        <span className="flex items-center gap-1 text-primary font-medium">
                          <DollarSign className="h-3 w-3" /> ${job.hourlyRate}/hr
                        </span>
                      )}
                      {job.unitNumber && <span>Unit: {job.unitNumber}</span>}
                    </div>
                  </div>
                  {!isViewingAsContractor && (
                    <Button
                      onClick={() => acceptJob.mutate({ jobId: job.id })}
                      disabled={acceptJob.isPending}
                      className="shrink-0"
                    >
                      {acceptJob.isPending ? "Accepting..." : "Accept Job"}
                    </Button>
                  )}
                  {isViewingAsContractor && (
                    <Badge variant="outline" className="shrink-0 text-muted-foreground">View Only</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
