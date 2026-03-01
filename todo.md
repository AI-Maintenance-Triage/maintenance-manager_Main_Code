# Maintenance Manager - Project TODO

## Core Architecture
- [x] Multi-tenant database schema with company_id isolation
- [x] Three-role authentication (Platform Admin, Company Admin, Contractor)
- [x] Role-based access control in tRPC procedures

## AI Engine
- [x] AI job classification (priority + skill tier) via LLM
- [x] Structured JSON response for job triage

## Company Features
- [x] Company registration and profile management
- [x] Company-specific tiered hourly rate system (General, Skilled, Specialty, Emergency)
- [x] Billable time policy settings (On-Site Only, Full Trip, Hybrid with Cap)
- [x] Geofence radius configuration
- [x] Auto clock-out timer configuration
- [x] Max session duration safety net
- [x] Timesheet review window toggle
- [x] Job escalation rules
- [x] Notification preferences
- [x] Contractor management (invite, approve, preferred contractors)

## Properties & Maintenance Requests
- [x] Property management (CRUD for properties per company)
- [x] Maintenance request ingestion and display
- [x] AI-powered auto-classification on new requests
- [x] Job status workflow (Open → Assigned → In Progress → Completed → Paid)

## Contractor Marketplace
- [x] Contractor profiles (trades, service area, credentials)
- [x] Contractor-company relationship management
- [x] Job board with company-branded listings
- [x] Job acceptance workflow

## GPS Time Tracking
- [x] Clock-in/clock-out with GPS coordinates
- [x] Geofence verification against property address
- [x] Trip logging (location pings)
- [ ] Auto clock-out after returning to origin (requires mobile app)
- [x] Timesheet calculation and review

## Payment Engine (Stripe Connect)
- [ ] Stripe Connect placeholder/test mode setup
- [ ] Payment flow: charge company → split → pay contractor + platform fee
- [ ] Escrow hold on job acceptance
- [x] Transaction history and invoices

## Financial Reporting
- [ ] Company expense reports and per-property cost analysis
- [ ] Contractor income dashboard and payment history
- [ ] 1099-K placeholder for year-end

## Integration Framework
- [x] Pluggable connector architecture
- [x] Buildium connector placeholder with self-service setup wizard
- [ ] Mock data layer for testing without live integrations

## Web Dashboard
- [x] Platform Admin dashboard (manage companies, analytics, system health)
- [x] Company Admin dashboard (jobs, contractors, properties, settings, reports)
- [x] Contractor dashboard (job board, active jobs, timesheets, earnings)
- [x] Robust settings pages for companies and contractors
- [x] Professional dark theme UI design

## Public-Facing & Registration
- [x] Public landing page with feature highlights and Get Started CTA
- [x] Two-path registration flow (Property Management Company vs Contractor/Handyman)
- [x] Company registration with unique fields (company name, address, phone, email)
- [x] Contractor registration with unique fields (business name, trades, service area, license)
- [x] No paywalls for testing purposes

## Admin Impersonation
- [x] Admin "View As" toggle to impersonate any company or contractor
- [x] Admin dashboard fully separated from company/contractor views
- [x] ViewAs context with company/contractor selection dropdowns
- [x] Company pages load data via adminViewAs procedures when impersonating
- [x] Contractor pages load data via adminViewAs procedures when impersonating

## Testing
- [x] Backend unit tests for core procedures
- [x] AI classification tests (7 tests covering all scenarios)

## Bugs (Resolved)
- [x] Sidebar navigation links (Platform Admin, Companies) not responding to clicks
- [x] Admin can switch view to Company Admin or Contractor to test all flows
- [x] Admin sidebar should show all navigation sections (admin + company + contractor)

## Admin Test Data Creation
- [x] Admin can create test companies directly from admin dashboard
- [x] Admin can create test contractors directly from admin dashboard
- [x] Created test entities appear in View As dropdowns immediately

## Auth & Registration Fixes (Session 2)
- [x] Fix sign-out to redirect to homepage (/) instead of showing blank sign-in screen
- [x] Fix homepage CTA buttons to route to /register after login for new users
- [x] Add "Sign In" vs "Register" distinction on homepage nav
- [x] Ensure company registration flow completes and redirects to /company dashboard
- [x] Ensure contractor registration flow completes and redirects to /contractor dashboard
- [x] Fix DashboardLayout to redirect to / instead of showing inline sign-in when unauthenticated

## Custom Email/Password Authentication (Session 2)
- [x] Add password_hash column to users table
- [x] Install bcrypt for password hashing
- [x] Build /api/auth/register endpoint (email + password + name)
- [x] Build /api/auth/login endpoint (email + password)
- [x] Build custom session token generation (JWT)
- [x] Build frontend Sign Up page with email/password form
- [x] Build frontend Sign In page with email/password form
- [x] Update homepage CTA buttons to route to custom sign-up page
- [x] Keep Manus OAuth working for admin account
- [x] Integrate role selection (Company vs Contractor) into sign-up flow
- [x] Test: register as new company user with email/password
- [x] Test: register as new contractor user with email/password
- [x] Test: sign in with existing email/password
- [x] Test: admin still works via Manus OAuth

## Admin Login Fix
- [x] Add "Sign in with Manus" button to SignIn page for admin OAuth access
- [x] Add "Sign in with Manus" option to SignUp page as alternative

## User Feedback Fixes (Session 3)
- [x] Fix contractor names showing as "Unnamed" and no trades on admin dashboard
- [x] Remove company-linking from admin dashboard (contractors are independent, find jobs via job board)
- [x] Add edit/delete for registered companies on admin dashboard (edit all profile fields)
- [x] Add edit/delete for registered contractors on admin dashboard (edit all profile fields)
- [x] Fix View As Company/Contractor to fully mimic their view — no admin UI visible
- [x] Homepage "Get Started" goes directly to role-specific sign-up (?role=company or ?role=contractor)
- [x] Remove website field from company registration form
- [x] Add first/last name option for contractors (not all have a business name)
- [x] Make property name optional when adding a property (defaults to address)
- [x] Add interactive map with ZIP code + radius slider for contractor service area
- [x] Make all company settings editable (skill tier prices, GPS settings, integrations)

## Registration Flow Redesign (Session 4)
- [x] Create /get-started page with role selection as the very first step (before account creation)
- [x] All homepage CTAs route to /get-started (generic) or /get-started?role=company / /get-started?role=contractor
- [x] After role selection, user goes to /signup?role=... to create account
- [x] Add first/last name fields for contractors in registration form
- [x] Add interactive map with ZIP + radius slider for contractor service area
- [x] Make all company settings fully editable (skill tier prices, GPS, integrations)

## Public Job Board (Service Area Filtering)
- [x] Add lat/lng columns to properties table for geocoding
- [x] Add lat/lng columns to contractor_profiles for their base ZIP location
- [x] Geocode property addresses when properties are created/updated
- [x] Geocode contractor base ZIP when they register or update service area
- [x] Build jobBoard.list tRPC query that filters jobs by contractor service radius (Haversine distance)
- [x] Build jobBoard.accept tRPC mutation for contractors to claim a job
- [x] Build contractor job board UI page (/contractor/job-board) with filterable job cards
- [x] Show job details: property city/state (not full address), trade required, urgency, posted date
- [x] Add "Accept Job" button that assigns the job to the contractor
- [x] Wire company maintenance request submission to set job status to "posted" on the board
- [x] Add job board nav item to contractor sidebar

## Admin Impersonation Rebuild
- [x] Rebuild DashboardLayout: when impersonating, show ZERO admin UI — only the impersonated user's full sidebar/nav
- [x] Add a thin "Exit to Admin" banner at the very top as the only impersonation indicator
- [x] Rename "View as Company" / "View as Contractor" to "Login as Company" / "Login as Contractor"
- [x] All company pages (properties, jobs, settings, etc.) work with full functionality when admin impersonates
- [x] All contractor pages work with full functionality when admin impersonates
- [x] Fix property add button missing in company view
- [x] Remove dual-query pattern (adminViewAs vs regular) — use a single transparent impersonation layer

## Admin Delete Cascade Fix
- [x] Fix deleteCompany to also delete all users associated with that company
- [x] Fix deleteContractorProfile to also delete the contractor's user account
- [x] Verify re-registration with the same email works after deletion

## Admin Impersonation Mutation Fix
- [x] Fix circular reference bug in getEffectiveContractorProfile (was calling itself instead of db.getContractorProfile)
- [x] Backend: getEffectiveCompanyId reads ctx.impersonatedCompanyId (set from x-impersonate-company-id header)
- [x] Backend: getEffectiveContractorProfile reads ctx.impersonatedContractorProfileId (set from x-impersonate-contractor-id header)
- [x] Frontend: tRPC client sends x-impersonate-company-id / x-impersonate-contractor-id headers from localStorage on every request
- [x] Simplified CompanyProperties.tsx to use single properties.create mutation (works for both regular and impersonating admin)
- [x] Added 9 impersonation unit tests (all passing)
- [x] 26 total tests passing, 0 TypeScript errors

## Bug: Job Board Stale Cache After Service Area Update
- [x] After contractor reduces service radius, job board still shows jobs that are now outside the new radius
- [x] Root cause 1: ContractorProfile.tsx updateProfile.onSuccess did not invalidate jobBoard.list
- [x] Root cause 2: updateProfile backend did not re-geocode contractor base ZIP on service area change
- [x] Fix: invalidate jobBoard.list + contractor.getProfile after any service area update (frontend)
- [x] Fix: re-geocode contractor base ZIP in updateProfile mutation (backend)
- [x] Added 10 job board / Haversine unit tests including the exact reported bug scenario

## Skill Tier Restrictions for Company Users
- [x] Hide "Add Skill Tier" button on company settings page (company users only; admin keeps it)
- [x] Hide "Delete" button on each skill tier row for company users (admin keeps it)
- [x] Company users can still edit hourly rate / emergency multiplier on existing tiers
- [x] Edit dialog shows tier name and description as read-only text for company users (editable for admin)
- [x] Backend: skillTiers.create and skillTiers.delete throw FORBIDDEN for company_admin role (admin only)

## Bug: Job Board Service Area Filtering Not Working (Deep Investigation)
- [x] Root cause 1: Silent fallback — if contractor has no coords, ALL jobs were returned (radius ignored)
- [x] Root cause 2: Silent fallback — if property has no coords, job was always included regardless of distance
- [x] Fix: contractor with no coords now returns empty list with "Fix My Location" CTA
- [x] Fix: property with no coords is now excluded from the board (can't filter without coordinates)
- [x] Added contractor.refreshGeocode mutation to re-geocode on demand from the job board
- [x] Added jobBoard.debug endpoint + Debug panel on job board to show raw coords and distances
- [x] Debug panel shows contractor coords, property coords, distance, and whether each job is in range

## Google Maps API Key Integration
- [x] Added GOOGLE_MAPS_API_KEY secret (server-side geocoding)
- [x] Added VITE_GOOGLE_MAPS_API_KEY secret (frontend address autocomplete)
- [x] Updated geocodeAddress helper to use direct Google Maps Geocoding API with key
- [x] Added address autocomplete (Places API) to property creation form with auto-fill city/state/ZIP/coords
- [x] Added geocoding status badge to contractor profile service area section
- [x] Added admin.bulkReGeocode mutation to fix all existing records missing coordinates
- [x] Added "Fix Locations" button to admin dashboard that re-geocodes all missing records
- [x] Geocoding test passes: ZIP 10001 → 40.75, -73.99 (Manhattan)

## Bug: Address Autocomplete Click Not Working in Dialog
- [x] Google Places dropdown shows but clicking a suggestion does not fill the form
- [x] Root cause: Radix Dialog DismissableLayer intercepts mousedown on pac-container (appended to body outside dialog)
- [x] Fix: capture-phase mousedown listener stops propagation when target is inside .pac-container

## Bug: Job Board Radius Filtering Still Not Working
- [x] Root cause confirmed via Debug panel: property had NULL coordinates (not the contractor)
- [x] Contractor coords: 39.43, -80.14 (West Virginia) — correct
- [x] Property coords: NULL — needs Fix Locations button on admin dashboard
- [x] Fix: properties.update now re-geocodes when address fields change (same as properties.create)
- [x] Fix: added detailed server-side logging to updateProfile mutation for future debugging
- [x] 38 tests passing, 0 TypeScript errors

## Bug: Address Autocomplete Click Still Not Working (Round 2)
- [x] stopPropagation fix did not work — Radix Dialog z-index/pointer-events blocks pac-container clicks
- [x] Fix: replaced native Google Places Autocomplete widget with AutocompleteService + PlacesService (manual API)
- [x] Custom dropdown renders inside the React tree (inside Dialog DOM), no z-index/pointer-events conflict
- [x] Supports keyboard navigation (arrow keys, Enter, Escape), loading spinner, and "Powered by Google" attribution
- [x] onMouseDown + preventDefault prevents input blur before click fires (key trick for Dialog compatibility)

## Job Completion Workflow
- [ ] Schema: add completionNotes, completionPhotos (JSON array of S3 URLs), verificationNotes, disputeNotes to maintenance_requests
- [ ] Schema: extend status enum to include "pending_verification", "disputed", "completed", "cancelled"
- [ ] Backend: contractor.markComplete mutation (uploads photos to S3, sets status=pending_verification)
- [ ] Backend: company.verifyJob mutation (approve → status=completed, reject → status=disputed)
- [ ] Backend: company.getJobsAwaitingVerification query
- [ ] Frontend: contractor My Jobs page — Mark Complete button with notes + photo upload
- [ ] Frontend: company Jobs page — Pending Verification tab with approve/reject actions
- [ ] Notify company owner when a job is marked complete (built-in notification)
- [ ] Notify contractor when a job is verified or disputed

## Stripe Connect Payment Split
- [ ] Add Stripe Connect integration (webdev_add_feature stripe)
- [ ] Schema: add stripePaymentIntentId, platformFeePercent, payoutAmount to maintenance_requests
- [ ] Backend: charge company on job verification, split payout to contractor minus platform fee
- [ ] Frontend: contractor onboarding — connect Stripe account to receive payouts
- [ ] Frontend: company billing — payment method setup

## Distance on Job Board Cards
- [ ] Show "X miles away" on each job card in the contractor job board
- [ ] Backend: include distance in jobBoard.list response

## Contractor Address Autocomplete
- [ ] Replace ZIP code field in contractor profile with full address autocomplete
- [ ] Store full base address + geocode on save

## AI Job Categorization
- [ ] On job creation, call LLM to suggest skill tier and urgency level
- [ ] Show AI suggestion as pre-filled defaults in the job creation form
- [ ] Allow company to accept or override the suggestion

## Stripe Connect Payment System (Full)
- [ ] Schema: add stripeCustomerId to companies, stripeAccountId + stripeOnboardingComplete to contractor_profiles
- [ ] Schema: add platform_settings table (platformFeePercent, perListingFeeEnabled, perListingFeeAmount, autoClockOutMinutes)
- [ ] Backend: Stripe Connect Express account creation + onboarding link for contractors
- [ ] Backend: Stripe Customer + SetupIntent for company card on file
- [ ] Backend: On job verification — charge company (job cost + platform % fee + per-listing fee if enabled), transfer full job cost to contractor Stripe account
- [ ] Backend: Stripe webhook handler at /api/stripe/webhook
- [ ] Frontend: Contractor "Connect Bank Account" button in profile settings
- [ ] Frontend: Company "Payment Setup" section in company settings
- [ ] Frontend: Payment summary shown at verification step (breakdown: job cost + fees = total)

## GPS Clock-In/Out & Live Tracking
- [ ] Schema: add clockedInAt, clockedOutAt, startLat, startLng, totalHours to time_sessions
- [ ] Schema: locationPings table (jobId, contractorProfileId, lat, lng, timestamp, accuracy)
- [ ] Backend: contractor.clockIn mutation (stores GPS start location + timestamp)
- [ ] Backend: contractor.clockOut mutation (calculates totalHours, marks job in_progress → ready for verification)
- [ ] Backend: contractor.pingLocation mutation (stores GPS ping every ~30s while clocked in)
- [ ] Backend: auto-clock-out check — if contractor returns within 200m of start location and autoClockOutMinutes pass without manual clock-out, auto clock out
- [ ] Frontend: Contractor job page — Clock In / Clock Out button with browser GPS permission request
- [ ] Frontend: Company live map — shows contractor's current GPS position on Google Map, route status badge (En Route / On Site / Returning)

## Admin Platform Settings
- [ ] Platform fee % (default 5%, live-editable from admin dashboard)
- [ ] Per-listing fee toggle + dollar amount (default off, $0)
- [ ] Auto-clock-out timeout in minutes (default 15 min, adjustable)
- [ ] All settings stored in platform_settings table, read on every job verification
- [ ] Admin dashboard settings panel for all three controls

## GPS Live Tracking & Auto Clock-Out (Session 7)
- [x] Switch GPS tracking from interval pings to continuous watchPosition (mirrors Google Maps live tracking)
- [x] watchPosition fires on every position change as contractor moves — no fixed interval
- [x] Auto clock-out: detect when contractor returns within configurable radius of clock-in origin
- [x] Auto clock-out: show toast warning with countdown when contractor is back near origin
- [x] Auto clock-out: cancel timer if contractor moves away from origin before timer fires
- [x] Auto clock-out: fire clock-out automatically after configurable minutes (default: 15 min)
- [x] Admin dashboard: auto clock-out minutes setting (adjustable)
- [x] Admin dashboard: auto clock-out geofence radius setting (adjustable, default 200m)
- [x] Live GPS indicator badge on job card while watchPosition is active
- [x] Cleanup watchPosition watcher and timers on component unmount
- [x] Live Tracking page for companies (/company/live-tracking)
- [x] Live Tracking: Google Maps with real-time contractor position markers (blue arrow)
- [x] Live Tracking: Job site markers (amber pin) for each active session
- [x] Live Tracking: Left panel with contractor list, on-clock duration, last seen time
- [x] Live Tracking: Click contractor to pan map to their current location
- [x] Live Tracking: Selected contractor info overlay on map
- [x] Live Tracking: Polls every 5 seconds for fresh positions
- [x] Live Tracking: Stale indicator (>2 min since last ping = gray/offline)
- [x] Live Tracking nav item added to company sidebar
- [x] 9 GPS tracking unit tests (Haversine distance, auto clock-out logic) — all passing
- [x] 47 total tests passing, 0 TypeScript errors

## Enhancements: Notifications, Route Replay, ETA (Session 8)
- [x] Push notification to company owner when contractor clocks in on a job
- [x] Push notification to company owner when contractor clocks out on a job
- [x] Trip history route replay: "View Route" button on completed/verified jobs
- [x] Route replay: draws full breadcrumb polyline on Google Maps from clock-in to clock-out
- [x] Route replay: shows clock-in pin, clock-out pin, and all intermediate pings
- [x] Route replay: accessible from CompanyJobs verification/completed job cards
- [x] Contractor ETA on Live Tracking map using Google Maps Directions API
- [x] ETA displayed in the selected contractor info overlay on the map
- [x] ETA displayed in the left-panel contractor list card
- [x] Route to job site drawn on map when contractor is selected (blue polyline via Directions API)
