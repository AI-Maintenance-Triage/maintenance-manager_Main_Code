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
import { Input } from "@/components/ui/input";
import {
  Clock, CheckCircle, Play, Square, AlertCircle, Camera, CheckCheck,
  XCircle, Loader2, Navigation2, MapPin, Wifi, MessageSquare, FileDown,
  Plus, Trash2, Receipt,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  const { job, property, companySettings } = row;
  const geofenceRadiusFeet: number = companySettings?.geofenceRadiusFeet ?? 500;
  const billableTimePolicy: string = companySettings?.billableTimePolicy ?? "on_site_only";
  // ── Geofence proximity state ─────────────────────────────────────────────
  // null = not yet checked, true = inside, false = outside
  const [geofenceStatus, setGeofenceStatus] = useState<"inside" | "outside" | "unknown" | "checking">("unknown");
  const [distanceToPropertyFt, setDistanceToPropertyFt] = useState<number | null>(null);
  const [showComments, setShowComments] = useState(false);

  // ── Clock-in/out session state ───────────────────────────────────────────────
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showResubmitDialog, setShowResubmitDialog] = useState(false);
  const [resubmitNote, setResubmitNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);

  // ── Materials / parts reimbursement state ────────────────────────────────
  type MaterialLine = { description: string; price: string };
  const [materialLines, setMaterialLines] = useState<MaterialLine[]>([]);
  const [receiptPhotoUrl, setReceiptPhotoUrl] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  // ── Session history (all sessions for this job) ─────────────────────────
  const { data: allSessions } = trpc.jobs.timeSessions.useQuery(
    { jobId: job.id },
    { enabled: job.status === "in_progress" || job.status === "assigned", staleTime: 10_000 }
  );

  // ── Running clock timer state (declared early; useEffect wired after clockState) ───
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Total billed minutes from completed sessions
  const completedMinutes = useMemo(() => {
    if (!allSessions) return 0;
    return allSessions
      .filter((s: any) => s.status === "completed" && s.totalMinutes)
      .reduce((sum: number, s: any) => sum + (s.totalMinutes ?? 0), 0);
  }, [allSessions]);

  const formatDuration = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  };

  // ── Restore active session from server on mount ──────────────────────────
  const { data: activeSessionData, isLoading: sessionLoading } = trpc.timeTracking.getActiveSessionForJob.useQuery(
    { jobId: job.id },
    { enabled: job.status === "in_progress" && activeSessionId === null, staleTime: 0 }
  );
  useEffect(() => {
    if (activeSessionData && activeSessionId === null) {
      setActiveSessionId(activeSessionData.id);
    }
  }, [activeSessionData, activeSessionId]);

  // ── Derive clock state ────────────────────────────────────────────────────
  // clockState drives which buttons to show:
  //   "idle"    → assigned, not yet clocked in → show "Clock In & Start Job"
  //   "active"  → in_progress, clocked in     → show "Clock Out (Temporary)" + "Finish Job & Clock Out"
  //   "paused"  → in_progress, clocked out    → show "Clock Back In" + "Finish Job"
  const clockState: "idle" | "active" | "paused" | "loading" = (() => {
    if (job.status === "assigned") return "idle";
    if (job.status !== "in_progress") return "idle";
    if (sessionLoading && activeSessionId === null) return "loading";
    if (activeSessionId !== null) return "active";
    // in_progress but no active session → paused (clocked out temporarily)
    return "paused";
  })();

  // ── Start/stop the live timer based on clockState ───────────────────────
  useEffect(() => {
    if (clockState === "active" && activeSessionData?.clockInTime) {
      const startMs = activeSessionData.clockInTime;
      const tick = () => setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else if (clockState === "active" && activeSessionId) {
      // session restored but clockInTime not yet loaded — tick from 0
      timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setElapsedSeconds(0);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [clockState, activeSessionId, activeSessionData]);

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
    onError: (err: any) => {
      if (err?.message?.startsWith("GEOFENCE_REQUIRED:")) {
        const feet = err.message.split(":")[1];
        toast.error(`You must be within ${feet} ft of the property to clock in.`, { duration: 6000 });
      } else {
        toast.error(err.message);
      }
    },
  });

  const clockOut = trpc.timeTracking.clockOut.useMutation({
    onSuccess: (_, vars) => {
      stopTracking();
      setActiveSessionId(null);
      if (vars.method === "auto_geofence") {
        toast.warning(
          "⏸️ Billing paused — you were auto-clocked out after returning to your starting location. Clock back in to resume billing.",
          { duration: 8000 }
        );
      } else if (vars.method === "auto_timeout") {
        toast.warning(
          "⏸️ Billing paused — session timed out. Clock back in to resume billing.",
          { duration: 8000 }
        );
      } else {
        toast.success("Clocked out! Time recorded.");
      }
      onUpdate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addPing = trpc.timeTracking.addPing.useMutation();

  const createReceipt = trpc.receipts.create.useMutation();

  const markComplete = trpc.contractor.markComplete.useMutation({
    onSuccess: async (_, vars) => {
      // Submit material receipts if any
      const validLines = materialLines.filter(l => l.description.trim() && l.price.trim());
      if (validLines.length > 0) {
        const totalAmount = validLines.reduce((sum, l) => sum + parseFloat(l.price || "0"), 0).toFixed(2);
        const descriptionText = validLines.map(l => `${l.description}: $${l.price}`).join("; ");
        try {
          await createReceipt.mutateAsync({
            jobId: vars.jobId,
            description: descriptionText,
            amount: totalAmount,
            receiptImageUrl: receiptPhotoUrl ?? undefined,
          });
        } catch { /* non-critical */ }
      }
      toast.success("Job marked as complete! Awaiting company verification.");
      setShowCompleteDialog(false);
      setCompletionNotes("");
      setPhotoUrls([]);
      setMaterialLines([]);
      setReceiptPhotoUrl(null);
      onUpdate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resubmitDispute = trpc.contractor.resubmitDispute.useMutation({
    onSuccess: () => {
      toast.success("Job resubmitted for verification!");
      setShowResubmitDialog(false);
      setResubmitNote("");
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

  // ── Check proximity to property ──────────────────────────────────────────
  const checkProximity = useCallback(() => {
    if (!navigator.geolocation || !property?.latitude || !property?.longitude) {
      setGeofenceStatus("unknown");
      return;
    }
    setGeofenceStatus("checking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const R = 6371000;
        const lat1 = parseFloat(String(property.latitude));
        const lng1 = parseFloat(String(property.longitude));
        const lat2 = pos.coords.latitude;
        const lng2 = pos.coords.longitude;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
        const distMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distFt = Math.round(distMeters * 3.28084);
        setDistanceToPropertyFt(distFt);
        const radiusMeters = geofenceRadiusFeet * 0.3048;
        setGeofenceStatus(distMeters <= radiusMeters ? "inside" : "outside");
      },
      () => setGeofenceStatus("unknown"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [property?.latitude, property?.longitude, geofenceRadiusFeet]);

  // Auto-check proximity when job is idle (assigned, not yet clocked in)
  useEffect(() => {
    if (clockState !== "idle" || billableTimePolicy !== "on_site_only") return;
    checkProximity();
    const interval = setInterval(checkProximity, 15000);
    return () => clearInterval(interval);
  }, [clockState, billableTimePolicy, checkProximity]);

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

  // ── Clock-out helper (can be called with or without location) ───────────
  const doClockOut = useCallback((sessionId: number, lat: string, lng: string, method: "manual" | "auto_geofence" | "auto_timeout" = "manual") => {
    clockOut.mutate({ sessionId, latitude: lat, longitude: lng, method });
  }, [clockOut]);

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
        doClockOut(activeSessionId, "0", "0", "manual");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // ── Handle complete job: auto-clock-out first if still clocked in ─────────
  const handleMarkComplete = () => {
    setShowCompleteDialog(true);
  };

  const handleSubmitComplete = () => {
    const validLines = materialLines.filter(l => l.description.trim() && l.price.trim());
    const hasMaterials = validLines.length > 0;
    if (hasMaterials && !receiptPhotoUrl) {
      toast.error("Please upload a receipt photo for your materials.");
      return;
    }
    // If still clocked in, clock out first then mark complete
    if (activeSessionId) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            doClockOut(activeSessionId, String(pos.coords.latitude), String(pos.coords.longitude), "manual");
            markComplete.mutate({ jobId: job.id, completionNotes, completionPhotoUrls: photoUrls });
          },
          () => {
            doClockOut(activeSessionId, "0", "0", "manual");
            markComplete.mutate({ jobId: job.id, completionNotes, completionPhotoUrls: photoUrls });
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      } else {
        doClockOut(activeSessionId, "0", "0", "manual");
        markComplete.mutate({ jobId: job.id, completionNotes, completionPhotoUrls: photoUrls });
      }
    } else {
      markComplete.mutate({ jobId: job.id, completionNotes, completionPhotoUrls: photoUrls });
    }
  };

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => stopTracking();
  }, [stopTracking]);

  // ── Receipt photo upload ──────────────────────────────────────────────────
  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { toast.error("Receipt photo must be under 16 MB"); return; }
    setUploadingReceipt(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setReceiptPhotoUrl(url);
      toast.success("Receipt uploaded");
    } catch {
      toast.error("Receipt upload failed. Please try again.");
    } finally {
      setUploadingReceipt(false);
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = "";
    }
  };

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
                {/* Priority badge — shows override if set, otherwise AI priority */}
                {((job as any).overridePriority || job.aiPriority) && (() => {
                  const PRIORITY_COLORS: Record<string, string> = {
                    emergency: "bg-red-500/20 text-red-400 border-red-500/30",
                    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
                    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                    low: "bg-green-500/20 text-green-400 border-green-500/30",
                  };
                  const p = (job as any).overridePriority ?? job.aiPriority;
                  return (
                    <span className={`px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[p] ?? ""}`}>
                      {p} priority{(job as any).overridePriority ? " (updated)" : ""}
                    </span>
                  );
                })()}
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

              {job.status === "disputed" && (
                <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 space-y-2">
                  <p className="text-xs font-medium text-red-400 flex items-center gap-1"><XCircle className="h-3 w-3" /> Job Disputed</p>
                  {job.disputeNotes && <p className="text-xs text-red-300">{job.disputeNotes}</p>}
                  {job.disputeResponseNote && (
                    <p className="text-xs text-orange-300"><span className="font-medium">Your response:</span> {job.disputeResponseNote}</p>
                  )}
                  {!job.disputeResponseNote && !readOnly && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1 h-7 border-red-500/40 text-red-400 hover:bg-red-500/10"
                      onClick={() => setShowResubmitDialog(true)}
                    >
                      <CheckCheck className="h-3 w-3" /> Resubmit for Verification
                    </Button>
                  )}
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

            {/* ── Running timer + session history (in_progress only) ──────────────── */}
            {(job.status === "in_progress") && (
              <div className="mt-3 space-y-2">
                {/* Live timer */}
                {clockState === "active" && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-green-400 font-mono font-medium">
                      {formatDuration(elapsedSeconds)}
                    </span>
                    <span className="text-xs text-green-400/60">billed this session</span>
                    {completedMinutes > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        +{Math.floor(completedMinutes / 60)}h {completedMinutes % 60}m prior
                      </span>
                    )}
                  </div>
                )}
                {clockState === "paused" && completedMinutes > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {Math.floor(completedMinutes / 60)}h {completedMinutes % 60}m billed so far
                    </span>
                  </div>
                )}
                {/* Session history */}
                {allSessions && allSessions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Session history</p>
                    {allSessions.map((s: any, i: number) => (
                      <div key={s.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="w-4 text-center text-muted-foreground/50">{i + 1}.</span>
                        <span>
                          {new Date(s.clockInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {" – "}
                          {s.clockOutTime
                            ? new Date(s.clockOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : <span className="text-green-400">ongoing</span>}
                        </span>
                        {s.totalMinutes && (
                          <span className="ml-auto text-muted-foreground/70">
                            {Math.floor(s.totalMinutes / 60)}h {s.totalMinutes % 60}m
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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

                {/* STATE 1: Assigned, not yet clocked in */}
                {clockState === "idle" && (
                  <div className="flex flex-col gap-2">
                    {/* Geofence banner — shown when on_site_only and contractor is outside radius */}
                    {billableTimePolicy === "on_site_only" && geofenceStatus === "outside" && (
                      <div className="flex flex-col gap-1.5 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          <span className="text-xs text-amber-300 font-medium">
                            Proceed to the property to clock in
                          </span>
                        </div>
                        <p className="text-xs text-amber-400/80 leading-snug">
                          You will be able to clock in when you are within{" "}
                          <span className="font-semibold text-amber-300">{geofenceRadiusFeet.toLocaleString()} ft</span>{" "}
                          of the property.{distanceToPropertyFt !== null && (
                            <> You are currently <span className="font-semibold">{distanceToPropertyFt.toLocaleString()} ft</span> away.</>
                          )}
                        </p>
                        <button
                          onClick={checkProximity}
                          className="text-xs text-amber-400 underline underline-offset-2 text-left w-fit"
                        >
                          Check again
                        </button>
                      </div>
                    )}
                    {/* Normal clock-in button — disabled when outside geofence */}
                    <Button
                      onClick={handleClockIn}
                      disabled={
                        clockIn.isPending ||
                        gettingLocation ||
                        (billableTimePolicy === "on_site_only" && geofenceStatus === "outside")
                      }
                      className="gap-2 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                    >
                      {gettingLocation || clockIn.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : geofenceStatus === "checking"
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Play className="h-4 w-4" />}
                      {gettingLocation ? "Getting GPS..." : clockIn.isPending ? "Starting..." : "Clock In & Start Job"}
                    </Button>
                  </div>
                )}

                {/* STATE 2: In progress, currently clocked in */}
                {clockState === "active" && (
                  <>
                    <Button
                      onClick={handleClockOut}
                      disabled={clockOut.isPending || gettingLocation}
                      variant="outline"
                      className="gap-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                    >
                      {clockOut.isPending || gettingLocation
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Square className="h-4 w-4" />}
                      {gettingLocation ? "Getting GPS..." : "Clock Out (Temporary)"}
                    </Button>
                    <Button
                      onClick={handleMarkComplete}
                      className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCheck className="h-4 w-4" />
                      Finish Job & Clock Out
                    </Button>
                  </>
                )}

                {/* STATE 3: In progress, temporarily clocked out (paused) */}
                {clockState === "paused" && (
                  <>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20">
                      <Square className="h-3 w-3 text-amber-400" />
                      <span className="text-xs text-amber-400 font-medium">Billing paused</span>
                    </div>
                    <Button
                      onClick={handleClockIn}
                      disabled={clockIn.isPending || gettingLocation}
                      className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {gettingLocation || clockIn.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Play className="h-4 w-4" />}
                      {gettingLocation ? "Getting GPS..." : "Clock Back In"}
                    </Button>
                    <Button
                      onClick={handleMarkComplete}
                      variant="outline"
                      className="gap-2 border-green-500/50 text-green-400 hover:bg-green-500/10"
                    >
                      <CheckCheck className="h-4 w-4" />
                      Finish Job
                    </Button>
                  </>
                )}

                {/* Loading state while querying active session */}
                {clockState === "loading" && (
                  <Button disabled variant="outline" className="gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                  </Button>
                )}

              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCompleteDialog} onOpenChange={(open) => {
        setShowCompleteDialog(open);
        if (!open) { setMaterialLines([]); setReceiptPhotoUrl(null); }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mark Job Complete</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {activeSessionId && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Clock className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-300">You are currently clocked in. Submitting will automatically clock you out and record your time.</p>
              </div>
            )}
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

            {/* Materials / Parts reimbursement */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5 text-amber-400" />
                  Materials Purchased
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => setMaterialLines(prev => [...prev, { description: "", price: "" }])}
                >
                  <Plus className="h-3 w-3" /> Add Material
                </Button>
              </div>
              {materialLines.length > 0 && (
                <div className="space-y-2">
                  {materialLines.map((line, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        placeholder="Description (e.g. PVC pipe)"
                        value={line.description}
                        onChange={(e) => setMaterialLines(prev => prev.map((l, idx) => idx === i ? { ...l, description: e.target.value } : l))}
                        className="flex-1 h-8 text-sm"
                      />
                      <Input
                        placeholder="$0.00"
                        value={line.price}
                        type="number"
                        min="0"
                        step="0.01"
                        onChange={(e) => setMaterialLines(prev => prev.map((l, idx) => idx === i ? { ...l, price: e.target.value } : l))}
                        className="w-24 h-8 text-sm"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setMaterialLines(prev => prev.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {/* Receipt photo — required when materials are listed */}
                  <div className="pt-1 space-y-2">
                    <p className="text-xs font-medium text-amber-400 flex items-center gap-1">
                      <Receipt className="h-3 w-3" />
                      Receipt Photo <span className="text-destructive">*</span>
                      <span className="text-muted-foreground font-normal">(required for reimbursement)</span>
                    </p>
                    {receiptPhotoUrl ? (
                      <div className="relative group w-fit">
                        <img src={receiptPhotoUrl} alt="Receipt" className="h-20 w-20 object-cover rounded-lg border border-amber-500/30" />
                        <button
                          onClick={() => setReceiptPhotoUrl(null)}
                          className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >×</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => receiptFileInputRef.current?.click()}
                        disabled={uploadingReceipt}
                        className="h-16 w-40 rounded-lg border-2 border-dashed border-amber-500/40 flex flex-col items-center justify-center gap-1 text-amber-400/70 hover:border-amber-400 hover:text-amber-400 transition-colors disabled:opacity-50"
                      >
                        {uploadingReceipt ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Camera className="h-5 w-5" /><span className="text-xs">Upload Receipt</span></>}
                      </button>
                    )}
                    <input ref={receiptFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReceiptUpload} />
                  </div>
                </div>
              )}
              {materialLines.length === 0 && (
                <p className="text-xs text-muted-foreground">Did you purchase any materials? Click "Add Material" to request reimbursement.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCompleteDialog(false); setMaterialLines([]); setReceiptPhotoUrl(null); }}>Cancel</Button>
            <Button
              onClick={handleSubmitComplete}
              disabled={markComplete.isPending || !completionNotes.trim()}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              {markComplete.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Submit for Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resubmit Dispute Dialog */}
      <Dialog open={showResubmitDialog} onOpenChange={setShowResubmitDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCheck className="h-5 w-5 text-orange-400" />
              Resubmit for Verification
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Explain what you addressed from the dispute notes. The company will review your response before re-verifying.
            </p>
            <div className="space-y-2">
              <Label htmlFor="resubmit-note">Your Response <span className="text-red-400">*</span></Label>
              <Textarea
                id="resubmit-note"
                placeholder="Describe what you fixed or clarified (minimum 10 characters)..."
                value={resubmitNote}
                onChange={(e) => setResubmitNote(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">{resubmitNote.length} / 10 minimum</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResubmitDialog(false)}>Cancel</Button>
            <Button
              onClick={() => resubmitDispute.mutate({ jobId: job.id, responseNote: resubmitNote })}
              disabled={resubmitDispute.isPending || resubmitNote.trim().length < 10}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {resubmitDispute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Resubmit Job
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
