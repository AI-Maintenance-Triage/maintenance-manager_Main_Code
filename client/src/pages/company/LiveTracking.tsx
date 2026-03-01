import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapView } from "@/components/Map";
import { Navigation2, Clock, MapPin, User, RefreshCw, WifiOff } from "lucide-react";
import { useRef, useEffect, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

type ActiveSession = {
  sessionId: number;
  maintenanceRequestId: number;
  contractorProfileId: number;
  clockInTime: number;
  clockInLat: string | null;
  clockInLng: string | null;
  contractorName: string | null;
  contractorPhone: string | null;
  jobTitle: string | null;
  jobAddress: string | null;
  jobLat: string | null;
  jobLng: string | null;
  latestLat: string | null;
  latestLng: string | null;
  latestPingTime: number;
  latestLocationType: string | null;
};

function formatElapsed(clockInTime: number): string {
  const ms = Date.now() - clockInTime;
  const totalMins = Math.floor(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatLastSeen(pingTime: number): string {
  const secs = Math.floor((Date.now() - pingTime) / 1000);
  if (secs < 10) return "Just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function LiveTracking() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const jobMarkersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // Poll every 5 seconds for fresh positions
  const { data: sessions, isLoading, refetch } = trpc.timeTracking.getActiveSessionsForCompany.useQuery(undefined, {
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const handleRefresh = () => {
    refetch();
    setLastRefresh(Date.now());
  };

  // Update markers whenever sessions data changes
  const updateMarkers = useCallback((map: google.maps.Map, data: ActiveSession[]) => {
    const sessionIds = new Set(data.map(s => s.sessionId));

    // Remove markers for sessions that ended
    markersRef.current.forEach((marker, id) => {
      if (!sessionIds.has(id)) {
        marker.map = null;
        markersRef.current.delete(id);
      }
    });
    jobMarkersRef.current.forEach((marker, id) => {
      if (!sessionIds.has(id)) {
        marker.map = null;
        jobMarkersRef.current.delete(id);
      }
    });

    data.forEach((session) => {
      const lat = parseFloat(session.latestLat ?? session.clockInLat ?? "0");
      const lng = parseFloat(session.latestLng ?? session.clockInLng ?? "0");
      if (!lat || !lng) return;

      const isStale = Date.now() - session.latestPingTime > 120_000; // > 2 min = stale

      // ── Contractor moving marker ──────────────────────────────────────────
      const contractorPos = { lat, lng };
      if (markersRef.current.has(session.sessionId)) {
        const existing = markersRef.current.get(session.sessionId)!;
        existing.position = contractorPos;
        // Update content color based on staleness
        (existing.content as HTMLElement).style.backgroundColor = isStale ? "#6b7280" : "#3b82f6";
      } else {
        const el = document.createElement("div");
        el.style.cssText = `
          width: 36px; height: 36px; border-radius: 50%;
          background-color: ${isStale ? "#6b7280" : "#3b82f6"};
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        `;
        el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`;
        el.title = session.contractorName ?? "Contractor";

        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: contractorPos,
          title: session.contractorName ?? "Contractor",
          content: el,
        });
        marker.addListener("click", () => setSelectedSessionId(session.sessionId));
        markersRef.current.set(session.sessionId, marker);
      }

      // ── Job site pin marker ───────────────────────────────────────────────
      const jobLat = parseFloat(session.jobLat ?? "0");
      const jobLng = parseFloat(session.jobLng ?? "0");
      if (jobLat && jobLng && !jobMarkersRef.current.has(session.sessionId)) {
        const el = document.createElement("div");
        el.style.cssText = `
          width: 28px; height: 28px; border-radius: 4px;
          background-color: #f59e0b;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          display: flex; align-items: center; justify-content: center;
        `;
        el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
        el.title = session.jobTitle ?? "Job Site";

        const jobMarker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: jobLat, lng: jobLng },
          title: session.jobTitle ?? "Job Site",
          content: el,
        });
        jobMarkersRef.current.set(session.sessionId, jobMarker);
      }
    });

    // Auto-fit map to show all markers if we have data
    if (data.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      data.forEach((s) => {
        const lat = parseFloat(s.latestLat ?? s.clockInLat ?? "0");
        const lng = parseFloat(s.latestLng ?? s.clockInLng ?? "0");
        if (lat && lng) bounds.extend({ lat, lng });
        const jLat = parseFloat(s.jobLat ?? "0");
        const jLng = parseFloat(s.jobLng ?? "0");
        if (jLat && jLng) bounds.extend({ lat: jLat, lng: jLng });
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
        if (data.length === 1) map.setZoom(Math.min(map.getZoom() ?? 14, 14));
      }
    }
  }, []);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    if (sessions) updateMarkers(map, sessions as ActiveSession[]);
  }, [sessions, updateMarkers]);

  useEffect(() => {
    if (mapRef.current && sessions) {
      updateMarkers(mapRef.current, sessions as ActiveSession[]);
    }
  }, [sessions, updateMarkers]);

  // Cleanup markers on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach(m => { m.map = null; });
      jobMarkersRef.current.forEach(m => { m.map = null; });
    };
  }, []);

  const selectedSession = sessions?.find((s: any) => s.sessionId === selectedSessionId) as ActiveSession | undefined;

  return (
    <div className="space-y-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Navigation2 className="h-6 w-6 text-primary" />
            Live Contractor Tracking
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Real-time GPS positions of contractors currently on the clock
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Refreshes every 5s · Last: {formatLastSeen(lastRefresh)}
          </span>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" style={{ height: "calc(100vh - 220px)", minHeight: 500 }}>
        {/* Left panel: active contractors list */}
        <div className="lg:col-span-1 flex flex-col gap-3 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)
          ) : !sessions || sessions.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center">
                <WifiOff className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground font-medium">No contractors on the clock</p>
                <p className="text-xs text-muted-foreground mt-1">Active sessions will appear here in real time</p>
              </CardContent>
            </Card>
          ) : (
            (sessions as ActiveSession[]).map((session) => {
              const isStale = Date.now() - session.latestPingTime > 120_000;
              const isSelected = selectedSessionId === session.sessionId;
              return (
                <Card
                  key={session.sessionId}
                  className={`bg-card border-border cursor-pointer transition-all hover:border-primary/50 ${isSelected ? "border-primary ring-1 ring-primary/30" : ""}`}
                  onClick={() => {
                    setSelectedSessionId(session.sessionId);
                    // Pan map to contractor
                    if (mapRef.current) {
                      const lat = parseFloat(session.latestLat ?? session.clockInLat ?? "0");
                      const lng = parseFloat(session.latestLng ?? session.clockInLng ?? "0");
                      if (lat && lng) {
                        mapRef.current.panTo({ lat, lng });
                        mapRef.current.setZoom(15);
                      }
                    }
                  }}
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${isStale ? "bg-gray-400" : "bg-blue-400 animate-pulse"}`} />
                        <span className="font-medium text-sm text-card-foreground truncate">
                          {session.contractorName ?? "Contractor"}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 border-blue-500/30 text-blue-400">
                        {isStale ? "Offline" : "Live"}
                      </Badge>
                    </div>
                    {session.jobTitle && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {session.jobTitle}
                      </p>
                    )}
                    {session.jobAddress && (
                      <p className="text-xs text-muted-foreground truncate pl-4">{session.jobAddress}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        On clock: {formatElapsed(session.clockInTime)}
                      </span>
                      <span>{formatLastSeen(session.latestPingTime)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Right panel: map */}
        <div className="lg:col-span-3 rounded-xl overflow-hidden border border-border relative">
          <MapView
            className="w-full h-full"
            initialCenter={{ lat: 39.8283, lng: -98.5795 }}
            initialZoom={4}
            onMapReady={handleMapReady}
          />

          {/* Selected contractor info overlay */}
          {selectedSession && (
            <div className="absolute bottom-4 left-4 right-4 max-w-sm bg-background/95 backdrop-blur border border-border rounded-xl p-4 shadow-xl">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                    <User className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{selectedSession.contractorName ?? "Contractor"}</p>
                    {selectedSession.contractorPhone && (
                      <p className="text-xs text-muted-foreground">{selectedSession.contractorPhone}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSessionId(null)}
                  className="text-muted-foreground hover:text-foreground text-lg leading-none"
                >×</button>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                {selectedSession.jobTitle && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span className="text-foreground font-medium">{selectedSession.jobTitle}</span>
                  </p>
                )}
                {selectedSession.jobAddress && (
                  <p className="pl-5">{selectedSession.jobAddress}</p>
                )}
                <p className="flex items-center gap-1.5 pt-1">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  On clock for {formatElapsed(selectedSession.clockInTime)}
                  <span className="ml-auto">{formatLastSeen(selectedSession.latestPingTime)}</span>
                </p>
                {selectedSession.latestLat && selectedSession.latestLng && (
                  <p className="text-[10px] text-muted-foreground/60 font-mono">
                    {parseFloat(selectedSession.latestLat).toFixed(5)}, {parseFloat(selectedSession.latestLng).toFixed(5)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="absolute top-3 right-3 bg-background/90 backdrop-blur border border-border rounded-lg px-3 py-2 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              </div>
              <span className="text-muted-foreground">Contractor (live)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-amber-500 border-2 border-white flex items-center justify-center">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <span className="text-muted-foreground">Job site</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
