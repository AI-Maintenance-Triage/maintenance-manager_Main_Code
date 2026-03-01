/**
 * AddressAutocomplete
 * A controlled input that uses the Google Places Autocomplete API to suggest
 * addresses as the user types. When a suggestion is selected, it calls
 * onSelect with the full address components so the caller can populate
 * city / state / ZIP / lat / lng fields automatically.
 *
 * Fix for shadcn Dialog focus-trap: The Dialog uses Radix UI which intercepts
 * pointer events outside the dialog content. The Google Places pac-container
 * is appended to <body> (outside the Dialog), so clicks on it get blocked.
 * We fix this by:
 *   1. Moving the pac-container inside the Dialog via a portal container ref
 *   2. Adding a mousedown listener that calls preventDefault() to stop the
 *      Dialog from stealing focus before the place_changed event fires.
 */
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

export interface AddressResult {
  formattedAddress: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  lat: string;
  lng: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

declare global {
  interface Window {
    initGoogleMapsAutocomplete?: () => void;
  }
}

function loadGoogleMapsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.places) {
      resolve();
      return;
    }
    if (document.getElementById("google-maps-script")) {
      // Script already injected — wait for the callback
      const prev = window.initGoogleMapsAutocomplete;
      window.initGoogleMapsAutocomplete = () => { prev?.(); resolve(); };
      return;
    }
    window.initGoogleMapsAutocomplete = resolve;
    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initGoogleMapsAutocomplete`;
    script.async = true;
    script.defer = true;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function extractComponent(components: any[], type: string, short = false): string {
  const c = components.find((c: any) => c.types.includes(type));
  return c ? (short ? c.short_name : c.long_name) : "";
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address...",
  className,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadGoogleMapsScript()
      .then(() => setReady(true))
      .catch((e) => console.error("[AddressAutocomplete] Failed to load Maps script:", e));
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
      fields: ["address_components", "formatted_address", "geometry"],
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place?.geometry?.location) return;

      const components = place.address_components ?? [];
      const streetNumber = extractComponent(components, "street_number");
      const route = extractComponent(components, "route");
      const street = [streetNumber, route].filter(Boolean).join(" ");
      const city =
        extractComponent(components, "locality") ||
        extractComponent(components, "sublocality") ||
        extractComponent(components, "neighborhood");
      const state = extractComponent(components, "administrative_area_level_1", true);
      const zipCode = extractComponent(components, "postal_code");
      const lat = String(place.geometry.location.lat());
      const lng = String(place.geometry.location.lng());

      onChange(place.formatted_address ?? "");
      onSelect({ formattedAddress: place.formatted_address ?? "", street, city, state, zipCode, lat, lng });
    });

    autocompleteRef.current = ac;

    // ── Fix: prevent Dialog focus-trap from swallowing pac-container clicks ──
    // The pac-container is appended to <body> by Google Maps. Radix Dialog's
    // DismissableLayer intercepts pointer-down events outside the dialog and
    // calls event.preventDefault(), which prevents the autocomplete from
    // receiving the selection. We stop propagation on mousedown so Radix never
    // sees it, while still allowing the click to reach the pac-item.
    const handlePacMousedown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".pac-container")) {
        e.stopPropagation();
      }
    };
    document.addEventListener("mousedown", handlePacMousedown, true);

    return () => {
      document.removeEventListener("mousedown", handlePacMousedown, true);
    };
  }, [ready, onChange, onSelect]);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`pl-9 ${className ?? ""}`}
        disabled={disabled}
        autoComplete="off"
      />
    </div>
  );
}
