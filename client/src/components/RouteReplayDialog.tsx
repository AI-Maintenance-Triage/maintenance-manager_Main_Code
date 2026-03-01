/**
 * RouteReplayDialog
 *
 * Shows the full GPS breadcrumb trail for a completed job session on a Google Map.
 * Opens from a "View Route" button on job cards in CompanyJobs / CompanyVerification.
 */
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapView } from "@/components/Map";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, MapPin, Navigation2, Route } from "lucide-react";
import { useRef, useCallback, useEffect } from "react";

interface RouteReplayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: number;
  jobTitle: string;
}

function formatDuration(clockInTime: number, clockOutTime: number | null): string {
  if (!clockOutTime) return "In progress";
  const ms = clockOutTime - clockInTime;
  const totalMins = Math.floor(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function RouteReplayDialog({ open, onOpenChange, jobId, jobTitle }: RouteReplayDialogProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  // Fetch all sessions for this job
  const { data: sessions, isLoading: sessionsLoading } = trpc.jobs.timeSessions.useQuery(
    { jobId },
    { enabled: open }
  );

  // Use the first completed session (most recent)
  const session = sessions?.find((s: any) => s.status === "completed") ?? sessions?.[0];

  // Fetch location pings for the session
  const { data: pings, isLoading: pingsLoading } = trpc.timeTracking.getLocationPings.useQuery(
    { sessionId: session?.id ?? 0 },
    { enabled: open && !!session?.id }
  );

  const isLoading = sessionsLoading || pingsLoading;

  const clearMap = useCallback(() => {
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
  }, []);

  const drawRoute = useCallback((map: google.maps.Map) => {
    clearMap();
    if (!session || !pings || pings.length === 0) return;

    const path = pings.map((p: any) => ({
      lat: parseFloat(p.latitude),
      lng: parseFloat(p.longitude),
    }));

    // Draw the polyline
    polylineRef.current = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#3b82f6",
      strokeOpacity: 0.85,
      strokeWeight: 4,
      map,
    });

    // Clock-in marker (green)
    const clockInEl = document.createElement("div");
    clockInEl.style.cssText = `
      width: 32px; height: 32px; border-radius: 50%;
      background-color: #22c55e; border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
    `;
    clockInEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    clockInEl.title = `Clock-in: ${formatTime(session.clockInTime)}`;
    const clockInMarker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: path[0],
      title: `Clock-in: ${formatTime(session.clockInTime)}`,
      content: clockInEl,
    });
    markersRef.current.push(clockInMarker);

    // Clock-out marker (red) — only if session is complete
    if (session.clockOutTime && path.length > 1) {
      const clockOutEl = document.createElement("div");
      clockOutEl.style.cssText = `
        width: 32px; height: 32px; border-radius: 50%;
        background-color: #ef4444; border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
      `;
      clockOutEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
      clockOutEl.title = `Clock-out: ${formatTime(session.clockOutTime)}`;
      const clockOutMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: path[path.length - 1],
        title: `Clock-out: ${formatTime(session.clockOutTime)}`,
        content: clockOutEl,
      });
      markersRef.current.push(clockOutMarker);
    }

    // Fit map to the route
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
    if (path.length === 1) map.setZoom(15);
  }, [session, pings, clearMap]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    if (!isLoading) drawRoute(map);
  }, [isLoading, drawRoute]);

  useEffect(() => {
    if (mapRef.current && !isLoading) {
      drawRoute(mapRef.current);
    }
  }, [isLoading, drawRoute]);

  // Cleanup on close
  useEffect(() => {
    if (!open) clearMap();
  }, [open, clearMap]);

  const pingCount = pings?.length ?? 0;
  const firstPing = pings?.[0];
  const lastPing = pings?.[pingCount - 1];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-primary" />
            Route Replay — {jobTitle}
          </DialogTitle>
        </DialogHeader>

        {/* Session stats bar */}
        {session && (
          <div className="flex items-center gap-4 px-5 py-3 bg-muted/30 border-b border-border text-xs text-muted-foreground shrink-0 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-green-400" />
              Clock-in: <span className="text-foreground font-medium">{formatTime(session.clockInTime)}</span>
            </span>
            {session.clockOutTime && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-red-400" />
                Clock-out: <span className="text-foreground font-medium">{formatTime(session.clockOutTime)}</span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Navigation2 className="h-3.5 w-3.5 text-blue-400" />
              Duration: <span className="text-foreground font-medium">{formatDuration(session.clockInTime, session.clockOutTime ?? null)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              GPS points: <span className="text-foreground font-medium">{pingCount}</span>
            </span>
            {session.clockOutMethod && session.clockOutMethod !== "manual" && (
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                {session.clockOutMethod === "auto_geofence" ? "Auto (returned to origin)" : "Auto (timeout)"}
              </Badge>
            )}
          </div>
        )}

        {/* Map area */}
        <div className="flex-1 relative" style={{ minHeight: 400 }}>
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
              <div className="text-center space-y-2">
                <Skeleton className="h-8 w-8 rounded-full mx-auto" />
                <p className="text-sm text-muted-foreground">Loading route data…</p>
              </div>
            </div>
          ) : !session ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Route className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No GPS session found for this job.</p>
              </div>
            </div>
          ) : pingCount === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2">
                <MapPin className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No GPS pings recorded for this session.</p>
                <p className="text-xs text-muted-foreground">The contractor may have clocked in without an active GPS signal.</p>
              </div>
            </div>
          ) : (
            <MapView
              className="w-full h-full"
              initialCenter={
                firstPing
                  ? { lat: parseFloat(firstPing.latitude), lng: parseFloat(firstPing.longitude) }
                  : { lat: 39.8283, lng: -98.5795 }
              }
              initialZoom={14}
              onMapReady={handleMapReady}
            />
          )}

          {/* Legend */}
          {!isLoading && session && pingCount > 0 && (
            <div className="absolute top-3 right-3 bg-background/90 backdrop-blur border border-border rounded-lg px-3 py-2 text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                  <svg width="6" height="6" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
                <span className="text-muted-foreground">Clock-in</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-red-500 border-2 border-white flex items-center justify-center">
                  <svg width="6" height="6" viewBox="0 0 24 24" fill="white"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                </div>
                <span className="text-muted-foreground">Clock-out</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-6 bg-blue-500 rounded-full" />
                <span className="text-muted-foreground">GPS trail</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
