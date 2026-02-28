import { trpc } from "@/lib/trpc";
import { useViewAs } from "@/contexts/ViewAsContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, CheckCircle, Play, Square, AlertCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ContractorMyJobs() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const isViewingAsContractor = isAdmin && viewAs.mode === "contractor" && viewAs.contractorProfileId;

  const { data: adminJobs, isLoading: adminLoading } = trpc.adminViewAs.contractorJobs.useQuery(
    { contractorProfileId: viewAs.contractorProfileId! },
    { enabled: !!isViewingAsContractor }
  );

  const { data: myJobs, isLoading: myLoading } = trpc.contractor.myJobs.useQuery(undefined, { enabled: !isViewingAsContractor });

  const jobs = isViewingAsContractor ? adminJobs : myJobs;
  const isLoading = isViewingAsContractor ? adminLoading : myLoading;

  if (!isViewingAsContractor && isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">My Jobs</h1>
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Select a contractor from the "View as Contractor" dropdown above to see their jobs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">My Jobs</h1>
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      </div>
    );
  }

  const activeJobs = jobs?.filter((j: any) => j.status === "assigned" || j.status === "in_progress") ?? [];
  const completedJobs = jobs?.filter((j: any) => j.status === "completed" || j.status === "verified" || j.status === "paid") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Jobs</h1>
        <p className="text-muted-foreground mt-1">Track your assigned and completed maintenance jobs</p>
      </div>

      {activeJobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-400" /> Active Jobs
          </h2>
          {activeJobs.map((job: any) => (
            <JobCard key={job.id} job={job} readOnly={!!isViewingAsContractor} onUpdate={() => {
              if (isViewingAsContractor) {
                utils.adminViewAs.contractorJobs.invalidate();
              } else {
                utils.contractor.myJobs.invalidate();
              }
            }} />
          ))}
        </div>
      )}

      {completedJobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-400" /> Completed Jobs
          </h2>
          {completedJobs.map((job: any) => (
            <Card key={job.id} className="bg-card border-border opacity-75">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-card-foreground">{job.title}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{job.status.replace("_", " ")}</p>
                  </div>
                  {job.hourlyRate && <span className="text-sm text-primary">${job.hourlyRate}/hr</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(!jobs || jobs.length === 0) && (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No jobs assigned yet. Check the job board for available work.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function JobCard({ job, readOnly, onUpdate }: { job: any; readOnly: boolean; onUpdate: () => void }) {
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  const clockIn = trpc.timeTracking.clockIn.useMutation({
    onSuccess: (data) => {
      setActiveSessionId(data.sessionId);
      toast.success("Clocked in! Time tracking started.");
      onUpdate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const clockOut = trpc.timeTracking.clockOut.useMutation({
    onSuccess: () => {
      setActiveSessionId(null);
      toast.success("Clocked out! Time recorded.");
      onUpdate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getLocationAndAct = (action: "clockIn" | "clockOut") => {
    setGettingLocation(true);
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported by your browser");
      setGettingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGettingLocation(false);
        const lat = String(pos.coords.latitude);
        const lng = String(pos.coords.longitude);
        if (action === "clockIn") {
          clockIn.mutate({ jobId: job.id, latitude: lat, longitude: lng });
        } else if (activeSessionId) {
          clockOut.mutate({ sessionId: activeSessionId, latitude: lat, longitude: lng, method: "manual" });
        }
      },
      () => {
        setGettingLocation(false);
        toast.error("Could not get your location. Please enable GPS.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const isClockingIn = clockIn.isPending || gettingLocation;
  const isClockingOut = clockOut.isPending || gettingLocation;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-card-foreground">{job.title}</h3>
              {job.isEmergency && <Badge variant="destructive" className="text-xs">Emergency</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{job.description}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {job.aiSkillTier && <span className="text-primary">{job.aiSkillTier}</span>}
              {job.hourlyRate && <span className="font-medium">${job.hourlyRate}/hr</span>}
              <span className="capitalize">{job.status.replace("_", " ")}</span>
            </div>
          </div>
          {!readOnly && (
            <div className="flex flex-col gap-2 shrink-0">
              {job.status === "assigned" && !activeSessionId && (
                <Button
                  onClick={() => getLocationAndAct("clockIn")}
                  disabled={isClockingIn}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Play className="h-4 w-4" />
                  {isClockingIn ? "Getting GPS..." : "Clock In"}
                </Button>
              )}
              {(job.status === "in_progress" || activeSessionId) && (
                <Button
                  onClick={() => getLocationAndAct("clockOut")}
                  disabled={isClockingOut}
                  variant="destructive"
                  className="gap-2"
                >
                  <Square className="h-4 w-4" />
                  {isClockingOut ? "Getting GPS..." : "Clock Out"}
                </Button>
              )}
            </div>
          )}
          {readOnly && (
            <Badge variant="outline" className="shrink-0 text-muted-foreground">View Only</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
