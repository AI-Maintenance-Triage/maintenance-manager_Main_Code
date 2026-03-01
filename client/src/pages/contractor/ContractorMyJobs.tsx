import { trpc } from "@/lib/trpc";
import { useViewAs } from "@/contexts/ViewAsContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Clock, CheckCircle, Play, Square, AlertCircle, Camera, CheckCheck,
  XCircle, Loader2, Navigation2, MapPin, Wifi, WifiOff, MessageSquare, FileDown,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { JobComments } from "@/components/JobComments";

const STATUS_COLORS: Record<string, string> = {
  assigned: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  in_progress: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  pending_verification: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  verified: "bg-green-500/20 text-green-400 border-green-500/30",
  disputed: "bg-red-500/20 text-red-400 border-red-500/30",
  paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  completed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In Progress",
  pending_verification: "Awaiting Verification",
  verified: "Verified",
  disputed: "Disputed",
  paid: "Paid",
  completed: "Completed",
};

/** Calculate distance in meters between two lat/lng points (Haversine formula) */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ContractorMyJobs() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const isViewingAsContractor = isAdmin && viewAs.mode === "contractor" && viewAs.contractorProfileId;

  const { data: jobs, isLoading } = trpc.contractor.allMyJobs.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const invalidate = () => {
    utils.contractor.allMyJobs.invalidate();
    utils.contractor.myJobs.invalidate();
  };

  if (!isViewingAsContractor && isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">My Jobs</h1>
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Select a contractor from the admin dashboard to impersonate them and see their jobs.</p>
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

  const activeJobs = jobs?.filter((j: any) => ["assigned", "in_progress"].includes(j.job.status)) ?? [];
  const pendingJobs = jobs?.filter((j: any) => ["pending_verification", "disputed"].includes(j.job.status)) ?? [];
  const doneJobs = jobs?.filter((j: any) => ["verified", "paid", "completed"].includes(j.job.status)) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Jobs</h1>
        <p className="text-muted-foreground mt-1">Track your assigned and completed maintenance jobs</p>
      </div>

      {activeJobs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-400" /> Active Jobs
            <span className="text-sm font-normal text-muted-foreground">({activeJobs.length})</span>
          </h2>
          {activeJobs.map((row: any) => (
            <JobCard key={row.job.id} row={row} onUpdate={invalidate} />
          ))}
        </section>
      )}

      {pendingJobs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CheckCheck className="h-5 w-5 text-orange-400" /> Awaiting Verification
            <span className="text-sm font-normal text-muted-foreground">({pendingJobs.length})</span>
          </h2>
          {pendingJobs.map((row: any) => (
            <JobCard key={row.job.id} row={row} onUpdate={invalidate} readOnly />
          ))}
        </section>
      )}

      {doneJobs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-400" /> Completed
            <span className="text-sm font-normal text-muted-foreground">({doneJobs.length})</span>
          </h2>
          {doneJobs.map((row: any) => (
            <JobCard key={row.job.id} row={row} onUpdate={invalidate} readOnly />
          ))}
        </section>
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

function JobCard({ row, onUpdate, readOnly = false }: { row: any; onUpdate: () => void; readOnly?: boolean }) {
  const { job, property } = row;
  const [showComments, setShowComments] = useState(false);

  // ── Clock-in/out session state ───────────────────────────────────────────────
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Continuous GPS tracking state ────────────────────────────────────────
  const [isTracking, setIsTracking] = useState(false);
  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Origin = where the contractor was when they clocked in
  const originLatRef = useRef<number | null>(null);
  const originLngRef = useRef<number | null>(null);

  // Auto-clock-out: track when contractor returned to origin
  const returnedToOriginAtRef = useRef<number | null>(null);
  const autoClockOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-clock-out settings from server ──────────────────────────────────
  const { data: autoSettings } = trpc.timeTracking.getAutoClockOutSettings.useQuery(undefined, {
    staleTime: 60_000,
  });
  const autoClockOutMinutes = autoSettings?.autoClockOutMinutes ?? 15;
  const autoClockOutRadiusMeters = autoSettings?.autoClockOutRadiusMeters ?? 200;

  // ── tRPC mutations ────────────────────────────────────────────────────────
  const clockIn = trpc.timeTracking.clockIn.useMutation({
    onSuccess: (data) => {
      setActiveSessionId(data.sessionId);
      toast.success("Clocked in! Live GPS tracking started.");
      onUpdate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const clockOut = trpc.timeTracking.clockOut.useMutation({
    onSuccess: () => {
      stopTracking();
      setActiveSessionId(null);
      toast.success("Clocked out! Time recorded.");
      onUpdate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addPing = trpc.timeTracking.addPing.useMutation();

  const markComplete = trpc.contractor.markComplete.useMutation({
    onSuccess: () => {
      toast.success("Job marked as complete! Awaiting company verification.");
      setShowCompleteDialog(false);
      setCompletionNotes("");
      setPhotoUrls([]);
      onUpdate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ── Stop watchPosition and clear auto-clock-out timer ────────────────────
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (autoClockOutTimerRef.current !== null) {
      clearTimeout(autoClockOutTimerRef.current);
      autoClockOutTimerRef.current = null;
    }
    returnedToOriginAtRef.current = null;
    setIsTracking(false);
  }, []);

  // ── Handle each GPS position update ──────────────────────────────────────
  const handlePositionUpdate = useCallback(
    (pos: GeolocationPosition, sessionId: number) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCurrentLat(lat);
      setCurrentLng(lng);

      // Send ping to server
      addPing.mutate({
        sessionId,
        latitude: String(lat),
        longitude: String(lng),
        locationType: "transit",
      });

      // Auto-clock-out: check if contractor is back near origin
      if (originLatRef.current !== null && originLngRef.current !== null) {
        const distToOrigin = haversineMeters(lat, lng, originLatRef.current, originLngRef.current);
        if (distToOrigin <= autoClockOutRadiusMeters) {
          // Contractor is within the origin radius
          if (returnedToOriginAtRef.current === null) {
            returnedToOriginAtRef.current = Date.now();
            const msUntilAutoClockOut = autoClockOutMinutes * 60 * 1000;
            toast.info(
              `You're back near your starting location. Auto clock-out in ${autoClockOutMinutes} minute${autoClockOutMinutes !== 1 ? "s" : ""} if you don't clock out manually.`,
              { duration: 8000 }
            );
            autoClockOutTimerRef.current = setTimeout(() => {
              // Double-check they're still near origin before auto clocking out
              toast.warning("Auto clocking you out — you returned to your starting location.", { duration: 5000 });
              clockOut.mutate({
                sessionId,
                latitude: String(lat),
                longitude: String(lng),
                method: "auto_geofence",
              });
            }, msUntilAutoClockOut);
          }
        } else {
          // Contractor moved away from origin — cancel the auto-clock-out timer
          if (returnedToOriginAtRef.current !== null) {
            returnedToOriginAtRef.current = null;
            if (autoClockOutTimerRef.current !== null) {
              clearTimeout(autoClockOutTimerRef.current);
              autoClockOutTimerRef.current = null;
            }
          }
        }
      }
    },
    [addPing, clockOut, autoClockOutMinutes, autoClockOutRadiusMeters]
  );

  // ── Start continuous GPS watch ────────────────────────────────────────────
  const startTracking = useCallback(
    (sessionId: number, originLat: number, originLng: number) => {
      if (!navigator.geolocation) {
        toast.error("Geolocation not supported by your browser");
        return;
      }
      originLatRef.current = originLat;
      originLngRef.current = originLng;
      setIsTracking(true);

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => handlePositionUpdate(pos, sessionId),
        (err) => {
          console.warn("[GPS] watchPosition error:", err.message);
          // Don't stop tracking on transient errors — browser will retry
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0, // Always get a fresh position — no caching
        }
      );
    },
    [handlePositionUpdate]
  );

  // ── Clock-in: get initial position then start watch ───────────────────────
  const handleClockIn = () => {
    setGettingLocation(true);
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported by your browser");
      setGettingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGettingLocation(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        clockIn.mutate(
          { jobId: job.id, latitude: String(lat), longitude: String(lng) },
          {
            onSuccess: (data) => {
              startTracking(data.sessionId, lat, lng);
            },
          }
        );
      },
      () => {
        setGettingLocation(false);
        toast.error("Could not get your location. Please enable GPS.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ── Manual clock-out ──────────────────────────────────────────────────────
  const handleClockOut = () => {
    if (!activeSessionId) return;
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGettingLocation(false);
        clockOut.mutate({
          sessionId: activeSessionId,
          latitude: String(pos.coords.latitude),
          longitude: String(pos.coords.longitude),
          method: "manual",
        });
      },
      () => {
        setGettingLocation(false);
        // Clock out without GPS if location fails
        clockOut.mutate({
          sessionId: activeSessionId,
          latitude: "0",
          longitude: "0",
          method: "manual",
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => stopTracking();
  }, [stopTracking]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { toast.error("Photo must be under 16 MB"); return; }
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setPhotoUrls(prev => [...prev, url]);
      toast.success("Photo uploaded");
    } catch {
      toast.error("Photo upload failed. Please try again.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const statusClass = STATUS_COLORS[job.status] ?? "bg-gray-500/20 text-gray-400";
  const statusLabel = STATUS_LABELS[job.status] ?? job.status;

  return (
    <>
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-card-foreground">{job.title}</h3>
                {job.isEmergency && <Badge variant="destructive" className="text-xs">Emergency</Badge>}
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusClass}`}>{statusLabel}</span>
              </div>
              {job.description && <p className="text-sm text-muted-foreground line-clamp-2">{job.description}</p>}
              {property && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {property.name || property.address} — {property.city}, {property.state}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {job.aiSkillTier && <span className="text-primary font-medium">{job.aiSkillTier}</span>}
                {job.hourlyRate && <span className="font-medium text-foreground">${job.hourlyRate}/hr</span>}
              </div>

              {/* Live GPS tracking indicator */}
              {isTracking && activeSessionId && (
                <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 w-fit">
                  <Wifi className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
                  <span className="text-xs text-blue-400 font-medium">Live GPS tracking active</span>
                  {currentLat !== null && currentLng !== null && (
                    <span className="text-xs text-blue-300/70">
                      {currentLat.toFixed(5)}, {currentLng.toFixed(5)}
                    </span>
                  )}
                </div>
              )}

              {job.status === "disputed" && job.disputeNotes && (
                <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-xs font-medium text-red-400 mb-1 flex items-center gap-1"><XCircle className="h-3 w-3" /> Dispute Notes</p>
                  <p className="text-xs text-red-300">{job.disputeNotes}</p>
                </div>
              )}
              {job.status === "pending_verification" && (
                <div className="mt-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <p className="text-xs text-orange-300">Submitted for verification. The company will review your work shortly.</p>
                </div>
              )}
              {job.status === "verified" && (
                <div className="mt-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-1">
                  <p className="text-xs font-medium text-green-400 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Verified — Payment Processing</p>
                  {job.totalCost && (
                    <p className="text-sm font-bold text-green-300">Your payout: ${parseFloat(job.totalCost ?? "0").toFixed(2)}</p>
                  )}
                  {job.totalLaborMinutes && (
                    <p className="text-xs text-green-300/70">
                      {Math.floor((job.totalLaborMinutes ?? 0) / 60)}h {(job.totalLaborMinutes ?? 0) % 60}m @ ${parseFloat(job.hourlyRate ?? "0").toFixed(2)}/hr
                    </p>
                  )}
                  {job.verificationNotes && <p className="text-xs text-green-300/70 mt-1">{job.verificationNotes}</p>}
                </div>
              )}
              {job.status === "paid" && (
                <div className="mt-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                  <p className="text-xs font-medium text-emerald-400 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Paid</p>
                  {job.totalCost && (
                    <p className="text-sm font-bold text-emerald-300">Payout: ${parseFloat(job.totalCost ?? "0").toFixed(2)}</p>
                  )}
                  {job.totalLaborMinutes && (
                    <p className="text-xs text-emerald-300/70">
                      {Math.floor((job.totalLaborMinutes ?? 0) / 60)}h {(job.totalLaborMinutes ?? 0) % 60}m @ ${parseFloat(job.hourlyRate ?? "0").toFixed(2)}/hr
                    </p>
                  )}
                  <a
                    href={`/api/receipt/${job.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-1 text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                  >
                    <FileDown className="h-3 w-3" /> Download Receipt
                  </a>
                </div>
              )}
            </div>

              {/* Notes button — always visible */}
              <div className="flex flex-col gap-2 shrink-0 mr-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1 h-7"
                  onClick={() => setShowComments(true)}
                >
                  <MessageSquare className="h-3 w-3" /> Notes
                </Button>
              </div>
              {!readOnly && (
              <div className="flex flex-col gap-2 shrink-0">
                {job.status === "assigned" && !activeSessionId && (
                  <Button
                    onClick={handleClockIn}
                    disabled={clockIn.isPending || gettingLocation}
                    className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {gettingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {gettingLocation ? "Getting GPS..." : "Clock In"}
                  </Button>
                )}
                {(job.status === "in_progress" || activeSessionId) && (
                  <>
                    <Button
                      onClick={handleClockOut}
                      disabled={clockOut.isPending || gettingLocation}
                      variant="destructive"
                      className="gap-2"
                    >
                      {clockOut.isPending || gettingLocation
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : isTracking ? <Navigation2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      {gettingLocation ? "Getting GPS..." : "Clock Out"}
                    </Button>
                    <Button
                      onClick={() => setShowCompleteDialog(true)}
                      variant="outline"
                      className="gap-2 border-green-500/50 text-green-400 hover:bg-green-500/10"
                    >
                      <CheckCheck className="h-4 w-4" />
                      Mark Complete
                    </Button>
                  </>
                )}
                {job.status === "assigned" && (
                  <Button
                    onClick={() => setShowCompleteDialog(true)}
                    variant="outline"
                    className="gap-2 border-green-500/50 text-green-400 hover:bg-green-500/10"
                  >
                    <CheckCheck className="h-4 w-4" />
                    Mark Complete
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Job Complete</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="completion-notes">Work Summary <span className="text-destructive">*</span></Label>
              <Textarea
                id="completion-notes"
                placeholder="Describe the work completed, materials used, and any notes for the property manager..."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Completion Photos (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {photoUrls.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt={`Photo ${i + 1}`} className="h-16 w-16 object-cover rounded-lg border border-border" />
                    <button
                      onClick={() => setPhotoUrls(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >×</button>
                  </div>
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="h-16 w-16 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                >
                  {uploadingPhoto ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Camera className="h-5 w-5" /><span className="text-xs">Add</span></>}
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              <p className="text-xs text-muted-foreground">Photos help the company verify the completed work.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>Cancel</Button>
            <Button
              onClick={() => markComplete.mutate({ jobId: job.id, completionNotes, completionPhotoUrls: photoUrls })}
              disabled={markComplete.isPending || !completionNotes.trim()}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              {markComplete.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Submit for Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet open={showComments} onOpenChange={setShowComments}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-0 shrink-0">
            <SheetTitle className="text-base truncate">{job.title}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <JobComments maintenanceRequestId={job.id} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
