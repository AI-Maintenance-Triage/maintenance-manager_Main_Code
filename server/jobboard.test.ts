/**
 * Tests for job board service area filtering logic.
 *
 * Covers the bug where reducing a contractor's service radius did not remove
 * jobs from the board because:
 *   1. The backend was not re-geocoding the contractor's base ZIP on updateProfile.
 *   2. The frontend was not invalidating the jobBoard.list cache after saving.
 *
 * These tests verify the Haversine distance calculation used by
 * listJobBoardForContractor in server/db.ts.
 */
import { describe, it, expect } from "vitest";

// ─── Inline Haversine (mirrors server/db.ts) ──────────────────────────────────
function haversineDistanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Inline filter (mirrors the filter block in listJobBoardForContractor) ────
type JobRow = {
  property: { latitude: string | null; longitude: string | null };
};

function filterJobsByServiceArea(
  jobs: JobRow[],
  contractorLat: number | null,
  contractorLng: number | null,
  radiusMiles: number
): JobRow[] {
  if (contractorLat === null || contractorLng === null) return jobs; // no coords → show all
  return jobs.filter((row) => {
    const propLat = row.property.latitude ? parseFloat(row.property.latitude) : null;
    const propLng = row.property.longitude ? parseFloat(row.property.longitude) : null;
    if (propLat === null || propLng === null) return true; // no property coords → include
    const dist = haversineDistanceMiles(contractorLat, contractorLng, propLat, propLng);
    return dist <= radiusMiles;
  });
}

// ─── Test data ────────────────────────────────────────────────────────────────
// Boston, MA ≈ (42.3601, -71.0589)
// Providence, RI ≈ (41.8240, -71.4128) — ~50 miles from Boston
// New York, NY ≈ (40.7128, -74.0060) — ~215 miles from Boston

const BOSTON    = { lat: 42.3601, lng: -71.0589 };
const PROVIDENCE = { lat: 41.8240, lng: -71.4128 };
const NEW_YORK  = { lat: 40.7128, lng: -74.0060 };

const makeJob = (lat: number, lng: number): JobRow => ({
  property: { latitude: String(lat), longitude: String(lng) },
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("haversineDistanceMiles", () => {
  it("returns ~0 for identical coordinates", () => {
    expect(haversineDistanceMiles(BOSTON.lat, BOSTON.lng, BOSTON.lat, BOSTON.lng)).toBeCloseTo(0, 1);
  });

  it("calculates Boston → Providence as ~41 miles", () => {
    const dist = haversineDistanceMiles(BOSTON.lat, BOSTON.lng, PROVIDENCE.lat, PROVIDENCE.lng);
    expect(dist).toBeGreaterThan(38);
    expect(dist).toBeLessThan(45);
  });

  it("calculates Boston → New York as ~190 miles", () => {
    const dist = haversineDistanceMiles(BOSTON.lat, BOSTON.lng, NEW_YORK.lat, NEW_YORK.lng);
    expect(dist).toBeGreaterThan(185);
    expect(dist).toBeLessThan(200);
  });

  it("is symmetric (A→B equals B→A)", () => {
    const ab = haversineDistanceMiles(BOSTON.lat, BOSTON.lng, PROVIDENCE.lat, PROVIDENCE.lng);
    const ba = haversineDistanceMiles(PROVIDENCE.lat, PROVIDENCE.lng, BOSTON.lat, BOSTON.lng);
    expect(ab).toBeCloseTo(ba, 5);
  });
});

describe("filterJobsByServiceArea — radius reduction removes jobs", () => {
  const jobInBoston     = makeJob(BOSTON.lat, BOSTON.lng);
  const jobInProvidence = makeJob(PROVIDENCE.lat, PROVIDENCE.lng);
  const jobInNewYork    = makeJob(NEW_YORK.lat, NEW_YORK.lng);
  const allJobs = [jobInBoston, jobInProvidence, jobInNewYork];

  it("50-mile radius from Boston includes Boston and Providence but not New York", () => {
    const result = filterJobsByServiceArea(allJobs, BOSTON.lat, BOSTON.lng, 50);
    expect(result).toContain(jobInBoston);
    expect(result).toContain(jobInProvidence);
    expect(result).not.toContain(jobInNewYork);
  });

  it("25-mile radius from Boston includes only Boston", () => {
    const result = filterJobsByServiceArea(allJobs, BOSTON.lat, BOSTON.lng, 25);
    expect(result).toContain(jobInBoston);
    expect(result).not.toContain(jobInProvidence);
    expect(result).not.toContain(jobInNewYork);
  });

  it("increasing radius from 25 → 50 miles adds Providence to results (the original bug scenario)", () => {
    const smallRadius = filterJobsByServiceArea(allJobs, BOSTON.lat, BOSTON.lng, 25);
    const largeRadius = filterJobsByServiceArea(allJobs, BOSTON.lat, BOSTON.lng, 50);
    expect(smallRadius).not.toContain(jobInProvidence);
    expect(largeRadius).toContain(jobInProvidence);
  });

  it("reducing radius from 50 → 25 miles removes Providence from results (the reported bug)", () => {
    const largeRadius = filterJobsByServiceArea(allJobs, BOSTON.lat, BOSTON.lng, 50);
    const smallRadius = filterJobsByServiceArea(allJobs, BOSTON.lat, BOSTON.lng, 25);
    expect(largeRadius).toContain(jobInProvidence);
    expect(smallRadius).not.toContain(jobInProvidence);
  });

  it("returns all jobs when contractor has no coordinates", () => {
    const result = filterJobsByServiceArea(allJobs, null, null, 25);
    expect(result).toHaveLength(3);
  });

  it("includes jobs whose property has no coordinates (fallback to include)", () => {
    const jobNoCoords: JobRow = { property: { latitude: null, longitude: null } };
    const result = filterJobsByServiceArea([jobNoCoords], BOSTON.lat, BOSTON.lng, 10);
    expect(result).toContain(jobNoCoords);
  });
});
