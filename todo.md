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

## Session 9: Live Cost, Past Jobs Tab, Payment Confirmation, Bug Fixes
- [x] Live Tracking: live job cost ticker in left panel (updates every second, rounds to 2 decimal places)
- [x] Live Tracking: live job cost shown in map overlay when contractor is selected
- [x] Live Tracking: add "Past Jobs" tab alongside "Live Jobs" tab
- [x] Past Jobs tab: list of completed sessions with route replay, job cost, duration, clock-out method
- [x] Past Jobs tab: View Route button opens RouteReplayDialog
- [x] Job verification: payment confirmation dialog showing final job cost before company approves
- [x] Job verification: company must acknowledge the payment amount before approving
- [x] Bug fix: completed and paid jobs not appearing in "Paid" filter tab on CompanyJobs
- [x] PWA install prompt on contractor dashboard ("Add to Home Screen")
- [x] Company notification preferences: toggle clock-in/clock-out notifications in settings
- [x] notifyOnClockIn, notifyOnClockOut, notifyOnJobSubmitted, notifyOnNewContractor fields in DB
- [x] Backend respects notification preferences before sending alerts

## Session 10: Photos, Earnings Dashboard, Dispute Workflow
- [ ] Schema: add completionPhotos (JSON array of S3 URLs) to maintenance_requests
- [ ] Schema: add disputeNotes, disputedAt fields to maintenance_requests
- [ ] Schema: extend status enum to include "disputed"
- [ ] Backend: jobs.uploadPhoto mutation — accepts file upload, stores in S3, appends URL to completionPhotos
- [ ] Backend: jobs.getCompletionPhotos query — returns photo URLs for a job
- [ ] Backend: jobs.dispute mutation — sets status=disputed, stores disputeNotes, notifies contractor
- [ ] Frontend: contractor clock-out dialog — photo upload UI (before/after, multiple files)
- [ ] Frontend: company verification card — show completion photos with lightbox viewer
- [ ] Frontend: company verification card — "Dispute" button with notes dialog
- [ ] Frontend: contractor My Jobs — show disputed badge and dispute notes on disputed jobs
- [ ] Frontend: /contractor/earnings page — total earnings, pending payouts, per-job breakdown
- [ ] Frontend: /contractor/earnings — monthly earnings chart
- [ ] Frontend: contractor sidebar — Earnings nav item

## Session 10 Bug Fixes
- [x] Bug: Live Tracking "Live Jobs" tab shows verified/paid jobs that are already completed
- [x] Bug: Contractor My Jobs does not show payout amount on completed/paid jobs
- [x] Contractor earnings dashboard: /contractor/earnings page
- [x] Contractor earnings dashboard: total earned, pending payout, total jobs stats
- [x] Contractor earnings dashboard: monthly earnings bar chart (last 12 months)
- [x] Contractor earnings dashboard: per-job transaction history table
- [x] Contractor sidebar: Earnings nav item

## Session 11: Stripe Payouts & Invoice PDF
- [x] Stripe Connect: auto-transfer contractor payout on job verification (already wired in chargeJobAndPayContractor)
- [x] Stripe Connect: update transaction status to paid_out via transfer.paid webhook event
- [x] Stripe Connect: transfer.failed webhook updates transaction status to failed
- [x] Invoice PDF: server-side PDF generation using pdfkit at /api/invoice/:jobId
- [x] Invoice PDF: includes job details, labor hours/rate, parts cost, platform fee, total charged, payment references
- [x] Invoice PDF: "Invoice" download button on verified/paid job cards in CompanyJobs
- [x] Invoice PDF: auth-protected endpoint (company owner or admin only)

## Session 12: Verification Cost Breakdown Bug Fix
- [ ] Bug: verification dialog shows $0 labor — fix getJobsPendingVerification to join time sessions and sum totalLaborMinutes
- [ ] Bug: hourly rate not shown — ensure hourlyRate from job is passed to verification dialog
- [ ] Fix: cost breakdown shows Labor Time (hours:minutes), Hourly Rate, Parts & Materials, Platform Fee (live %), Total
- [ ] Fix: platform fee % is live-fetched from platformSettings (admin-adjustable, default 5%)
- [ ] Fix: if no time session exists, show "No time recorded" with explanation instead of $0
- [ ] Add: View Route button on verification card (before approving) opens RouteReplayDialog

## Session 12: Expense Report, Ratings, Job Comments
- [x] Company expense report: /company/reports page
- [x] Expense report: monthly spend totals chart (last 12 months)
- [x] Expense report: per-property cost breakdown table
- [x] Expense report: CSV export button
- [x] Contractor rating: 1-5 star rating + review text after job paid
- [ ] Contractor rating: ratings visible on contractor profile and job board cards
- [ ] Contractor rating: average rating shown in company's contractor list
- [x] Job comments: back-and-forth message thread on each job card
- [x] Job comments: visible to both company and contractor
- [x] Job comments: real-time-style polling (15s refresh while open)
- [x] Job comments: company sidebar nav item for Reports

## Session 13: Notification Bell, Ratings on Cards, Verification Fix
- [x] Notifications: DB table (id, userId, type, title, body, link, metadata JSON, isRead, createdAt)
- [x] Notifications: tRPC procedures (list, markRead, markAllRead, create internal helper)
- [x] Notifications: Bell icon in DashboardLayout header (top-right, all roles)
- [x] Notifications: Red badge with unread count on bell icon
- [x] Notifications: Dropdown panel showing all notifications, newest first
- [x] Notifications: Mark individual notification as read on click
- [x] Notifications: Mark all as read button
- [x] Notifications: Deep-link — clicking a comment notification navigates to the job and opens comments
- [x] Notifications: Trigger notification to other party when a new comment is posted
- [x] Notifications: Poll every 30s for new notifications while app is open
- [x] Ratings: Show star average on contractor cards in company Contractors page
- [ ] Ratings: Show star average on job board listing cards (contractor view)
- [ ] Verification dialog: fix $0 labor — join time sessions and sum totalLaborMinutes
- [ ] Verification dialog: show Labor Time (h:mm), Hourly Rate, Parts, Platform Fee %, Total
- [ ] Verification dialog: show "No time recorded" if no session exists
- [x] Contractor receipt PDF: server-side PDF at /api/receipt/:jobId (contractor auth only)
- [x] Contractor receipt PDF: titled "Payment Receipt" with same fields as company invoice (job details, labor, parts, platform fee, payout amount, Stripe refs)
- [x] Contractor receipt PDF: "Receipt" download button on paid/verified job cards in ContractorMyJobs

## Session 14: Verification Fix, Job Board Ratings, Mobile Bell
- [x] Verification dialog: fix $0 labor — join time sessions and sum totalLaborMinutes
- [x] Verification dialog: show Labor Time (h:mm), Hourly Rate, Parts, Platform Fee %, Total
- [x] Verification dialog: show "No time recorded" if no session exists
- [x] Ratings: Show company paid-job trust badge on job board listing cards (contractor view)
- [x] Mobile bell: add notification bell to mobile bottom nav bar (fixed bottom, shows top 4 nav items + bell)

## Session 15: Email System, Dispute Flow, Admin Revenue Fix
- [x] Email: install Resend SDK and create server/email.ts helper
- [x] Email: HTML email templates (welcome, password reset, job assigned, job submitted, job verified/paid, new comment, dispute opened)
- [x] Email: send welcome email on new user registration
- [x] Email: send password reset email with secure token link
- [x] Email: send email when job is assigned to contractor
- [x] Email: send email when contractor submits job for verification
- [x] Email: send email when company verifies/pays a job
- [x] Email: send email when new comment is posted on a job
- [x] Email: send email when a job is disputed
- [x] Email: unsubscribe / notification preferences respected
- [x] Dispute: contractor "Resubmit after dispute" button on disputed job cards
- [x] Dispute: resubmit requires a response note explaining the resolution
- [x] Dispute: company sees the contractor's response note in verification queue
- [x] Admin revenue: sum transactions.totalCharged for real revenue total on admin overview
- [x] Admin revenue: show monthly revenue trend on admin overview

## Future: Infrastructure & Accounts (Do Later)
- [ ] Custom domain: purchase domain and brand name for the platform
- [ ] Email: add verified sending domain to Resend and update EMAIL_FROM from sandbox to real branded address (e.g. noreply@yourdomain.com)
- [ ] Stripe: connect live Stripe account via Settings → Payment, complete KYC verification, swap test keys for live keys

## Session 16: Email Prefs, Availability Toggle, Billing History
- [x] Email prefs: add emailPreferences JSON column to users table
- [x] Email prefs: tRPC procedures (getPrefs, updatePrefs)
- [x] Email prefs: settings page section for company and contractor (toggle per email type)
- [x] Email prefs: respect preferences in email.ts before sending each email type
- [x] Contractor availability: isAvailable boolean already in contractorProfiles schema
- [x] Contractor availability: toggle switch on contractor profile page
- [x] Contractor availability: filter out unavailable contractors from job board results
- [x] Contractor availability: show unavailable badge on contractor cards (company view)
- [x] Billing history: /company/billing page listing all transactions
- [x] Billing history: show date, job #, labor, parts, platform fee, total charged
- [x] Billing history: PDF invoice download link per transaction
- [x] Billing history: add Billing nav item to company sidebar

## Session 17: Email Opt-outs, Billing Job Title, Contractor Billing Page
- [x] Email prefs: check user emailPreferences before sending each email type in server/email.ts
- [x] Billing table: join maintenanceRequests to show job title instead of Job #ID
- [x] Billing table: also show property name per row
- [x] Contractor billing: /contractor/billing page with payout, fee deducted, net received per job
- [x] Contractor billing: summary cards (total earned, gross billed, platform fees, avg per job)
- [x] Contractor billing: PDF receipt download per job row
- [x] Contractor billing: add Billing nav item to contractor sidebar

## Session 18: Password Reset, Configurable Plans, Onboarding Checklist
- [ ] Password reset: /reset-password?token=... page with new password form
- [ ] Password reset: server-side token validation and password update endpoint
- [ ] Password reset: "Forgot password?" link on Sign In page
- [ ] Password reset: /api/auth/forgot-password endpoint to generate and email token
- [ ] Plans DB: subscriptionPlans table (id, name, price, billingInterval, features JSON, isActive)
- [ ] Plans DB: companies.planId FK to subscriptionPlans
- [ ] Plans admin: /admin/plans page to create, edit, delete plans
- [ ] Plans admin: feature toggle matrix per plan (checkboxes for each available feature)
- [ ] Plans admin: set price and billing interval (monthly/annual) per plan
- [ ] Plans admin: assign plan to a company from the company list
- [ ] Plans UI: plan badge shown on company cards in admin dashboard
- [ ] Plans UI: plan name and features shown in company settings header
- [ ] Contractor onboarding: dismissible checklist card on contractor dashboard
- [ ] Contractor onboarding: checklist items (profile photo, service area, first job, first rating)
- [ ] Contractor onboarding: auto-hide when all items are complete
- [ ] Plans live-update: plan record is single source of truth — no price/feature copies on company row
- [ ] Plans live-update: all companies on a plan immediately see name/price/feature changes
- [ ] Plans live-update: future Stripe billing reads price from plan record at charge time

## Subscription Plan System (Session N)
- [x] Add planPriceOverride and planNotes columns to companies table (migration pushed)
- [x] Add listPlans, createPlan, updatePlan, deletePlan tRPC procedures (admin only)
- [x] Add assignCompanyPlan, companyWithPlan, companiesWithPlans tRPC procedures
- [x] Build /admin/plans page: create/edit/delete plan tiers with pricing, usage limits, and feature toggles
- [x] Add "Plans" nav item to admin sidebar
- [x] Company edit dialog (pencil icon on admin dashboard): plan selector dropdown + feature preview
- [x] Company edit dialog: custom price override field with clear button and comparison display
- [x] Company edit dialog: internal notes field for plan assignment
- [x] Contractor edit dialog: informational note explaining contractors use company plans
- [x] Companies list shows current plan badge (with asterisk if price override is set)
- [x] Plans page shows how many companies are on each plan
- [x] Plans page shows list of companies without any plan assigned
- [x] Build /reset-password page for email/password password reset flow
- [x] Wire /reset-password route in App.tsx

## Plan Limit Enforcement + Billing + Stripe (Session N+1)
- [x] Backend: enforce maxProperties limit in properties.create procedure
- [x] Backend: enforce maxContractors limit in contractor invite/link procedure
- [x] Backend: enforce maxJobsPerMonth limit in maintenance request creation
- [x] Backend: helper getPlanForCompany() that resolves plan (with price override) for a company
- [x] Company billing page: show current plan name, features, price, and usage vs limits
- [x] Company billing page: show "Contact us to upgrade" CTA or upgrade flow
- [x] Add stripePriceIdMonthly and stripePriceIdAnnual columns to subscription_plans table
- [x] Admin plan form: add Stripe Price ID fields
- [ ] Stripe webhook: handle checkout.session.completed to assign plan to company
- [ ] Stripe checkout: create session tied to a plan (company can subscribe from billing page)
- [ ] Handle subscription cancellation/expiry via webhook

## Fee-Per-Plan Migration (Session N+1 addendum)
- [x] Add platformFeePercent and perListingFeeEnabled/perListingFeeAmount to subscription_plans features JSON
- [x] Migrate DB (pnpm db:push)
- [x] Update job verification fee calculation to read from company's plan (fallback to global setting)
- [x] Update per-listing fee check to read from company's plan
- [x] Remove platformFeePercent and perListingFee fields from global platform settings admin UI
- [x] Add platformFeePercent and perListingFee fields to admin plan create/edit form
- [x] Keep global settings as a fallback for companies with no plan assigned

## Contractor Plans System (Session N+2)
- [x] Add planType enum (company/contractor) to subscription_plans schema
- [x] Add planId, planPriceOverride, planNotes to contractor_profiles schema
- [x] Push migration (pnpm db:push)
- [x] Add contractor plan db helpers (getEffectivePlanForContractor, countActiveJobsForContractor, countCompaniesForContractor)
- [x] Update admin-viewas router: filter listPlans by type, add assignContractorPlan procedure
- [x] Update AdminSubscriptionPlans page: tabs for Company Plans / Contractor Plans
- [x] Contractor edit dialog in PlatformDashboard: plan selector + price override + notes
- [x] Add contractor.getMyPlan query
- [x] Enforce contractor plan limits in backend (max active jobs, max companies)
- [x] Build company billing page plan display with usage gauges and upgrade CTA

## Plan Hardening + Stripe Billing (Session N+3)
- [x] Schema: add planStatus (active/trialing/expired), planExpiresAt, planAssignedAt to companies + contractor_profiles
- [x] Schema: push migration
- [x] Backend: enforce GPS time tracking feature flag (clockIn/clockOut/pingLocation procedures)
- [x] Backend: enforce AI classification feature flag (classifyMaintenanceRequest call)
- [x] Backend: enforce expense reports feature flag (reports.getExpenseReport procedure)
- [x] Backend: enforce contractor ratings feature flag (ratings.create procedure)
- [x] Backend: enforce job comments feature flag (comments.create procedure)
- [x] Backend: enforce API access feature flag (placeholder apiAccess guard)
- [x] Backend: enforce email notifications feature flag (check before sending each email type)
- [x] Backend: plan expiry check helper — returns null plan if expired
- [ ] Backend: enforce plan limits for contractors (maxActiveJobs already done; add maxCompanies guard)
- [x] Stripe: create checkout session tied to plan stripePriceId (company self-serve subscribe)
- [x] Stripe: webhook checkout.session.completed → assign plan + set planStatus=active + planAssignedAt
- [x] Stripe: webhook customer.subscription.deleted → set planStatus=expired
- [x] Stripe: webhook invoice.payment_failed → set planStatus=expired after grace period
- [x] Frontend: company billing page — "Subscribe" button that opens Stripe checkout for current plan
- [x] Frontend: company billing page — show plan status badge (active/trialing/expired)
- [x] Frontend: contractor billing page — plan card with usage gauge, feature list, upgrade CTA
- [x] Tests: plan limit enforcement (properties, contractors, jobs/month)
- [x] Tests: contractor plan limits (maxActiveJobs, maxCompanies)
- [x] Tests: fee calculation (platformFeePercent from plan vs global fallback)
- [x] Tests: per-listing fee calculation (plan-level toggle + amount)
- [x] Tests: plan expiry — expired plan returns null features, limits not enforced (no plan = no limits)
- [x] Tests: Stripe checkout session creation with correct priceId
- [x] Tests: Stripe webhook plan assignment

## Billing Page Fixes (COMPLETED)
- [x] Fix company billing page bugs (plan display, Stripe checkout, cancel subscription)
- [x] Build contractor billing page: current plan card, subscription cost history, all available plans grid, upgrade button
- [x] Add contractor plan Stripe checkout procedure to stripeRouter
- [x] Add webhook handling for contractor subscription events (checkout.session.completed for contractors)
- [x] Write 66 tests for plan enforcement, fee calculation, and Stripe billing logic (all passing)
