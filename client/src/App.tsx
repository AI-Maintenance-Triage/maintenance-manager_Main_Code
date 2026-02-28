import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import DashboardLayout from "./components/DashboardLayout";
import CompanyDashboard from "./pages/company/CompanyDashboard";
import CompanyJobs from "./pages/company/CompanyJobs";
import CompanyProperties from "./pages/company/CompanyProperties";
import CompanyContractors from "./pages/company/CompanyContractors";
import CompanySettings from "./pages/company/CompanySettings";
import ContractorDashboard from "./pages/contractor/ContractorDashboard";
import ContractorJobBoard from "./pages/contractor/ContractorJobBoard";
import ContractorMyJobs from "./pages/contractor/ContractorMyJobs";
import ContractorProfile from "./pages/contractor/ContractorProfile";
import PlatformDashboard from "./pages/admin/PlatformDashboard";
import Onboarding from "./pages/Onboarding";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/onboarding" component={Onboarding} />
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
      <Route path="/company/settings">
        <DashboardLayout><CompanySettings /></DashboardLayout>
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
      {/* Platform Admin Routes */}
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
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
