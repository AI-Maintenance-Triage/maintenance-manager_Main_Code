/**
 * AddressAutocomplete
 *
 * Uses Google Places AutocompleteService (the programmatic API, NOT the
 * Autocomplete widget) to fetch suggestions, then renders them in a fully
 * custom dropdown that lives inside the React tree — no pac-container, no
 * z-index fights, no Radix Dialog pointer-events conflicts.
 *
 * When a suggestion is selected, it calls getDetails to resolve the full
 * address components and fires onSelect with street / city / state / ZIP /
 * lat / lng so the caller can populate the rest of the form.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";

export interface AddressResult {
  formattedAddress: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  lat: string;
  lng: string;
}

interface Suggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// ── Script loader ────────────────────────────────────────────────────────────
let scriptPromise: Promise<void> | null = null;

function loadGoogleMapsScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.places) { resolve(); return; }
    const cb = "__gmapsInit_" + Date.now();
    (window as any)[cb] = () => { resolve(); delete (window as any)[cb]; };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places&callback=${cb}`;
    s.async = true;
    s.defer = true;
    s.onerror = (e) => { scriptPromise = null; reject(e); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

function extractComponent(components: any[], type: string, short = false): string {
  const c = components?.find((c: any) => c.types?.includes(type));
  return c ? (short ? c.short_name : c.long_name) : "";
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address...",
  className,
  disabled,
}: Props) {
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const svcRef = useRef<any>(null);
  const detailsRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load script once
  useEffect(() => {
    loadGoogleMapsScript()
      .then(() => setReady(true))
      .catch((e) => console.error("[AddressAutocomplete] script load failed:", e));
  }, []);

  // Init services after script loads
  useEffect(() => {
    if (!ready) return;
    svcRef.current = new window.google.maps.places.AutocompleteService();
    detailsRef.current = new window.google.maps.places.PlacesService(
      document.createElement("div")
    );
  }, [ready]);

  // Fetch suggestions with debounce
  const fetchSuggestions = useCallback((input: string) => {
    if (!svcRef.current || input.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    svcRef.current.getPlacePredictions(
      { input, types: ["address"], componentRestrictions: { country: "us" } },
      (predictions: any[], status: string) => {
        setLoading(false);
        if (status === "OK" && predictions?.length) {
          setSuggestions(
            predictions.map((p) => ({
              placeId: p.place_id,
              description: p.description,
              mainText: p.structured_formatting?.main_text ?? p.description,
              secondaryText: p.structured_formatting?.secondary_text ?? "",
            }))
          );
          setOpen(true);
          setActiveIndex(-1);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      }
    );
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 250);
  };

  // Resolve place details and call onSelect
  const selectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      setOpen(false);
      setSuggestions([]);
      onChange(suggestion.description);

      if (!detailsRef.current) return;
      detailsRef.current.getDetails(
        { placeId: suggestion.placeId, fields: ["address_components", "formatted_address", "geometry"] },
        (place: any, status: string) => {
          if (status !== "OK" || !place?.geometry?.location) return;
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
          onSelect({ formattedAddress: place.formatted_address ?? "", street, city, state, zipCode, lat, lng });
        }
      );
    },
    [onChange, onSelect]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin pointer-events-none z-10" />
      )}
      <Input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={`pl-9 ${className ?? ""}`}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />

      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-[9999] w-full mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              role="option"
              aria-selected={i === activeIndex}
              className={`flex items-start gap-2 px-3 py-2 cursor-pointer text-sm transition-colors ${
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
              // Use onMouseDown + preventDefault to prevent input blur before click fires
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(s);
              }}
            >
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-medium">{s.mainText}</span>
                {s.secondaryText && (
                  <span className="text-muted-foreground ml-1">{s.secondaryText}</span>
                )}
              </span>
            </li>
          ))}
          <li className="flex justify-end px-3 py-1 border-t border-border">
            <img
              src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
              alt="Powered by Google"
              className="h-4 opacity-60"
            />
          </li>
        </ul>
      )}
    </div>
  );
}
