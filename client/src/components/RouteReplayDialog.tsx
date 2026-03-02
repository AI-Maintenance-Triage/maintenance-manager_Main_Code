/**
 * RouteReplayDialog
 *
 * Shows the full GPS breadcrumb trail for a completed job session on a Google Map.
 * Opens from a "View Route" button on job cards in CompanyJobs / CompanyVerification.
 *
 * Fix: Map is initialized only after the dialog animation completes (300ms delay)
 * and a resize event is triggered to ensure the container has non-zero dimensions.
 */
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, MapPin, Navigation2, Route } from "lucide-react";
import { useRef, useCallback, useEffect, useState } from "react";

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

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_BASE_URL =
  import.meta.env.VITE_FRONTEND_FORGE_API_URL || "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;

let mapsScriptLoaded = false;
let mapsScriptLoading: Promise<void> | null = null;

function loadMapsScript(): Promise<void> {
  if (mapsScriptLoaded) return Promise.resolve();
  if (mapsScriptLoading) return mapsScriptLoading;
  mapsScriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => { mapsScriptLoaded = true; resolve(); };
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return mapsScriptLoading;
}

export function RouteReplayDialog({ open, onOpenChange, jobId, jobTitle }: RouteReplayDialogProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Fetch all sessions for this job
  const { data: sessions, isLoading: sessionsLoading } = trpc.jobs.timeSessions.useQuery(
    { jobId },
    { enabled: open }
  );

  // Use the first completed session (most recent), fall back to any session
  const session = sessions?.find((s: any) => s.status === "completed") ?? sessions?.[0];

  // Fetch location pings for the session
  const { data: pings, isLoading: pingsLoading } = trpc.timeTracking.getLocationPings.useQuery(
    { sessionId: session?.id ?? 0 },
    { enabled: open && !!session?.id }
  );

  const isLoading = sessionsLoading || pingsLoading;
  const pingCount = pings?.length ?? 0;
  const firstPing = pings?.[0];

  const clearMap = useCallback(() => {
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
  }, []);

  const drawRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map || !session || !pings || pings.length === 0) return;
    clearMap();

    const path = pings.map((p: any) => ({
      lat: parseFloat(p.latitude),
      lng: parseFloat(p.longitude),
    }));

    // Draw the polyline trail
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
    markersRef.current.push(new google.maps.marker.AdvancedMarkerElement({
      map, position: path[0],
      title: `Clock-in: ${formatTime(session.clockInTime)}`,
      content: clockInEl,
    }));

    // Clock-out marker (red) — only if session is complete and has >1 point
    if (session.clockOutTime && path.length > 1) {
      const clockOutEl = document.createElement("div");
      clockOutEl.style.cssText = `
        width: 32px; height: 32px; border-radius: 50%;
        background-color: #ef4444; border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
      `;
      clockOutEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
      markersRef.current.push(new google.maps.marker.AdvancedMarkerElement({
        map, position: path[path.length - 1],
        title: `Clock-out: ${formatTime(session.clockOutTime)}`,
        content: clockOutEl,
      }));
    }

    // Fit map to the route bounds
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
    if (path.length === 1) map.setZoom(15);
  }, [session, pings, clearMap]);

  // Initialize the map after the dialog animation completes
  useEffect(() => {
    if (!open) {
      // Clean up when dialog closes
      clearMap();
      mapRef.current = null;
      setMapReady(false);
      setMapError(null);
      return;
    }

    // Delay map init to let the dialog CSS transition finish (~300ms)
    // so the container has non-zero dimensions when google.maps.Map() is called
    const timer = setTimeout(async () => {
      if (!mapContainerRef.current) return;
      try {
        await loadMapsScript();
        if (!mapContainerRef.current) return; // dialog may have closed

        const center = firstPing
          ? { lat: parseFloat(firstPing.latitude), lng: parseFloat(firstPing.longitude) }
          : { lat: 39.8283, lng: -98.5795 };

        mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
          zoom: 14,
          center,
          mapTypeControl: true,
          fullscreenControl: true,
          zoomControl: true,
          streetViewControl: false,
          mapId: "DEMO_MAP_ID",
        });

        // Trigger resize to ensure the map fills the container correctly
        google.maps.event.trigger(mapRef.current, "resize");
        mapRef.current.setCenter(center);

        setMapReady(true);
      } catch (err: any) {
        setMapError(err?.message ?? "Failed to load map");
      }
    }, 350);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Draw route once both map and pings are ready
  useEffect(() => {
    if (mapReady && pings && !pingsLoading) {
      drawRoute();
    }
  }, [mapReady, pings, pingsLoading, drawRoute]);

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

        {/* Map area — always render the container div so the ref is available */}
        <div className="flex-1 relative" style={{ minHeight: 420 }}>

          {/* Loading overlay */}
          {(isLoading || (open && !mapReady && !mapError)) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/40">
              <div className="text-center space-y-2">
                <Skeleton className="h-8 w-8 rounded-full mx-auto" />
                <p className="text-sm text-muted-foreground">Loading route data…</p>
              </div>
            </div>
          )}

          {/* No session state */}
          {!isLoading && !session && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Route className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No GPS session found for this job.</p>
              </div>
            </div>
          )}

          {/* No GPS pings state */}
          {!isLoading && session && pingCount === 0 && mapReady && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="text-center space-y-2">
                <MapPin className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No GPS pings recorded for this session.</p>
                <p className="text-xs text-muted-foreground">The contractor may have clocked in without an active GPS signal.</p>
              </div>
            </div>
          )}

          {/* Map error state */}
          {mapError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="text-center space-y-2">
                <MapPin className="h-10 w-10 text-red-400 mx-auto" />
                <p className="text-sm text-muted-foreground">{mapError}</p>
              </div>
            </div>
          )}

          {/* Map container — always in DOM so ref is available for init */}
          <div
            ref={mapContainerRef}
            className="w-full h-full"
            style={{ minHeight: 420 }}
          />

          {/* Legend */}
          {mapReady && session && pingCount > 0 && (
            <div className="absolute top-3 right-3 z-20 bg-background/90 backdrop-blur border border-border rounded-lg px-3 py-2 text-xs space-y-1.5">
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
