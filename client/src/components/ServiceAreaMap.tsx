/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState, useCallback } from "react";
import { MapView } from "./Map";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { MapPin, Loader2 } from "lucide-react";

interface ServiceAreaMapProps {
  /** Controlled ZIP code value */
  zip: string;
  /** Controlled radius in miles */
  radiusMiles: number;
  onZipChange: (zip: string) => void;
  onRadiusChange: (miles: number) => void;
}

// Convert miles to meters for Google Maps Circle
const METERS_PER_MILE = 1609.34;

export function ServiceAreaMap({
  zip,
  radiusMiles,
  onZipChange,
  onRadiusChange,
}: ServiceAreaMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [zipError, setZipError] = useState("");
  const [centerLabel, setCenterLabel] = useState("");

  // Geocode a ZIP code and update the map
  const geocodeZip = useCallback(async (zipCode: string) => {
    if (!mapRef.current || !window.google || zipCode.length < 5) return;
    setGeocoding(true);
    setZipError("");
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: `${zipCode}, USA` }, (results, status) => {
      setGeocoding(false);
      if (status === "OK" && results && results[0]) {
        const loc = results[0].geometry.location;
        const center = { lat: loc.lat(), lng: loc.lng() };
        setCenterLabel(results[0].formatted_address || zipCode);

        // Pan map
        mapRef.current!.setCenter(center);
        mapRef.current!.setZoom(10);

        // Update or create circle
        if (circleRef.current) {
          circleRef.current.setCenter(center);
          circleRef.current.setRadius(radiusMiles * METERS_PER_MILE);
        } else {
          circleRef.current = new window.google.maps.Circle({
            map: mapRef.current!,
            center,
            radius: radiusMiles * METERS_PER_MILE,
            fillColor: "#10b981",
            fillOpacity: 0.12,
            strokeColor: "#10b981",
            strokeOpacity: 0.6,
            strokeWeight: 2,
          });
        }

        // Update or create marker
        if (markerRef.current) {
          markerRef.current.position = center;
        } else {
          markerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
            map: mapRef.current!,
            position: center,
            title: zipCode,
          });
        }
      } else {
        setZipError("ZIP code not found. Please check and try again.");
      }
    });
  }, [radiusMiles]);

  // When radius changes, update existing circle
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radiusMiles * METERS_PER_MILE);
    }
  }, [radiusMiles]);

  // Geocode when ZIP changes (debounced via 5-char check)
  useEffect(() => {
    if (zip.length === 5 && /^\d{5}$/.test(zip)) {
      geocodeZip(zip);
    }
  }, [zip, geocodeZip]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* ZIP Code Input */}
        <div className="space-y-2">
          <Label htmlFor="svc-zip">
            Base ZIP Code
            {geocoding && <Loader2 className="inline h-3 w-3 ml-2 animate-spin text-primary" />}
          </Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="svc-zip"
              value={zip}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 5);
                onZipChange(val);
              }}
              placeholder="e.g., 30301"
              className="pl-9"
              maxLength={5}
            />
          </div>
          {zipError && <p className="text-xs text-destructive">{zipError}</p>}
          {centerLabel && !zipError && (
            <p className="text-xs text-muted-foreground truncate">{centerLabel}</p>
          )}
        </div>

        {/* Radius Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Service Radius</Label>
            <Badge variant="secondary" className="text-primary font-semibold">
              {radiusMiles} mi
            </Badge>
          </div>
          <div className="pt-2 px-1">
            <Slider
              min={5}
              max={100}
              step={5}
              value={[radiusMiles]}
              onValueChange={([val]) => onRadiusChange(val)}
              className="w-full"
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>5 mi</span>
            <span>100 mi</span>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="rounded-lg overflow-hidden border border-border">
        <MapView
          className="h-64"
          initialCenter={{ lat: 39.5, lng: -98.35 }}
          initialZoom={4}
          onMapReady={(map) => {
            mapRef.current = map;
            // If ZIP already set, geocode immediately
            if (zip.length === 5 && /^\d{5}$/.test(zip)) {
              geocodeZip(zip);
            }
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        The shaded area shows your service coverage. Jobs outside this radius will not be shown to you.
      </p>
    </div>
  );
}
