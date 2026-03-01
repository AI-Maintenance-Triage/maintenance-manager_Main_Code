import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MapPin, Wrench, AlertTriangle, CheckCircle2, Briefcase,
  Building2, Calendar, DollarSign, Loader2, RefreshCw, Bug
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PRIORITY_CONFIG = {
  low:       { label: "Low",       color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  medium:    { label: "Medium",    color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  high:      { label: "High",      color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  emergency: { label: "Emergency", color: "bg-red-500/20 text-red-300 border-red-500/30" },
};

export default function ContractorJobBoard() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();
  const { data: jobs, isLoading, refetch } = trpc.jobBoard.list.useQuery();
  const { data: debugData, refetch: refetchDebug } = trpc.jobBoard.debug.useQuery();
  const refreshGeocode = trpc.contractor.refreshGeocode.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Location updated! Refreshing job board...`);
        utils.jobBoard.list.invalidate();
        utils.jobBoard.debug.invalidate();
      } else {
        toast.error(result.message || "Geocoding failed");
      }
    },
    onError: (err) => toast.error(err.message || "Failed to update location"),
  });
  const acceptJob = trpc.jobBoard.accept.useMutation({
    onSuccess: () => {
      toast.success("Job accepted! Check your active jobs.");
      utils.jobBoard.list.invalidate();
      setSelectedJob(null);
    },
    onError: (err) => toast.error(err.message || "Failed to accept job"),
  });

  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Job Board</h1>
          <p className="text-muted-foreground mt-1">
            Open jobs in your service area — accept one to get started
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchDebug(); }} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDebug(v => !v)} className="gap-2 text-yellow-400 border-yellow-400/40 hover:bg-yellow-400/10">
            <Bug className="h-4 w-4" />
            {showDebug ? "Hide" : "Debug"}
          </Button>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && debugData && (
        <Card className="bg-yellow-950/30 border-yellow-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-yellow-400 text-sm flex items-center gap-2"><Bug className="h-4 w-4" /> Service Area Debug</CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-mono space-y-3">
            <div>
              <p className="text-yellow-300 font-semibold mb-1">Your Contractor Profile</p>
              {debugData.contractor ? (
                <div className="space-y-0.5 text-muted-foreground">
                  <p>Name: <span className="text-foreground">{debugData.contractor.businessName || "(unnamed)"}</span></p>
                  <p>Coords stored: <span className={debugData.contractor.hasCoords ? "text-green-400" : "text-red-400"}>{debugData.contractor.hasCoords ? `${debugData.contractor.latitude}, ${debugData.contractor.longitude}` : "❌ NULL — geocoding failed or not yet run"}</span></p>
                  <p>Service radius: <span className="text-foreground">{debugData.contractor.radiusMiles} miles</span></p>
                  <p>Service ZIPs: <span className="text-foreground">{(debugData.contractor.serviceAreaZips as string[] | null)?.join(", ") || "(none)"}</span></p>
                </div>
              ) : <p className="text-red-400">No contractor profile found</p>}
            </div>
            <div>
              <p className="text-yellow-300 font-semibold mb-1">All Jobs (board + non-board)</p>
              {debugData.jobs.length === 0 ? <p className="text-muted-foreground">No jobs found</p> : (
                <table className="w-full text-left">
                  <thead><tr className="text-yellow-300"><th className="pr-3">Title</th><th className="pr-3">Status</th><th className="pr-3">Board</th><th className="pr-3">Prop Coords</th><th className="pr-3">Distance</th><th>In Range?</th></tr></thead>
                  <tbody>
                    {debugData.jobs.map((j: any) => (
                      <tr key={j.jobId} className="border-t border-yellow-500/10">
                        <td className="pr-3 py-0.5 text-foreground">{j.jobTitle}</td>
                        <td className="pr-3">{j.status}</td>
                        <td className="pr-3">{j.postedToBoard ? <span className="text-green-400">✓</span> : <span className="text-red-400">✗</span>}</td>
                        <td className="pr-3">{j.propertyLat ? <span className="text-green-400">{j.propertyLat}, {j.propertyLng}</span> : <span className="text-red-400">❌ NULL</span>}</td>
                        <td className="pr-3">{j.distanceMiles !== null ? `${j.distanceMiles} mi` : "N/A"}</td>
                        <td>{j.withinRadius === null ? <span className="text-yellow-400">?</span> : j.withinRadius ? <span className="text-green-400">✓</span> : <span className="text-red-400">✗</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {!isLoading && jobs && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Briefcase className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">{jobs.length}</span> job{jobs.length !== 1 ? "s" : ""} available in your area
          </span>
          {jobs.some((j: any) => j.job.aiPriority === "emergency") && (
            <Badge className="bg-red-500/20 text-red-300 border-red-500/30 border">
              <AlertTriangle className="h-3 w-3 mr-1" /> Emergency jobs available
            </Badge>
          )}
        </div>
      )}

      {/* Job List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
        </div>
      ) : !jobs || jobs.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
            {debugData?.contractor && !debugData.contractor.hasCoords ? (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-2">Location not set up</h3>
                <p className="text-muted-foreground max-w-sm mb-4">
                  Your service area coordinates could not be determined. This prevents the job board from filtering by distance. Click below to fix it.
                </p>
                <Button
                  onClick={() => refreshGeocode.mutate()}
                  disabled={refreshGeocode.isPending}
                  className="gap-2"
                >
                  {refreshGeocode.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  {refreshGeocode.isPending ? "Updating location..." : "Fix My Location"}
                </Button>
                <p className="text-xs text-muted-foreground mt-3">Make sure your service ZIP code is set in your profile settings.</p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-2">No jobs in your area</h3>
                <p className="text-muted-foreground max-w-sm">
                  There are no open jobs within your {debugData?.contractor?.radiusMiles ?? 25}-mile service radius right now. Check back later or expand your service radius in your profile settings.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {jobs.map((row: any) => {
            const job = row.job;
            const property = row.property;
            const company = row.company;
            const distanceMiles: number | undefined = row.distanceMiles;
            const priority = PRIORITY_CONFIG[job.aiPriority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
            return (
              <Card
                key={job.id}
                className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer group"
                onClick={() => setSelectedJob(row)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold text-card-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {job.title}
                    </CardTitle>
                    {job.aiPriority && (
                      <Badge className={`shrink-0 text-xs border ${priority.color}`}>
                        {job.isEmergency ? <AlertTriangle className="h-3 w-3 mr-1" /> : null}
                        {priority.label}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">{job.description}</p>

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="truncate">{company.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{[property.city, property.state].filter(Boolean).join(", ") || property.zipCode || "Location on file"}</span>
                      {distanceMiles !== undefined && (
                        <span className="ml-auto shrink-0 text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                          {distanceMiles} mi
                        </span>
                      )}
                    </div>
                    {job.aiSkillTier && (
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{job.aiSkillTier}</span>
                      </div>
                    )}
                    {job.hourlyRate && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>${job.hourlyRate}/hr</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>Posted {new Date(job.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    className="w-full mt-2"
                    onClick={(e) => { e.stopPropagation(); setSelectedJob(row); }}
                  >
                    View & Accept
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Job Detail Dialog */}
      {selectedJob && (
        <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
          <DialogContent className="bg-card max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-card-foreground pr-6">{selectedJob.job.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Priority + Skill */}
              <div className="flex flex-wrap gap-2">
                {selectedJob.job.aiPriority && (
                  <Badge className={`text-xs border ${(PRIORITY_CONFIG[selectedJob.job.aiPriority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium).color}`}>
                    {selectedJob.job.isEmergency && <AlertTriangle className="h-3 w-3 mr-1" />}
                    {(PRIORITY_CONFIG[selectedJob.job.aiPriority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium).label} Priority
                  </Badge>
                )}
                {selectedJob.job.aiSkillTier && (
                  <Badge variant="secondary" className="text-xs">
                    <Wrench className="h-3 w-3 mr-1" />{selectedJob.job.aiSkillTier}
                  </Badge>
                )}
              </div>

              {/* Description */}
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Description</p>
                <p className="text-sm text-muted-foreground">{selectedJob.job.description}</p>
              </div>

              {/* AI Reasoning */}
              {selectedJob.job.aiReasoning && (
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-xs font-medium text-primary mb-1">AI Assessment</p>
                  <p className="text-xs text-muted-foreground">{selectedJob.job.aiReasoning}</p>
                </div>
              )}

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Company</p>
                  <p className="font-medium text-foreground">{selectedJob.company.name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="font-medium text-foreground">
                    {[selectedJob.property.city, selectedJob.property.state].filter(Boolean).join(", ") || selectedJob.property.zipCode || "On file"}
                  </p>
                </div>
                {selectedJob.job.hourlyRate && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Rate</p>
                    <p className="font-medium text-foreground">${selectedJob.job.hourlyRate}/hr</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Posted</p>
                  <p className="font-medium text-foreground">{new Date(selectedJob.job.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Accept button */}
              <Button
                className="w-full gap-2"
                onClick={() => acceptJob.mutate({ jobId: selectedJob.job.id })}
                disabled={acceptJob.isPending}
              >
                {acceptJob.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Accepting...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> Accept This Job</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                By accepting, this job will be assigned to you and removed from the board.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
