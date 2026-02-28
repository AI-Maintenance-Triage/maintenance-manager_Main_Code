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
