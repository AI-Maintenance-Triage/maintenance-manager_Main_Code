# E2E Test Coverage Report

**Generated:** March 2026  
**Total tests:** 202 across 7 spec files  
**Framework:** Playwright (Chromium)  
**Run command:** `pnpm test:e2e`

---

## Test File Summary

| File | Tests | Scope |
|---|---|---|
| `auth.spec.ts` | 38 | Registration, login, logout, password reset, OAuth, form validation, keyboard accessibility |
| `public.spec.ts` | 11 | Landing page, pricing, contact, public navigation |
| `company.spec.ts` | 49 | Dashboard, properties, jobs, contractors, billing, integrations, settings, team, analytics |
| `contractor.spec.ts` | 34 | Dashboard, job board, my jobs, profile, earnings, payouts, geofence, onboarding, mobile |
| `admin.spec.ts` | 46 | Dashboard, companies, contractors, revenue, plans, activity feed, audit log, feature flags, email blast, suspensions, payout holds, churn risk, announcements, promo codes, feature requests |
| `api.spec.ts` | 16 | Stripe webhook, PMS webhook HMAC, invoice PDF, receipt PDF, bulk ZIP export, server health |
| `cron.spec.ts` | 8 | Trial expiry, PMS auto-sync, job escalation, idempotency |

---

## Coverage by Role

### Public / Unauthenticated

| Feature | Spec File | Status |
|---|---|---|
| Landing page loads and renders hero section | `public.spec.ts` | ✅ Covered |
| Pricing page shows all plans | `public.spec.ts` | ✅ Covered |
| Contact page form submits | `public.spec.ts` | ✅ Covered |
| Navigation links work (Home, Pricing, Contact) | `public.spec.ts` | ✅ Covered |
| Unauthenticated access to `/company` redirects to login | `public.spec.ts` | ✅ Covered |
| Unauthenticated access to `/admin` redirects to login | `public.spec.ts` | ✅ Covered |
| 404 page for unknown routes | `public.spec.ts` | ✅ Covered |

### Authentication

| Feature | Spec File | Status |
|---|---|---|
| Register with email/password | `auth.spec.ts` | ✅ Covered |
| Register — duplicate email shows error | `auth.spec.ts` | ✅ Covered |
| Register — password too short (< 8 chars) shows error | `auth.spec.ts` | ✅ Covered |
| Register — password strength indicator updates in real time | `auth.spec.ts` | ✅ Covered |
| Register — mismatched passwords shows error | `auth.spec.ts` | ✅ Covered |
| Login with valid credentials | `auth.spec.ts` | ✅ Covered |
| Login — wrong password shows error | `auth.spec.ts` | ✅ Covered |
| Login — empty fields show validation errors | `auth.spec.ts` | ✅ Covered |
| Logout clears session and redirects | `auth.spec.ts` | ✅ Covered |
| Password reset — request email | `auth.spec.ts` | ✅ Covered |
| Password reset — invalid token shows error | `auth.spec.ts` | ✅ Covered |
| Password reset — new password strength indicator | `auth.spec.ts` | ✅ Covered |
| OAuth login flow (Manus OAuth) | `auth.spec.ts` | ✅ Covered |
| Invite accept — valid token registers new user | `auth.spec.ts` | ✅ Covered |
| Invite accept — expired token shows error | `auth.spec.ts` | ✅ Covered |
| Team invite accept — valid token joins team | `auth.spec.ts` | ✅ Covered |
| Keyboard accessibility — Tab through login form | `auth.spec.ts` | ✅ Covered |
| Keyboard accessibility — Enter submits login form | `auth.spec.ts` | ✅ Covered |

### Company Role

| Feature | Spec File | Status |
|---|---|---|
| Dashboard KPI cards (open jobs, completed, contractors, properties) | `company.spec.ts` | ✅ Covered |
| Dashboard announcements banner | `company.spec.ts` | ✅ Covered |
| Properties list loads | `company.spec.ts` | ✅ Covered |
| Add property dialog | `company.spec.ts` | ✅ Covered |
| Property units management | `company.spec.ts` | ✅ Covered |
| Jobs list with status filters | `company.spec.ts` | ✅ Covered |
| Create job from maintenance request | `company.spec.ts` | ✅ Covered |
| Job detail dialog | `company.spec.ts` | ✅ Covered |
| Assign contractor to job | `company.spec.ts` | ✅ Covered |
| Rate contractor after job completion | `company.spec.ts` | ✅ Covered |
| Trusted contractors list | `company.spec.ts` | ✅ Covered |
| Invite contractor by link | `company.spec.ts` | ✅ Covered |
| Billing / subscription plan display | `company.spec.ts` | ✅ Covered |
| Upgrade plan via Stripe Checkout | `company.spec.ts` | ✅ Covered |
| ACH payment pending state | `company.spec.ts` | ✅ Covered |
| Invoice list and PDF download | `company.spec.ts` | ✅ Covered |
| PMS integrations card (Buildium) | `company.spec.ts` | ✅ Covered |
| Webhook URL display and copy | `company.spec.ts` | ✅ Covered |
| Last-synced relative timestamp | `company.spec.ts` | ✅ Covered |
| Sync Now button | `company.spec.ts` | ✅ Covered |
| Company settings save | `company.spec.ts` | ✅ Covered |
| Team members list | `company.spec.ts` | ✅ Covered |
| Team invite by email | `company.spec.ts` | ✅ Covered |
| Analytics charts load | `company.spec.ts` | ✅ Covered |
| Expense report CSV export | `company.spec.ts` | ✅ Covered |
| Property reports generation | `company.spec.ts` | ✅ Covered |
| Live tracking map loads | `company.spec.ts` | ✅ Covered |
| Verification documents upload | `company.spec.ts` | ✅ Covered |
| Admin impersonation banner visible when viewing as | `company.spec.ts` | ✅ Covered |
| Feature request submission | `company.spec.ts` | ✅ Covered |
| Loading and empty states throughout | `company.spec.ts` | ✅ Covered |

### Contractor Role

| Feature | Spec File | Status |
|---|---|---|
| Dashboard stats cards | `contractor.spec.ts` | ✅ Covered |
| Active jobs section with empty state | `contractor.spec.ts` | ✅ Covered |
| Announcements banner | `contractor.spec.ts` | ✅ Covered |
| Job board loads | `contractor.spec.ts` | ✅ Covered |
| Job board search filter | `contractor.spec.ts` | ✅ Covered |
| Priority filter chips | `contractor.spec.ts` | ✅ Covered |
| Skill tier filter chips | `contractor.spec.ts` | ✅ Covered |
| Job card opens detail dialog | `contractor.spec.ts` | ✅ Covered |
| Accept job moves it to My Jobs | `contractor.spec.ts` | ✅ Covered |
| My Jobs status filter tabs | `contractor.spec.ts` | ✅ Covered |
| Start job / clock in flow | `contractor.spec.ts` | ✅ Covered |
| Complete job shows completion form | `contractor.spec.ts` | ✅ Covered |
| Profile form (name, bio, skills) | `contractor.spec.ts` | ✅ Covered |
| Save profile shows success toast | `contractor.spec.ts` | ✅ Covered |
| Add service area | `contractor.spec.ts` | ✅ Covered |
| Profile photo upload | `contractor.spec.ts` | ✅ Covered |
| Skill tier badge visible | `contractor.spec.ts` | ✅ Covered |
| Earnings chart loads | `contractor.spec.ts` | ✅ Covered |
| Payouts — Stripe Connect status | `contractor.spec.ts` | ✅ Covered |
| Geofence warning when outside radius | `contractor.spec.ts` | ✅ Covered |
| Clock In triggers location check | `contractor.spec.ts` | ✅ Covered |
| Onboarding checklist visible | `contractor.spec.ts` | ✅ Covered |
| Onboarding step links to profile | `contractor.spec.ts` | ✅ Covered |
| Job board refresh button | `contractor.spec.ts` | ✅ Covered |
| Mobile viewport — no horizontal scroll | `contractor.spec.ts` | ✅ Covered |
| Feature request submission | `contractor.spec.ts` | ✅ Covered |

### Admin Role

| Feature | Spec File | Status |
|---|---|---|
| Dashboard KPI cards | `admin.spec.ts` | ✅ Covered |
| Recent registrations table | `admin.spec.ts` | ✅ Covered |
| Sidebar navigation | `admin.spec.ts` | ✅ Covered |
| Companies list with search | `admin.spec.ts` | ✅ Covered |
| View As (impersonate company) | `admin.spec.ts` | ✅ Covered |
| Suspend company confirmation dialog | `admin.spec.ts` | ✅ Covered |
| Contractors list | `admin.spec.ts` | ✅ Covered |
| View As (impersonate contractor) | `admin.spec.ts` | ✅ Covered |
| Revenue KPI cards (MRR, ARR) | `admin.spec.ts` | ✅ Covered |
| Revenue chart | `admin.spec.ts` | ✅ Covered |
| Subscription plans list | `admin.spec.ts` | ✅ Covered |
| Create plan dialog | `admin.spec.ts` | ✅ Covered |
| Edit plan pre-filled dialog | `admin.spec.ts` | ✅ Covered |
| Deactivate plan confirmation dialog | `admin.spec.ts` | ✅ Covered |
| Price change warning for existing subscribers | `admin.spec.ts` | ✅ Covered |
| Activity feed loads | `admin.spec.ts` | ✅ Covered |
| Load More pagination | `admin.spec.ts` | ✅ Covered |
| Audit log search filter | `admin.spec.ts` | ✅ Covered |
| Leaderboard loads | `admin.spec.ts` | ✅ Covered |
| Churn risk table or empty state | `admin.spec.ts` | ✅ Covered |
| Email blast form | `admin.spec.ts` | ✅ Covered |
| Payout holds table or empty state | `admin.spec.ts` | ✅ Covered |
| Suspensions table or empty state | `admin.spec.ts` | ✅ Covered |
| Credits management | `admin.spec.ts` | ✅ Covered |
| Promo codes list and create | `admin.spec.ts` | ✅ Covered |
| Announcements list and create | `admin.spec.ts` | ✅ Covered |
| Feature flags toggle | `admin.spec.ts` | ✅ Covered |
| Admin settings save | `admin.spec.ts` | ✅ Covered |
| Feature requests list and status update | `admin.spec.ts` | ✅ Covered |
| Tablet viewport (768px) | `admin.spec.ts` | ✅ Covered |

### REST API Endpoints

| Endpoint | Method | Test | Spec File |
|---|---|---|---|
| `/api/stripe/webhook` | POST | No signature → 400/401 | `api.spec.ts` |
| `/api/stripe/webhook` | POST | Test event id → `{verified:true}` | `api.spec.ts` |
| `/api/stripe/webhook` | POST | Malformed JSON → 400 | `api.spec.ts` |
| `/api/webhooks/pms/buildium` | POST | No signature → 401 | `api.spec.ts` |
| `/api/webhooks/pms/buildium` | POST | Wrong HMAC → 401 | `api.spec.ts` |
| `/api/webhooks/pms/buildium` | POST | Unknown AccountId → not 5xx | `api.spec.ts` |
| `/api/invoice/:id/pdf` | GET | Unauthenticated → 401/404 | `api.spec.ts` |
| `/api/receipt/:id/pdf` | GET | Unauthenticated → 401/404 | `api.spec.ts` |
| `/api/invoice/bulk-export` | POST | Unauthenticated → 401 | `api.spec.ts` |
| `/api/invoice/bulk-export` | POST | Empty ids → 400/401 | `api.spec.ts` |
| `/` | GET | Returns 200 | `api.spec.ts` |
| `/api/trpc/auth.me` | GET | Returns tRPC envelope | `api.spec.ts` |
| `/api/trpc/nonexistent` | GET | Returns 404 | `api.spec.ts` |
| Unknown routes | GET | Returns 404 not 500 | `api.spec.ts` |

### Background Cron Jobs

| Job | Test | Spec File |
|---|---|---|
| Trial expiry | Runs without 5xx; rejects unauthenticated | `cron.spec.ts` |
| PMS auto-sync | Runs without 5xx; rejects unauthenticated | `cron.spec.ts` |
| Job escalation | Runs without 5xx; rejects unauthenticated | `cron.spec.ts` |
| Trial expiry idempotency | Two consecutive runs both succeed | `cron.spec.ts` |
| PMS sync idempotency | Two consecutive runs do not create duplicates | `cron.spec.ts` |

---

## Known Gaps

The following areas are not yet covered by automated E2E tests and represent opportunities for future test expansion:

| Area | Reason | Priority |
|---|---|---|
| Stripe Checkout redirect end-to-end (real card flow) | Requires Stripe test mode browser session; complex to automate | Medium |
| Email delivery verification (invite, reset, blast) | Requires email inbox API (e.g., Mailosaur) | Medium |
| Real Buildium webhook with valid HMAC | Requires live Buildium sandbox credentials in CI | High |
| PDF content validation (correct invoice data) | Requires PDF parsing library in tests | Low |
| WebSocket / real-time job board updates | Requires socket-level test harness | Low |
| Contractor auto clock-out after 8 hours | Requires time manipulation (fake timers) | Low |
| Admin View As → perform action → exit impersonation | Complex multi-step flow; partially covered | Medium |
| Accessibility audit (axe-core) | Should be added as a separate `a11y.spec.ts` | Medium |

---

## Running the Tests

```bash
# Run all E2E tests headlessly
pnpm test:e2e

# Run with interactive UI
pnpm test:e2e:ui

# Run a specific file
pnpm test:e2e -- tests/e2e/company.spec.ts

# View the HTML report after a run
pnpm test:e2e:report
```

Set `PLAYWRIGHT_BASE_URL` to point at a staging or production URL:

```bash
PLAYWRIGHT_BASE_URL=https://firstgrabmaintenance.ai pnpm test:e2e
```
