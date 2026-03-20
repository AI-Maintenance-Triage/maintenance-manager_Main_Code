import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ViewAsProvider } from "./contexts/ViewAsContext";
import Home from "./pages/Home";
import Register from "./pages/Register";
import SignUp from "./pages/SignUp";
import SignIn from "./pages/SignIn";
import GetStarted from "./pages/GetStarted";
import DashboardLayout from "./components/DashboardLayout";
import CompanyDashboard from "./pages/company/CompanyDashboard";
import CompanyJobs from "./pages/company/CompanyJobs";
import CompanyProperties from "./pages/company/CompanyProperties";
import CompanyContractors from "./pages/company/CompanyContractors";
import CompanySettings from "./pages/company/CompanySettings";
import CompanyVerification from "./pages/company/CompanyVerification";
import LiveTracking from "./pages/company/LiveTracking";
import CompanyExpenseReport from "./pages/company/CompanyExpenseReport";
import CompanyBilling from "./pages/company/CompanyBilling";
import CompanyIntegrations from "./pages/company/CompanyIntegrations";
import ContractorDashboard from "./pages/contractor/ContractorDashboard";
import ContractorJobBoard from "./pages/contractor/ContractorJobBoard";
import ContractorMyJobs from "./pages/contractor/ContractorMyJobs";
import ContractorProfile from "./pages/contractor/ContractorProfile";
import ContractorEarnings from "./pages/contractor/ContractorEarnings";
import ContractorBilling from "./pages/contractor/ContractorBilling";
import ContractorPayouts from "./pages/contractor/ContractorPayouts";
import PlatformDashboard from "./pages/admin/PlatformDashboard";
import AdminCompanies from "./pages/admin/AdminCompanies";
import AdminContractors from "./pages/admin/AdminContractors";
import AdminSubscriptionPlans from "./pages/admin/AdminSubscriptionPlans";
import AdminRevenue from "./pages/admin/AdminRevenue";
import AdminPromoCodes from "./pages/admin/AdminPromoCodes";
import AdminWebhookEvents from "./pages/AdminWebhookEvents";
import AdminAnnouncements from "./pages/admin/AdminAnnouncements";
import AdminMaintenanceMode from "./pages/admin/AdminMaintenanceMode";
import AdminFeatureFlags from "./pages/admin/AdminFeatureFlags";
import AdminSuspensions from "./pages/admin/AdminSuspensions";
import AdminAuditLog from "./pages/admin/AdminAuditLog";
import AdminCredits from "./pages/admin/AdminCredits";
import AdminPayoutHolds from "./pages/admin/AdminPayoutHolds";
import AdminActivityFeed from "./pages/admin/AdminActivityFeed";
import AdminLeaderboard from "./pages/admin/AdminLeaderboard";
import AdminChurnRisk from "./pages/admin/AdminChurnRisk";
import AdminEmailBlast from "./pages/admin/AdminEmailBlast";
import AdminJobFeeOverride from "./pages/admin/AdminJobFeeOverride";
import CompanyPropertyReports from "./pages/company/CompanyPropertyReports";
import CompanyAnalytics from "./pages/company/CompanyAnalytics";
import ResetPassword from "./pages/ResetPassword";
import ForgotPassword from "./pages/ForgotPassword";
import InviteAccept from "./pages/InviteAccept";
import TeamInviteAccept from "./pages/TeamInviteAccept";
import AdminLogin from "./pages/AdminLogin";
import { PWAInstallBanner } from "./components/PWAInstallBanner";
import { useAuth } from "./_core/hooks/useAuth";
import { useLocation } from "wouter";

/**
 * AdminGuard — redirects unauthenticated users or non-admins to /admin/login.
 */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  if (loading) return null;
  if (!user || user.role !== "admin") {
    setLocation("/admin/login");
    return null;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Home} />
      <Route path="/register" component={Register} />
      <Route path="/signup" component={SignUp} />
      <Route path="/signin" component={SignIn} />
      <Route path="/get-started" component={GetStarted} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/invite/:token" component={InviteAccept} />
      <Route path="/team-invite/:token" component={TeamInviteAccept} />
      <Route path="/admin/login" component={AdminLogin} />
      {/* Company Admin Routes */}
      <Route path="/company">
        <DashboardLayout><CompanyDashboard /></DashboardLayout>
      </Route>
      <Route path="/company/jobs">
        <DashboardLayout><CompanyJobs /></DashboardLayout>
      </Route>
      <Route path="/company/properties">
        <DashboardLayout><CompanyProperties /></DashboardLayout>
      </Route>
      <Route path="/company/contractors">
        <DashboardLayout><CompanyContractors /></DashboardLayout>
      </Route>
      <Route path="/company/verification">
        <DashboardLayout><CompanyVerification /></DashboardLayout>
      </Route>
      <Route path="/company/live-tracking">
        <DashboardLayout><LiveTracking /></DashboardLayout>
      </Route>
      <Route path="/company/settings">
        <DashboardLayout><CompanySettings /></DashboardLayout>
      </Route>
      <Route path="/company/reports">
        <DashboardLayout><CompanyExpenseReport /></DashboardLayout>
      </Route>
      <Route path="/company/property-reports">
        <DashboardLayout><CompanyPropertyReports /></DashboardLayout>
      </Route>
      <Route path="/company/analytics">
        <DashboardLayout><CompanyAnalytics /></DashboardLayout>
      </Route>
      <Route path="/company/billing">
        <DashboardLayout><CompanyBilling /></DashboardLayout>
      </Route>
      <Route path="/company/integrations">
        <DashboardLayout><CompanyIntegrations /></DashboardLayout>
      </Route>
      {/* Contractor Routes */}
      <Route path="/contractor">
        <DashboardLayout><ContractorDashboard /></DashboardLayout>
      </Route>
      <Route path="/contractor/jobs">
        <DashboardLayout><ContractorJobBoard /></DashboardLayout>
      </Route>
      <Route path="/contractor/my-jobs">
        <DashboardLayout><ContractorMyJobs /></DashboardLayout>
      </Route>
      <Route path="/contractor/profile">
        <DashboardLayout><ContractorProfile /></DashboardLayout>
      </Route>
      <Route path="/contractor/earnings">
        <DashboardLayout><ContractorEarnings /></DashboardLayout>
      </Route>
      <Route path="/contractor/payouts">
        <DashboardLayout><ContractorPayouts /></DashboardLayout>
      </Route>
      <Route path="/contractor/billing">
        <DashboardLayout><ContractorBilling /></DashboardLayout>
      </Route>
      {/* Platform Admin Routes — protected by AdminGuard */}
      <Route path="/admin/companies">
        <AdminGuard><DashboardLayout><AdminCompanies /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/contractors">
        <AdminGuard><DashboardLayout><AdminContractors /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/plans">
        <AdminGuard><DashboardLayout><AdminSubscriptionPlans /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/revenue">
        <AdminGuard><DashboardLayout><AdminRevenue /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/promo-codes">
        <AdminGuard><DashboardLayout><AdminPromoCodes /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/webhooks">
        <AdminGuard><DashboardLayout><AdminWebhookEvents /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/announcements">
        <AdminGuard><DashboardLayout><AdminAnnouncements /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/maintenance-mode">
        <AdminGuard><DashboardLayout><AdminMaintenanceMode /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/feature-flags">
        <AdminGuard><DashboardLayout><AdminFeatureFlags /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/suspensions">
        <AdminGuard><DashboardLayout><AdminSuspensions /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/audit-log">
        <AdminGuard><DashboardLayout><AdminAuditLog /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/credits">
        <AdminGuard><DashboardLayout><AdminCredits /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/payout-holds">
        <AdminGuard><DashboardLayout><AdminPayoutHolds /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/activity">
        <AdminGuard><DashboardLayout><AdminActivityFeed /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/leaderboard">
        <AdminGuard><DashboardLayout><AdminLeaderboard /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/churn-risk">
        <AdminGuard><DashboardLayout><AdminChurnRisk /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/email-blast">
        <AdminGuard><DashboardLayout><AdminEmailBlast /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin/job-fee-override">
        <AdminGuard><DashboardLayout><AdminJobFeeOverride /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/admin">
        <AdminGuard><DashboardLayout><PlatformDashboard /></DashboardLayout></AdminGuard>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <ViewAsProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
            <PWAInstallBanner />
          </TooltipProvider>
        </ViewAsProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
