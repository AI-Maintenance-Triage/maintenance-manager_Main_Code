import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MapPin, Wrench, AlertTriangle, CheckCircle2, Briefcase,
  Building2, Calendar, DollarSign, Loader2, RefreshCw, Bug, Zap,
  Globe, Lock, ShieldCheck
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";

const PRIORITY_CONFIG = {
  low:       { label: "Low",       color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  medium:    { label: "Medium",    color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  high:      { label: "High",      color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  emergency: { label: "Emergency", color: "bg-red-500/20 text-red-300 border-red-500/30" },
};

const POLL_INTERVAL_MS = 30_000;

/** Shared job card used by both public and private boards */
function JobCard({ row, onSelect }: { row: any; onSelect: (row: any) => void }) {
  const job = row.job;
  const property = row.property;
  const company = row.company;
  const distanceMiles: number | undefined = row.distanceMiles;
  const isPrivate: boolean = row.isPrivate ?? false;
  // Use override priority if set, otherwise fall back to AI priority
  const effectivePriority = job.overridePriority ?? job.aiPriority;
  const priority = PRIORITY_CONFIG[effectivePriority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;

  return (
    <Card
      className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer group"
      onClick={() => onSelect(row)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold text-card-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {job.title}
          </CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            {isPrivate && (
              <Badge className="text-xs border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                <Lock className="h-3 w-3 mr-1" /> Private
              </Badge>
            )}
            {effectivePriority && (
              <Badge className={`text-xs border ${priority.color}`}>
                {job.isEmergency ? <AlertTriangle className="h-3 w-3 mr-1" /> : null}
                {priority.label}
                {job.overridePriority && <span className="ml-1 opacity-70">(updated)</span>}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">{job.description}</p>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">{company.name}</span>
            {company.paidJobCount > 0 && (
              <span className="ml-auto shrink-0 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full">
                {company.paidJobCount} paid job{company.paidJobCount !== 1 ? "s" : ""}
              </span>
            )}
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
        <Button size="sm" className="w-full mt-2" onClick={(e) => { e.stopPropagation(); onSelect(row); }}>
          View & Accept
        </Button>
      </CardContent>
    </Card>
  );
}

/** Shared job detail dialog */
function JobDetailDialog({
  row, onClose, onAccept, isPending,
}: {
  row: any; onClose: () => void; onAccept: (jobId: number) => void; isPending: boolean;
}) {
  const isPrivate: boolean = row.isPrivate ?? false;
  const effectivePriority = row.job.overridePriority ?? row.job.aiPriority;
  const priority = PRIORITY_CONFIG[effectivePriority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
  return (
    <Dialog open={!!row} onOpenChange={onClose}>
      <DialogContent className="bg-card max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-card-foreground pr-6">{row.job.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {isPrivate && (
              <Badge className="text-xs border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                <Lock className="h-3 w-3 mr-1" /> Private Job
              </Badge>
            )}
            {effectivePriority && (
              <Badge className={`text-xs border ${priority.color}`}>
                {row.job.isEmergency && <AlertTriangle className="h-3 w-3 mr-1" />}
                {priority.label} Priority
                {row.job.overridePriority && <span className="ml-1 opacity-70">(updated by company)</span>}
              </Badge>
            )}
            {row.job.aiSkillTier && (
              <Badge variant="secondary" className="text-xs">
                <Wrench className="h-3 w-3 mr-1" />{row.job.aiSkillTier}
              </Badge>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground mb-1">Description</p>
            <p className="text-sm text-muted-foreground">{row.job.description}</p>
          </div>
          {row.job.aiReasoning && (
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs font-medium text-primary mb-1">AI Assessment</p>
              <p className="text-xs text-muted-foreground">{row.job.aiReasoning}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Company</p>
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{row.company.name}</p>
                {row.company.paidJobCount > 0 && (
                  <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full">
                    {row.company.paidJobCount} paid
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="font-medium text-foreground">
                {[row.property.city, row.property.state].filter(Boolean).join(", ") || row.property.zipCode || "On file"}
              </p>
            </div>
            {row.job.hourlyRate && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Rate</p>
                <p className="font-medium text-foreground">${row.job.hourlyRate}/hr</p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Posted</p>
              <p className="font-medium text-foreground">{new Date(row.job.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <Button className="w-full gap-2" onClick={() => onAccept(row.job.id)} disabled={isPending}>
            {isPending ? (
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
  );
}

export default function ContractorJobBoard() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();

  // Public board — only public-visibility jobs within service area
  const { data: jobs, isLoading, refetch, dataUpdatedAt } = trpc.jobBoard.list.useQuery(undefined, {
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  const { data: debugData, refetch: refetchDebug } = trpc.jobBoard.debug.useQuery();

  // Private board — private-visibility jobs from trusted companies, same service-area filter
  const { data: privateJobs, isLoading: privateLoading, refetch: refetchPrivate } = trpc.jobBoard.listPrivate.useQuery(undefined, {
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const refreshGeocode = trpc.contractor.refreshGeocode.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Location updated! Refreshing job board...");
        utils.jobBoard.list.invalidate();
        utils.jobBoard.listPrivate.invalidate();
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
      utils.jobBoard.listPrivate.invalidate();
      setSelectedJob(null);
    },
    onError: (err) => toast.error(err.message || "Failed to accept job"),
  });

  const acceptPrivateJob = trpc.jobBoard.acceptPrivate.useMutation({
    onSuccess: () => {
      toast.success("Job accepted! Check your active jobs.");
      utils.jobBoard.list.invalidate();
      utils.jobBoard.listPrivate.invalidate();
      setSelectedJob(null);
    },
    onError: (err) => toast.error(err.message || "Failed to accept job"),
  });

  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const prevJobCountRef = useRef<number | null>(null);
  const newJobsToastRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (dataUpdatedAt) setLastRefreshed(new Date(dataUpdatedAt));
  }, [dataUpdatedAt]);

  useEffect(() => {
    if (!jobs) return;
    const currentCount = jobs.length;
    if (prevJobCountRef.current !== null && currentCount > prevJobCountRef.current) {
      const newCount = currentCount - prevJobCountRef.current;
      if (newJobsToastRef.current) toast.dismiss(newJobsToastRef.current);
      newJobsToastRef.current = toast(
        `${newCount} new job${newCount > 1 ? "s" : ""} available!`,
        {
          description: "New jobs were posted in your service area.",
          icon: <Zap className="h-4 w-4 text-orange-400" />,
          duration: 8000,
          action: { label: "View", onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
        }
      );
    }
    prevJobCountRef.current = currentCount;
  }, [jobs]);

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === "visible") {
      refetch(); refetchDebug(); refetchPrivate();
    }
  }, [refetch, refetchDebug, refetchPrivate]);

  useEffect(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [handleVisibilityChange]);

  const handleManualRefresh = () => { refetch(); refetchDebug(); refetchPrivate(); };

  const handleAccept = (jobId: number) => {
    if (selectedJob?.isPrivate) {
      acceptPrivateJob.mutate({ jobId });
    } else {
      acceptJob.mutate({ jobId });
    }
  };

  if (!user) return null;

  const privateCount = privateJobs?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Job Board</h1>
          <p className="text-muted-foreground mt-1">Open jobs available to you — first to accept wins</p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleManualRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDebug(v => !v)} className="gap-2 text-yellow-400 border-yellow-400/40 hover:bg-yellow-400/10">
            <Bug className="h-4 w-4" /> {showDebug ? "Hide" : "Debug"}
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
                  <p>Coords: <span className={debugData.contractor.hasCoords ? "text-green-400" : "text-red-400"}>{debugData.contractor.hasCoords ? `${debugData.contractor.latitude}, ${debugData.contractor.longitude}` : "❌ NULL — geocoding failed or not yet run"}</span></p>
                  <p>Service radius: <span className="text-foreground">{debugData.contractor.radiusMiles} miles</span></p>
                  <p>Service ZIPs: <span className="text-foreground">{(debugData.contractor.serviceAreaZips as string[] | null)?.join(", ") || "(none)"}</span></p>
                  <p className="text-yellow-300 mt-1">Note: Both public and private boards apply this same radius filter.</p>
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

      {/* Tabs */}
      <Tabs defaultValue="public" className="space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="public" className="gap-2">
            <Globe className="h-4 w-4" /> Public Jobs
            {!isLoading && jobs && jobs.length > 0 && (
              <Badge className="ml-1 bg-primary/20 text-primary border-primary/30 text-xs px-1.5 py-0">{jobs.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="private" className="gap-2">
            <Lock className="h-4 w-4" /> Private Jobs
            {!privateLoading && privateCount > 0 && (
              <Badge className="ml-1 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs px-1.5 py-0">{privateCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Public Board ─────────────────────────────────────────────── */}
        <TabsContent value="public" className="space-y-4">
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
              <span className="ml-auto text-xs text-muted-foreground/60 hidden sm:block">Auto-refreshes every 30s</span>
            </div>
          )}
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}</div>
          ) : !jobs || jobs.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
                {debugData?.contractor && !debugData.contractor.hasCoords ? (
                  <>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Location not set up</h3>
                    <p className="text-muted-foreground max-w-sm mb-4">
                      Your service area coordinates could not be determined. This prevents the job board from filtering by distance.
                    </p>
                    <Button onClick={() => refreshGeocode.mutate()} disabled={refreshGeocode.isPending} className="gap-2">
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
              {jobs.map((row: any) => <JobCard key={row.job.id} row={row} onSelect={setSelectedJob} />)}
            </div>
          )}
        </TabsContent>

        {/* ── Private Board ────────────────────────────────────────────── */}
        <TabsContent value="private" className="space-y-4">
          {/* Explanation banner */}
          <Card className="bg-emerald-950/20 border-emerald-500/20">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-300">Your Private Job Board</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Jobs listed here are posted by companies that have marked you as a <strong className="text-emerald-400">trusted contractor</strong>. These jobs are not visible to other contractors. Like the public board, only jobs within your service area are shown.
                </p>
              </div>
            </CardContent>
          </Card>

          {privateLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}</div>
          ) : !privateJobs || privateJobs.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Lock className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No private jobs yet</h3>
                <p className="text-muted-foreground max-w-sm">
                  When a company marks you as trusted and posts a private job within your service area, it will appear here. Complete public jobs and build your reputation to earn trusted status.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4 text-emerald-400" />
                  <span className="font-semibold text-foreground">{privateJobs.length}</span> private job{privateJobs.length !== 1 ? "s" : ""} from trusted companies in your area
                </span>
                <span className="ml-auto text-xs text-muted-foreground/60 hidden sm:block">Auto-refreshes every 30s</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {privateJobs.map((row: any) => (
                  <JobCard key={row.job.id} row={{ ...row, isPrivate: true }} onSelect={setSelectedJob} />
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Shared job detail dialog */}
      {selectedJob && (
        <JobDetailDialog
          row={selectedJob}
          onClose={() => setSelectedJob(null)}
          onAccept={handleAccept}
          isPending={acceptJob.isPending || acceptPrivateJob.isPending}
        />
      )}
    </div>
  );
}
