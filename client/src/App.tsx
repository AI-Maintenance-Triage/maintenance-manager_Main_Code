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
import ContractorDashboard from "./pages/contractor/ContractorDashboard";
import ContractorJobBoard from "./pages/contractor/ContractorJobBoard";
import ContractorMyJobs from "./pages/contractor/ContractorMyJobs";
import ContractorProfile from "./pages/contractor/ContractorProfile";
import ContractorEarnings from "./pages/contractor/ContractorEarnings";
import ContractorBilling from "./pages/contractor/ContractorBilling";
import PlatformDashboard from "./pages/admin/PlatformDashboard";
import AdminCompanies from "./pages/admin/AdminCompanies";
import AdminSubscriptionPlans from "./pages/admin/AdminSubscriptionPlans";
import ResetPassword from "./pages/ResetPassword";
import { PWAInstallBanner } from "./components/PWAInstallBanner";

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
      <Route path="/company/billing">
        <DashboardLayout><CompanyBilling /></DashboardLayout>
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
      <Route path="/contractor/billing">
        <DashboardLayout><ContractorBilling /></DashboardLayout>
      </Route>
      {/* Platform Admin Routes */}
      <Route path="/admin/companies">
        <DashboardLayout><AdminCompanies /></DashboardLayout>
      </Route>
      <Route path="/admin/plans">
        <DashboardLayout><AdminSubscriptionPlans /></DashboardLayout>
      </Route>
      <Route path="/admin">
        <DashboardLayout><PlatformDashboard /></DashboardLayout>
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
