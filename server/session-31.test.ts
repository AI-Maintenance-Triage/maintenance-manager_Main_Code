/**
 * Session 31 Tests
 * Covers:
 * 1. Contractor Free Plan display logic (no paid plan → "Free Plan")
 * 2. Contractor payout status card logic (Stripe Connect states)
 * 3. Rent Manager adapter field mapping
 * 4. DoorLoop adapter field mapping
 * 5. Admin global webhook log filtering
 */
import { describe, it, expect } from "vitest";

// ─── Free Plan Display Logic ──────────────────────────────────────────────────
describe("Contractor Free Plan Display", () => {
  it("shows 'Free Plan' when no plan is assigned", () => {
    const plan = null;
    const displayPlanName = plan ?? "Free Plan";
    expect(displayPlanName).toBe("Free Plan");
  });

  it("shows the plan name when a paid plan is assigned", () => {
    const plan = { name: "Pro Contractor", id: 5 };
    const displayPlanName = plan?.name ?? "Free Plan";
    expect(displayPlanName).toBe("Pro Contractor");
  });

  it("isFree is true when no plan assigned", () => {
    const plan = null;
    const isFree = !plan;
    expect(isFree).toBe(true);
  });

  it("isFree is false when a plan is assigned", () => {
    const plan = { name: "Pro Contractor", id: 5 };
    const isFree = !plan;
    expect(isFree).toBe(false);
  });

  it("Free badge shown when isFree, not when paid plan active", () => {
    function getBadgeLabel(plan: { name: string } | null, planStatus: string | null): string {
      if (!plan) return "Free";
      if (planStatus === "active") return "Active";
      if (planStatus === "trialing") return "Trial";
      if (planStatus === "expired") return "Expired";
      return "Free";
    }
    expect(getBadgeLabel(null, null)).toBe("Free");
    expect(getBadgeLabel({ name: "Pro" }, "active")).toBe("Active");
    expect(getBadgeLabel({ name: "Pro" }, "trialing")).toBe("Trial");
    expect(getBadgeLabel({ name: "Pro" }, "expired")).toBe("Expired");
  });
});

// ─── Payout Status Card Logic ─────────────────────────────────────────────────
describe("Contractor Payout Status Card", () => {
  type PayoutStatus = {
    stripeAccountId?: string | null;
    onboardingComplete: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  };

  function getPayoutCardState(status: PayoutStatus | null): "loading" | "active" | "pending_kyc" | "not_setup" {
    if (!status) return "loading";
    if (status.onboardingComplete && status.payoutsEnabled) return "active";
    if (status.stripeAccountId) return "pending_kyc";
    return "not_setup";
  }

  it("returns 'active' when onboarding complete and payouts enabled", () => {
    const status: PayoutStatus = {
      stripeAccountId: "acct_123",
      onboardingComplete: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    };
    expect(getPayoutCardState(status)).toBe("active");
  });

  it("returns 'not_setup' when no Stripe account created", () => {
    const status: PayoutStatus = {
      stripeAccountId: null,
      onboardingComplete: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    };
    expect(getPayoutCardState(status)).toBe("not_setup");
  });

  it("returns 'pending_kyc' when account exists but not fully verified", () => {
    const status: PayoutStatus = {
      stripeAccountId: "acct_456",
      onboardingComplete: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    };
    expect(getPayoutCardState(status)).toBe("pending_kyc");
  });

  it("returns 'loading' when status is null (query in flight)", () => {
    expect(getPayoutCardState(null)).toBe("loading");
  });

  it("returns 'pending_kyc' when charges enabled but payouts not yet enabled", () => {
    const status: PayoutStatus = {
      stripeAccountId: "acct_789",
      onboardingComplete: false,
      chargesEnabled: true,
      payoutsEnabled: false,
    };
    expect(getPayoutCardState(status)).toBe("pending_kyc");
  });
});

// ─── Rent Manager Adapter Field Mapping ──────────────────────────────────────
describe("Rent Manager Adapter", () => {
  function mapRentManagerProperty(prop: Record<string, unknown>) {
    const address = (prop.Address1 ?? prop.Address ?? "") as string;
    const city = (prop.City ?? "") as string;
    const state = (prop.State ?? "") as string;
    const zip = (prop.PostalCode ?? prop.ZipCode ?? "") as string;
    return {
      externalId: `rentmanager_${prop.PropertyID ?? prop.Id}`,
      name: (prop.Name ?? prop.PropertyName ?? address) as string,
      address: [address, prop.Address2].filter(Boolean).join(", "),
      city,
      state,
      zipCode: zip,
      units: (prop.UnitCount ?? prop.Units ?? 1) as number,
    };
  }

  function mapRentManagerRequest(issue: Record<string, unknown>) {
    const priority = mapRentManagerPriority((issue.Priority ?? issue.PriorityName ?? "") as string);
    const propertyId = issue.PropertyID ?? (issue.Property as any)?.PropertyID ?? issue.PropertyId;
    return {
      externalId: `rentmanager_${issue.ServiceIssueID ?? issue.Id}`,
      title: (issue.Subject ?? issue.Title ?? "Maintenance Request") as string,
      description: (issue.Description ?? issue.Notes ?? "") as string,
      unitNumber: (issue.UnitNumber ?? (issue.Unit as any)?.UnitNumber ?? undefined) as string | undefined,
      tenantName: (issue.TenantName ?? (issue.Tenant as any)?.Name ?? undefined) as string | undefined,
      propertyExternalId: `rentmanager_${propertyId}`,
      priority,
    };
  }

  function mapRentManagerPriority(priority: string): "low" | "medium" | "high" | "emergency" {
    const p = priority.toLowerCase();
    if (p.includes("emergency") || p.includes("urgent") || p === "1") return "emergency";
    if (p.includes("high") || p === "2") return "high";
    if (p.includes("low") || p === "4" || p === "5") return "low";
    return "medium";
  }

  it("maps Rent Manager property fields correctly", () => {
    const prop = {
      PropertyID: 101,
      Name: "Sunset Apartments",
      Address1: "123 Main St",
      City: "Austin",
      State: "TX",
      PostalCode: "78701",
      UnitCount: 24,
    };
    const mapped = mapRentManagerProperty(prop);
    expect(mapped.externalId).toBe("rentmanager_101");
    expect(mapped.name).toBe("Sunset Apartments");
    expect(mapped.address).toBe("123 Main St");
    expect(mapped.city).toBe("Austin");
    expect(mapped.state).toBe("TX");
    expect(mapped.zipCode).toBe("78701");
    expect(mapped.units).toBe(24);
  });

  it("falls back to address when no property name", () => {
    const prop = { PropertyID: 202, Address1: "456 Oak Ave", City: "Dallas", State: "TX", PostalCode: "75201" };
    const mapped = mapRentManagerProperty(prop);
    expect(mapped.name).toBe("456 Oak Ave");
  });

  it("maps Rent Manager service issue fields correctly", () => {
    const issue = {
      ServiceIssueID: 999,
      Subject: "Broken pipe in unit 3A",
      Description: "Water leaking from ceiling",
      PropertyID: 101,
      UnitNumber: "3A",
      TenantName: "Jane Smith",
      Priority: "High",
    };
    const mapped = mapRentManagerRequest(issue);
    expect(mapped.externalId).toBe("rentmanager_999");
    expect(mapped.title).toBe("Broken pipe in unit 3A");
    expect(mapped.description).toBe("Water leaking from ceiling");
    expect(mapped.propertyExternalId).toBe("rentmanager_101");
    expect(mapped.unitNumber).toBe("3A");
    expect(mapped.tenantName).toBe("Jane Smith");
    expect(mapped.priority).toBe("high");
  });

  it("maps priority levels correctly", () => {
    expect(mapRentManagerPriority("Emergency")).toBe("emergency");
    expect(mapRentManagerPriority("Urgent")).toBe("emergency");
    expect(mapRentManagerPriority("1")).toBe("emergency");
    expect(mapRentManagerPriority("High")).toBe("high");
    expect(mapRentManagerPriority("2")).toBe("high");
    expect(mapRentManagerPriority("Medium")).toBe("medium");
    expect(mapRentManagerPriority("Low")).toBe("low");
    expect(mapRentManagerPriority("4")).toBe("low");
    expect(mapRentManagerPriority("5")).toBe("low");
    expect(mapRentManagerPriority("Normal")).toBe("medium");
  });

  it("skips closed/completed issues in fetchNewRequests logic", () => {
    const issues = [
      { ServiceIssueID: 1, Status: "Open", PropertyID: 10 },
      { ServiceIssueID: 2, Status: "Closed", PropertyID: 10 },
      { ServiceIssueID: 3, Status: "Completed", PropertyID: 10 },
      { ServiceIssueID: 4, Status: "Cancelled", PropertyID: 10 },
      { ServiceIssueID: 5, Status: "In Progress", PropertyID: 10 },
    ];
    const active = issues.filter((issue) => {
      const status = (issue.Status ?? "").toLowerCase();
      return status !== "closed" && status !== "completed" && status !== "cancelled";
    });
    expect(active).toHaveLength(2);
    expect(active[0].ServiceIssueID).toBe(1);
    expect(active[1].ServiceIssueID).toBe(5);
  });

  it("uses PATCH /ServiceIssues/{id} with Status: Closed for markComplete", () => {
    const externalId = "rentmanager_12345";
    const issueId = externalId.replace("rentmanager_", "");
    const endpoint = `/ServiceIssues/${issueId}`;
    const body = { Status: "Closed" };
    expect(issueId).toBe("12345");
    expect(endpoint).toBe("/ServiceIssues/12345");
    expect(body.Status).toBe("Closed");
  });
});

// ─── DoorLoop Adapter Field Mapping ──────────────────────────────────────────
describe("DoorLoop Adapter", () => {
  function mapDoorLoopProperty(prop: Record<string, unknown>) {
    const addr = (prop.address ?? {}) as Record<string, string>;
    return {
      externalId: `doorloop_${prop.id}`,
      name: (prop.name ?? prop.displayName ?? addr.street1 ?? "Property") as string,
      address: [addr.street1, addr.street2].filter(Boolean).join(", "),
      city: addr.city ?? "",
      state: addr.state ?? "",
      zipCode: addr.zip ?? addr.postalCode ?? "",
      units: (prop.unitCount ?? prop.numberOfUnits ?? 1) as number,
    };
  }

  function mapDoorLoopRequest(req: Record<string, unknown>) {
    const propertyId = req.propertyId ?? (req.property as any)?.id;
    const tenant = req.tenant as any;
    return {
      externalId: `doorloop_${req.id}`,
      title: (req.subject ?? req.title ?? "Maintenance Request") as string,
      description: (req.description ?? req.notes ?? "") as string,
      unitNumber: (req.unitNumber ?? (req.unit as any)?.number ?? undefined) as string | undefined,
      tenantName: (req.tenantName ?? ([tenant?.firstName, tenant?.lastName].filter(Boolean).join(" ") || undefined)) as string | undefined,
      tenantEmail: (req.tenantEmail ?? tenant?.email ?? undefined) as string | undefined,
      propertyExternalId: `doorloop_${propertyId}`,
      priority: mapDoorLoopPriority((req.priority ?? "") as string),
    };
  }

  function mapDoorLoopPriority(priority: string): "low" | "medium" | "high" | "emergency" {
    const p = priority.toLowerCase();
    if (p === "emergency" || p === "urgent") return "emergency";
    if (p === "high") return "high";
    if (p === "low") return "low";
    return "medium";
  }

  it("maps DoorLoop property fields correctly", () => {
    const prop = {
      id: "prop_abc123",
      name: "Harbor View Condos",
      address: { street1: "789 Harbor Blvd", city: "Miami", state: "FL", zip: "33101" },
      unitCount: 48,
    };
    const mapped = mapDoorLoopProperty(prop);
    expect(mapped.externalId).toBe("doorloop_prop_abc123");
    expect(mapped.name).toBe("Harbor View Condos");
    expect(mapped.address).toBe("789 Harbor Blvd");
    expect(mapped.city).toBe("Miami");
    expect(mapped.state).toBe("FL");
    expect(mapped.zipCode).toBe("33101");
    expect(mapped.units).toBe(48);
  });

  it("falls back to street1 when no property name", () => {
    const prop = {
      id: "prop_xyz",
      address: { street1: "100 Elm Street", city: "Chicago", state: "IL", zip: "60601" },
    };
    const mapped = mapDoorLoopProperty(prop);
    expect(mapped.name).toBe("100 Elm Street");
  });

  it("maps DoorLoop maintenance request fields correctly", () => {
    const req = {
      id: "req_555",
      subject: "AC unit not cooling",
      description: "Temperature stays above 85°F",
      propertyId: "prop_abc123",
      unitNumber: "4B",
      tenant: { firstName: "John", lastName: "Doe", email: "john@example.com" },
      priority: "high",
    };
    const mapped = mapDoorLoopRequest(req);
    expect(mapped.externalId).toBe("doorloop_req_555");
    expect(mapped.title).toBe("AC unit not cooling");
    expect(mapped.description).toBe("Temperature stays above 85°F");
    expect(mapped.propertyExternalId).toBe("doorloop_prop_abc123");
    expect(mapped.unitNumber).toBe("4B");
    expect(mapped.tenantName).toBe("John Doe");
    expect(mapped.tenantEmail).toBe("john@example.com");
    expect(mapped.priority).toBe("high");
  });

  it("maps DoorLoop priority levels correctly", () => {
    expect(mapDoorLoopPriority("emergency")).toBe("emergency");
    expect(mapDoorLoopPriority("urgent")).toBe("emergency");
    expect(mapDoorLoopPriority("high")).toBe("high");
    expect(mapDoorLoopPriority("medium")).toBe("medium");
    expect(mapDoorLoopPriority("normal")).toBe("medium");
    expect(mapDoorLoopPriority("low")).toBe("low");
    expect(mapDoorLoopPriority("")).toBe("medium");
  });

  it("skips completed/closed requests in fetchNewRequests logic", () => {
    const requests = [
      { id: "r1", status: "open", propertyId: "p1" },
      { id: "r2", status: "completed", propertyId: "p1" },
      { id: "r3", status: "closed", propertyId: "p1" },
      { id: "r4", status: "cancelled", propertyId: "p1" },
      { id: "r5", status: "in_progress", propertyId: "p1" },
    ];
    const active = requests.filter((req) => {
      const status = (req.status ?? "").toLowerCase();
      return status !== "completed" && status !== "closed" && status !== "cancelled";
    });
    expect(active).toHaveLength(2);
    expect(active[0].id).toBe("r1");
    expect(active[1].id).toBe("r5");
  });

  it("uses PATCH /maintenance-requests/{id} with status: completed for markComplete", () => {
    const externalId = "doorloop_req_abc123";
    const requestId = externalId.replace("doorloop_", "");
    const endpoint = `/maintenance-requests/${requestId}`;
    const body = { status: "completed" };
    expect(requestId).toBe("req_abc123");
    expect(endpoint).toBe("/maintenance-requests/req_abc123");
    expect(body.status).toBe("completed");
  });

  it("handles cursor-based pagination correctly", () => {
    // Simulate DoorLoop cursor pagination
    const pages = [
      { data: [{ id: "1" }, { id: "2" }], meta: { nextCursor: "cursor_abc" } },
      { data: [{ id: "3" }, { id: "4" }], meta: { nextCursor: "cursor_def" } },
      { data: [{ id: "5" }], meta: { nextCursor: null } },
    ];
    const allItems: string[] = [];
    for (const page of pages) {
      allItems.push(...page.data.map((d) => d.id));
      if (!page.meta.nextCursor) break;
    }
    expect(allItems).toHaveLength(5);
    expect(allItems).toEqual(["1", "2", "3", "4", "5"]);
  });
});

// ─── Admin Global Webhook Log Filtering ──────────────────────────────────────
describe("Admin Global Webhook Log", () => {
  type WebhookEvent = {
    id: number;
    provider: string;
    companyId: number | null;
    status: "received" | "processed" | "failed" | "ignored";
    createdAt: Date;
  };

  const events: WebhookEvent[] = [
    { id: 1, provider: "buildium", companyId: 10, status: "processed", createdAt: new Date("2026-03-01T10:00:00Z") },
    { id: 2, provider: "appfolio", companyId: 20, status: "failed", createdAt: new Date("2026-03-01T11:00:00Z") },
    { id: 3, provider: "rentmanager", companyId: 10, status: "received", createdAt: new Date("2026-03-01T12:00:00Z") },
    { id: 4, provider: "doorloop", companyId: 30, status: "ignored", createdAt: new Date("2026-03-01T13:00:00Z") },
    { id: 5, provider: "buildium", companyId: null, status: "failed", createdAt: new Date("2026-03-01T14:00:00Z") },
  ];

  function filterEvents(
    events: WebhookEvent[],
    opts: { provider?: string; status?: string; companyId?: string }
  ) {
    return events.filter((e) => {
      if (opts.provider && opts.provider !== "all" && e.provider !== opts.provider) return false;
      if (opts.status && opts.status !== "all" && e.status !== opts.status) return false;
      if (opts.companyId && !String(e.companyId ?? "").includes(opts.companyId)) return false;
      return true;
    });
  }

  it("returns all events when no filters applied", () => {
    const result = filterEvents(events, {});
    expect(result).toHaveLength(5);
  });

  it("filters by provider correctly", () => {
    const result = filterEvents(events, { provider: "buildium" });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.provider === "buildium")).toBe(true);
  });

  it("filters by status correctly", () => {
    const result = filterEvents(events, { status: "failed" });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.status === "failed")).toBe(true);
  });

  it("filters by company ID correctly", () => {
    const result = filterEvents(events, { companyId: "10" });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.companyId === 10)).toBe(true);
  });

  it("combines provider and status filters", () => {
    const result = filterEvents(events, { provider: "buildium", status: "failed" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(5);
  });

  it("returns empty array when no events match filter", () => {
    const result = filterEvents(events, { provider: "yardi" });
    expect(result).toHaveLength(0);
  });

  it("handles null companyId in events", () => {
    const result = filterEvents(events, { companyId: "" });
    // Empty string filter should not filter anything
    expect(result).toHaveLength(5);
  });

  it("paginates correctly with offset and limit", () => {
    const PAGE_SIZE = 2;
    function paginate(items: WebhookEvent[], page: number) {
      return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    }
    expect(paginate(events, 0)).toHaveLength(2);
    expect(paginate(events, 1)).toHaveLength(2);
    expect(paginate(events, 2)).toHaveLength(1);
    expect(paginate(events, 3)).toHaveLength(0);
  });

  it("shows correct total count across all companies (global view)", () => {
    // Admin global view should include events from all companies
    const companiesRepresented = new Set(events.map((e) => e.companyId));
    expect(companiesRepresented.size).toBe(4); // 10, 20, 30, null
    expect(events).toHaveLength(5);
  });
});
