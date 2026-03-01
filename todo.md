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
