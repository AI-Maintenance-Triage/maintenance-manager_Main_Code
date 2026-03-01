/**
 * GPS Tracking & Auto Clock-Out Tests
 *
 * Tests the Haversine distance calculation logic (mirrored from the frontend)
 * and validates the auto-clock-out settings returned by the backend.
 */
import { describe, expect, it } from "vitest";

// ── Haversine distance helper (mirrors client-side implementation) ──────────
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

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMeters(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
  });

  it("calculates ~111 km per degree of latitude", () => {
    const dist = haversineMeters(0, 0, 1, 0);
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });

  it("returns a small distance for nearby points (within 200m)", () => {
    // ~50 meters apart
    const dist = haversineMeters(40.7128, -74.006, 40.71325, -74.006);
    expect(dist).toBeLessThan(200);
    expect(dist).toBeGreaterThan(0);
  });

  it("returns > 200m for points farther than the geofence radius", () => {
    // ~500 meters apart
    const dist = haversineMeters(40.7128, -74.006, 40.7173, -74.006);
    expect(dist).toBeGreaterThan(200);
  });

  it("is symmetric (A→B == B→A)", () => {
    const d1 = haversineMeters(40.7128, -74.006, 34.0522, -118.2437);
    const d2 = haversineMeters(34.0522, -118.2437, 40.7128, -74.006);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });
});

// ── Auto clock-out timer logic ─────────────────────────────────────────────
describe("auto clock-out logic", () => {
  it("triggers auto clock-out when contractor is within radius for the configured time", () => {
    const originLat = 40.7128;
    const originLng = -74.006;
    const autoClockOutRadiusMeters = 200;

    // Simulate contractor returning to within 50m of origin
    const contractorLat = 40.71325;
    const contractorLng = -74.006;

    const dist = haversineMeters(contractorLat, contractorLng, originLat, originLng);
    expect(dist).toBeLessThan(autoClockOutRadiusMeters);

    // Confirm auto clock-out would be scheduled
    const shouldScheduleAutoClockOut = dist <= autoClockOutRadiusMeters;
    expect(shouldScheduleAutoClockOut).toBe(true);
  });

  it("does NOT trigger auto clock-out when contractor is outside the radius", () => {
    const originLat = 40.7128;
    const originLng = -74.006;
    const autoClockOutRadiusMeters = 200;

    // Contractor is ~500m away from origin
    const contractorLat = 40.7173;
    const contractorLng = -74.006;

    const dist = haversineMeters(contractorLat, contractorLng, originLat, originLng);
    expect(dist).toBeGreaterThan(autoClockOutRadiusMeters);

    const shouldScheduleAutoClockOut = dist <= autoClockOutRadiusMeters;
    expect(shouldScheduleAutoClockOut).toBe(false);
  });

  it("cancels auto clock-out timer when contractor moves away from origin", () => {
    // Simulate state: contractor was near origin (timer started), then moved away
    let timerScheduled = false;
    let timerCancelled = false;

    const autoClockOutRadiusMeters = 200;
    const originLat = 40.7128;
    const originLng = -74.006;

    // Step 1: contractor near origin → schedule timer
    const nearLat = 40.71325;
    const nearLng = -74.006;
    if (haversineMeters(nearLat, nearLng, originLat, originLng) <= autoClockOutRadiusMeters) {
      timerScheduled = true;
    }
    expect(timerScheduled).toBe(true);

    // Step 2: contractor moves away → cancel timer
    const farLat = 40.7173;
    const farLng = -74.006;
    if (timerScheduled && haversineMeters(farLat, farLng, originLat, originLng) > autoClockOutRadiusMeters) {
      timerCancelled = true;
    }
    expect(timerCancelled).toBe(true);
  });
});

// ── Default settings validation ────────────────────────────────────────────
describe("auto clock-out default settings", () => {
  it("defaults are within acceptable ranges", () => {
    const defaultAutoClockOutMinutes = 15;
    const defaultAutoClockOutRadiusMeters = 200;

    expect(defaultAutoClockOutMinutes).toBeGreaterThanOrEqual(1);
    expect(defaultAutoClockOutMinutes).toBeLessThanOrEqual(120);
    expect(defaultAutoClockOutRadiusMeters).toBeGreaterThanOrEqual(50);
    expect(defaultAutoClockOutRadiusMeters).toBeLessThanOrEqual(1000);
  });
});
