import { describe, it, expect } from "vitest";

/**
 * Validates that GOOGLE_MAPS_API_KEY is set and can geocode a known address.
 * This test makes a real HTTP call to the Google Maps Geocoding API.
 */
describe("Google Maps Geocoding API", () => {
  it("should have GOOGLE_MAPS_API_KEY set", () => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    expect(key, "GOOGLE_MAPS_API_KEY env var is missing").toBeTruthy();
    expect(key!.length, "API key looks too short").toBeGreaterThan(10);
  });

  it("should geocode a known ZIP code (10001 = Manhattan, NY)", async () => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      console.warn("Skipping live geocode test — GOOGLE_MAPS_API_KEY not set");
      return;
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", "10001, USA");
    url.searchParams.set("key", key);

    const response = await fetch(url.toString());
    expect(response.ok, `HTTP error: ${response.status}`).toBe(true);

    const data = await response.json() as any;
    expect(data.status, `Maps API error: ${data.error_message ?? data.status}`).toBe("OK");
    expect(data.results.length).toBeGreaterThan(0);

    const location = data.results[0].geometry.location;
    expect(location.lat).toBeTypeOf("number");
    expect(location.lng).toBeTypeOf("number");

    // Manhattan is roughly lat 40.7, lng -74.0
    expect(location.lat).toBeGreaterThan(40);
    expect(location.lat).toBeLessThan(41);
    expect(location.lng).toBeGreaterThan(-75);
    expect(location.lng).toBeLessThan(-73);

    console.log(`[Test] 10001 geocoded to: ${location.lat}, ${location.lng}`);
  }, 10000); // 10s timeout for live API call
});
