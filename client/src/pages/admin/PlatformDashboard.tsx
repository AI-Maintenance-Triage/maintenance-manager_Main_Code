import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { CreateCompanyDialog, ManageCompanyDialog } from "@/components/admin/AdminCompanyDialogs";
import { CreateContractorDialog, ManageContractorDialog } from "@/components/admin/AdminContractorDialogs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Building2, HardHat, ClipboardList, DollarSign, Plus, Wrench, Pencil, Trash2, MapPin, Loader2, Settings, Clock, CreditCard, Check, X, RefreshCw, KeyRound, Eye, EyeOff } from "lucide-react";

const TRADE_OPTIONS = [
  "General Handyman", "Plumbing", "Electrical", "HVAC",
  "Carpentry", "Painting", "Roofing", "Appliance Repair",
  "Locksmith", "Landscaping", "Pest Control", "Cleaning",
  "Flooring", "Drywall", "Concrete", "Welding",
];

const FEATURE_LABELS: Record<string, string> = {
  gpsTimeTracking: "GPS Time Tracking",
  aiJobClassification: "AI Job Classification",
  expenseReports: "Expense Reports",
  contractorRatings: "Contractor Ratings",
  jobComments: "Job Comments",
  emailNotifications: "Email Notifications",
  billingHistory: "Billing History",
  apiAccess: "API Access",
  customBranding: "Custom Branding",
  prioritySupport: "Priority Support",
};

export default function PlatformDashboard() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.platform.stats.useQuery();
  const { data: companies, isLoading: companiesLoading } = trpc.platform.companies.useQuery();
  const { data: contractors, isLoading: contractorsLoading } = trpc.adminViewAs.allContractors.useQuery();
  const { data: plans } = trpc.adminViewAs.listPlans.useQuery();
  const { data: planDistribution } = trpc.adminViewAs.getPlanDistribution.useQuery();
  const { data: onboardingAnalytics } = trpc.platform.onboardingAnalytics.useQuery();

  // ─── Create Company ─────────────────────────────────────────────────
  const [companyOpen, setCompanyOpen] = useState(false);

  // ─── Edit Company ───────────────────────────────────────────────────
  const [managingCompany, setManagingCompany] = useState<any>(null);

  const deleteCompany = trpc.adminViewAs.deleteCompany.useMutation({
    onSuccess: () => {
      toast.success("Company deleted");
      utils.platform.stats.invalidate();
      utils.platform.companies.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Create Contractor ──────────────────────────────────────────────
  const [contractorOpen, setContractorOpen] = useState(false);

  // ─── Edit Contractor ────────────────────────────────────────────────
  const [managingContractor, setManagingContractor] = useState<any>(null);

  const deleteContractor = trpc.adminViewAs.deleteContractor.useMutation({
    onSuccess: () => {
      toast.success("Contractor deleted");
      utils.platform.stats.invalidate();
      utils.adminViewAs.allContractors.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Platform Fee Settings ─────────────────────────────────────────────
  const { data: platformSettings, isLoading: settingsLoading } = trpc.stripePayments.getPlatformSettings.useQuery();
  const [feePercent, setFeePercent] = useState("");
  const [perListingEnabled, setPerListingEnabled] = useState(false);
  const [perListingAmount, setPerListingAmount] = useState("");
  const [autoClockOutMinutes, setAutoClockOutMinutes] = useState("");
  const [autoClockOutRadius, setAutoClockOutRadius] = useState("");
  const [pmsSyncIntervalHours, setPmsSyncIntervalHours] = useState("24");
  useEffect(() => {
    if (platformSettings) {
      setFeePercent(platformSettings.platformFeePercent ?? "5.00");
      setPerListingEnabled(platformSettings.perListingFeeEnabled ?? false);
      setPerListingAmount(platformSettings.perListingFeeAmount ?? "0.00");
      setAutoClockOutMinutes(String(platformSettings.autoClockOutMinutes ?? 15));
      setAutoClockOutRadius(String(platformSettings.autoClockOutRadiusMeters ?? 200));
      setPmsSyncIntervalHours(String((platformSettings as any).pmsSyncIntervalHours ?? 24));
    }
  }, [platformSettings]);
  const updateSettings = trpc.stripePayments.updatePlatformSettings.useMutation({
    onSuccess: () => {
      toast.success("Platform settings updated!");
      utils.stripePayments.getPlatformSettings.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Set Admin Password ─────────────────────────────────────────────
  const [adminPwOpen, setAdminPwOpen] = useState(false);
  const [adminNewPw, setAdminNewPw] = useState("");
  const [adminConfirmPw, setAdminConfirmPw] = useState("");
  const [showAdminPw, setShowAdminPw] = useState(false);
  const setAdminPassword = trpc.auth.setAdminPassword.useMutation({
    onSuccess: () => {
      toast.success("Admin password set! You can now log in at /admin/login");
      setAdminPwOpen(false);
      setAdminNewPw("");
      setAdminConfirmPw("");
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkReGeocode = trpc.admin.bulkReGeocode.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Re-geocoded: ${result.properties.ok} properties, ${result.contractors.ok} contractors. ` +
        (result.properties.fail + result.contractors.fail > 0
          ? `${result.properties.fail + result.contractors.fail} failed (check server logs).`
          : "All successful!")
      );
    },
    onError: (err) => toast.error(err.message),
  });

  // Normalize nested contractor for shared dialog
  const toFlatContractor = (c: any) => ({
    id: c.profile.id,
    userId: c.user.id,
    userName: c.user.name,
    userEmail: c.user.email,
    email: c.user.email,
    businessName: c.profile.businessName,
    phone: c.profile.phone,
    licenseNumber: c.profile.licenseNumber,
    trades: c.profile.trades,
    serviceAreaZips: c.profile.serviceAreaZips,
    serviceRadiusMiles: c.profile.serviceRadiusMiles,
    planId: c.profile.planId,
    planPriceOverride: c.profile.planPriceOverride,
    planNotes: c.profile.planNotes,
    address: c.profile.address,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Platform Admin</h1>
          <p className="text-muted-foreground mt-1">Overview of the entire platform</p>
        </div>
        <div className="flex gap-2">
          {/* Set Admin Password Dialog */}
          <Dialog open={adminPwOpen} onOpenChange={setAdminPwOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                <KeyRound className="h-4 w-4" /> Set Admin Password
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-card-foreground flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-amber-400" /> Set Admin Login Password
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Set a password for your admin account so you can log in at{" "}
                <span className="font-mono text-primary">/admin/login</span>{" "}
                without needing Manus OAuth.
              </p>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>New Password (min 8 characters)</Label>
                  <div className="relative">
                    <Input
                      type={showAdminPw ? "text" : "password"}
                      value={adminNewPw}
                      onChange={e => setAdminNewPw(e.target.value)}
                      placeholder="Enter new password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPw(!showAdminPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showAdminPw ? "Hide password" : "Show password"}
                    >
                      {showAdminPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input
                    type={showAdminPw ? "text" : "password"}
                    value={adminConfirmPw}
                    onChange={e => setAdminConfirmPw(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={
                    !adminNewPw ||
                    adminNewPw.length < 8 ||
                    adminNewPw !== adminConfirmPw ||
                    setAdminPassword.isPending
                  }
                  onClick={() => setAdminPassword.mutate({ newPassword: adminNewPw })}
                >
                  {setAdminPassword.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Setting...</>
                  ) : (
                    <><KeyRound className="h-4 w-4" /> Set Password</>
                  )}
                </Button>
                {adminNewPw && adminConfirmPw && adminNewPw !== adminConfirmPw && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Bulk Re-Geocode Button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => bulkReGeocode.mutate()}
            disabled={bulkReGeocode.isPending}
            title="Fix missing coordinates for all properties and contractors"
          >
            {bulkReGeocode.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            {bulkReGeocode.isPending ? "Geocoding..." : "Fix Locations"}
          </Button>
          <Button variant="outline" className="gap-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10" onClick={() => setCompanyOpen(true)}>
                <Plus className="h-4 w-4" /> Add Company
              </Button>
          <Button variant="outline" className="gap-2 border-green-500/30 text-green-400 hover:bg-green-500/10" onClick={() => setContractorOpen(true)}>
                <Plus className="h-4 w-4" /> Add Contractor
              </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Companies</CardTitle>
              <Building2 className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-card-foreground">{stats?.totalCompanies ?? 0}</div></CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Contractors</CardTitle>
              <HardHat className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-card-foreground">{stats?.totalContractors ?? 0}</div></CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Jobs</CardTitle>
              <ClipboardList className="h-4 w-4 text-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-card-foreground">{stats?.totalJobs ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats?.paidJobs ?? 0} paid / verified</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Platform Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-card-foreground">${parseFloat(stats?.totalRevenue ?? "0").toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Gross billed: ${parseFloat(stats?.totalGross ?? "0").toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Onboarding Analytics */}
        {onboardingAnalytics && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-card-foreground">Onboarding Completion (Last 7 Days)</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">% of new users who completed all onboarding steps within 7 days of joining</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Contractors</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-card-foreground">{onboardingAnalytics.contractors.completionRate7Days}%</span>
                    <span className="text-xs text-muted-foreground">{onboardingAnalytics.contractors.completedIn7Days}/{onboardingAnalytics.contractors.newIn7Days} new</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${onboardingAnalytics.contractors.completionRate7Days}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">All-time: {onboardingAnalytics.contractors.allTimeCompletionRate}% ({onboardingAnalytics.contractors.totalCompleted}/{onboardingAnalytics.contractors.totalContractors})</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Companies</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-card-foreground">{onboardingAnalytics.companies.completionRate7Days}%</span>
                    <span className="text-xs text-muted-foreground">{onboardingAnalytics.companies.newIn7Days} new this week</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${onboardingAnalytics.companies.completionRate7Days}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">Company onboarding tracking coming soon</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly Revenue Trend */}
        {stats?.monthlyRevenue && stats.monthlyRevenue.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-card-foreground">Monthly Revenue (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-24">
                {stats.monthlyRevenue.map((m: any) => {
                  const maxGross = Math.max(...stats.monthlyRevenue.map((x: any) => parseFloat(x.gross ?? "0")), 1);
                  const height = Math.max((parseFloat(m.gross ?? "0") / maxGross) * 100, 4);
                  return (
                    <div key={m.month} className="flex flex-col items-center gap-1 flex-1">
                      <p className="text-xs text-muted-foreground">${parseFloat(m.gross ?? "0").toFixed(0)}</p>
                      <div
                        className="w-full rounded-t bg-primary/60 hover:bg-primary transition-colors"
                        style={{ height: `${height}%` }}
                        title={`${m.month}: $${parseFloat(m.gross ?? "0").toFixed(2)} gross, $${parseFloat(m.revenue ?? "0").toFixed(2)} platform fee`}
                      />
                      <p className="text-xs text-muted-foreground">{m.month?.slice(5)}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
        {/* Plan Distribution Card */}
        {planDistribution && (() => {
          const s = planDistribution.summary;
          // Aggregate company stats by plan name (active plans only)
          const companyByPlan = planDistribution.companyStats
            .filter((r: any) => r.planName)
            .reduce((acc: Record<string, number>, r: any) => {
              acc[r.planName] = (acc[r.planName] ?? 0) + Number(r.count);
              return acc;
            }, {});
          const contractorByPlan = planDistribution.contractorStats
            .filter((r: any) => r.planName)
            .reduce((acc: Record<string, number>, r: any) => {
              acc[r.planName] = (acc[r.planName] ?? 0) + Number(r.count);
              return acc;
            }, {});
          const companyNoPlan = planDistribution.companyStats
            .filter((r: any) => !r.planName)
            .reduce((sum: number, r: any) => sum + Number(r.count), 0);
          const contractorNoPlan = planDistribution.contractorStats
            .filter((r: any) => !r.planName)
            .reduce((sum: number, r: any) => sum + Number(r.count), 0);
          return (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-card-foreground">Plan Distribution</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Active subscriptions across all companies and contractors</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  {/* Company Plans */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Companies</p>
                    <div className="space-y-2">
                      {Object.keys(companyByPlan).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No plans assigned yet</p>
                      ) : (
                        Object.entries(companyByPlan).map(([planName, cnt]) => (
                          <div key={planName} className="flex items-center gap-2">
                            <div className="flex-1">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-foreground font-medium">{planName}</span>
                                <span className="text-muted-foreground">{cnt as number}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary/70"
                                  style={{ width: `${Math.max(((cnt as number) / Math.max(s.totalCompanies, 1)) * 100, 4)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      <div className="pt-2 border-t border-border/50 flex justify-between text-xs">
                        <span className="text-muted-foreground">Trialing</span>
                        <span className="text-yellow-400 font-medium">{s.companiesTrialing}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Expired / Canceled</span>
                        <span className="text-red-400 font-medium">{s.companiesExpired}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">No Plan</span>
                        <span className="text-muted-foreground font-medium">{companyNoPlan}</span>
                      </div>
                    </div>
                  </div>

                  {/* Contractor Plans */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contractors</p>
                    <div className="space-y-2">
                      {Object.keys(contractorByPlan).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No plans assigned yet</p>
                      ) : (
                        Object.entries(contractorByPlan).map(([planName, cnt]) => (
                          <div key={planName} className="flex items-center gap-2">
                            <div className="flex-1">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-foreground font-medium">{planName}</span>
                                <span className="text-muted-foreground">{cnt as number}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary/70"
                                  style={{ width: `${Math.max(((cnt as number) / Math.max(s.totalContractors, 1)) * 100, 4)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      <div className="pt-2 border-t border-border/50 flex justify-between text-xs">
                        <span className="text-muted-foreground">Trialing</span>
                        <span className="text-yellow-400 font-medium">{s.contractorsTrialing}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Expired / Canceled</span>
                        <span className="text-red-400 font-medium">{s.contractorsExpired}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">No Plan</span>
                        <span className="text-muted-foreground font-medium">{contractorNoPlan}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}
        </>
      )}

      {/* Companies List */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-card-foreground">Recent Registrations</CardTitle>
          <Badge variant="secondary" className="text-xs">{companies?.length ?? 0} total</Badge>
        </CardHeader>
        <CardContent>
          {companiesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !companies || companies.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No companies registered yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {companies.map((c: any) => {
                const companyPlan = plans?.find((p: any) => p.id === c.planId);
                return (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {c.id} • Created {new Date(c.createdAt).toLocaleDateString()}
                          {c.phone ? ` • ${c.phone}` : ""}
                          {c.email ? ` • ${c.email}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {companyPlan ? (
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs gap-1">
                          <CreditCard className="h-3 w-3" />
                          {companyPlan.name}
                          {c.planPriceOverride && (
                            <span className="text-primary/70">*</span>
                          )}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs text-muted-foreground">No Plan</Badge>
                      )}
                      <Badge variant="secondary" className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">
                        {c.subscriptionStatus || "trialing"}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setManagingCompany(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-card border-border">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-card-foreground">Delete Company</AlertDialogTitle>
                            <AlertDialogDescription>Are you sure you want to delete "{c.name}"? This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteCompany.mutate({ id: c.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contractors List */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-card-foreground">Registered Contractors</CardTitle>
          <Badge variant="secondary" className="text-xs">{contractors?.length ?? 0} total</Badge>
        </CardHeader>
        <CardContent>
          {contractorsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !contractors || contractors.length === 0 ? (
            <div className="text-center py-8">
              <HardHat className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No contractors registered yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {contractors.map((c: any) => (
                <div key={c.profile.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <HardHat className="h-4 w-4 text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{c.profile.businessName || c.user.name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">
                        ID: {c.profile.id} • {c.user.email || "No email"}
                        {c.profile.trades?.length ? ` • ${c.profile.trades.slice(0, 2).join(", ")}${c.profile.trades.length > 2 ? "..." : ""}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={`text-xs ${c.profile.isAvailable ? "bg-green-600/20 text-green-400 border-green-600/30" : "bg-secondary text-muted-foreground"}`}>
                      {c.profile.isAvailable ? "Available" : "Unavailable"}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setManagingContractor(toFlatContractor(c))}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-card-foreground">Delete Contractor</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to delete "{c.profile.businessName || c.user.name}"? This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteContractor.mutate({ id: c.profile.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Settings — fees are now per-plan */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" /> Platform Settings
          </CardTitle>
          <CardDescription>
            Auto clock-out and GPS settings. Platform fees and per-listing fees are now configured
            per subscription plan — go to <strong>Plans</strong> in the sidebar to set them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-6">
              {/* Global fallback fee — shown as read-only reference */}
              <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-1">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Global Fallback Fee</span>
                  <span className="text-xs text-muted-foreground">(used when a company has no plan assigned)</span>
                </div>
                <div className="flex items-center gap-3 pl-6">
                  <div className="flex-1 space-y-1">
                    <Label className="text-sm text-muted-foreground">Platform Fee %</Label>
                    <p className="text-xs text-muted-foreground">Charged ON TOP of job cost. Contractor receives full job cost.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0" max="100" step="0.1" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} className="w-24 bg-secondary border-border" />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <h3 className="font-medium text-foreground">Auto Clock-Out</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">Timeout (minutes)</Label>
                    <p className="text-xs text-muted-foreground">After returning to origin</p>
                    <Input type="number" min="1" max="120" value={autoClockOutMinutes} onChange={(e) => setAutoClockOutMinutes(e.target.value)} className="bg-secondary border-border" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">Origin Radius (meters)</Label>
                    <p className="text-xs text-muted-foreground">Distance to trigger check</p>
                    <Input type="number" min="50" max="1000" value={autoClockOutRadius} onChange={(e) => setAutoClockOutRadius(e.target.value)} className="bg-secondary border-border" />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  <h3 className="font-medium text-foreground">PMS Auto-Sync Interval</h3>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Hours between syncs (0 = disabled)</Label>
                  <p className="text-xs text-muted-foreground">How often the platform automatically syncs properties and maintenance requests from all connected PMS integrations.</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="168"
                      value={pmsSyncIntervalHours}
                      onChange={(e) => setPmsSyncIntervalHours(e.target.value)}
                      className="w-24 bg-secondary border-border"
                    />
                    <span className="text-muted-foreground text-sm">
                      {parseInt(pmsSyncIntervalHours) === 0 ? "(disabled)" :
                       parseInt(pmsSyncIntervalHours) === 1 ? "hour" :
                       `hours`}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => updateSettings.mutate({
                  platformFeePercent: parseFloat(feePercent) || 5,
                  perListingFeeEnabled: false,
                  perListingFeeAmount: 0,
                  autoClockOutMinutes: parseInt(autoClockOutMinutes) || 15,
                  autoClockOutRadiusMeters: parseInt(autoClockOutRadius) || 200,
                  pmsSyncIntervalHours: parseInt(pmsSyncIntervalHours) || 24,
                })}
                disabled={updateSettings.isPending}
                className="w-full"
              >
                {updateSettings.isPending ? "Saving..." : "Save Platform Settings"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shared Create/Manage Dialogs */}
      <CreateCompanyDialog
        open={companyOpen}
        onOpenChange={setCompanyOpen}
        onCreated={() => {
          setCompanyOpen(false);
          utils.platform.stats.invalidate();
          utils.platform.companies.invalidate();
        }}
      />
      <CreateContractorDialog
        open={contractorOpen}
        onOpenChange={setContractorOpen}
        onCreated={() => {
          setContractorOpen(false);
          utils.platform.stats.invalidate();
          utils.adminViewAs.allContractors.invalidate();
        }}
      />
      {managingCompany && (
        <ManageCompanyDialog
          company={managingCompany}
          open={!!managingCompany}
          onOpenChange={(v) => { if (!v) setManagingCompany(null); }}
          onSaved={() => {
            setManagingCompany(null);
            utils.platform.companies.invalidate();
            utils.adminViewAs.companiesWithPlans.invalidate();
          }}
        />
      )}
      {managingContractor && (
        <ManageContractorDialog
          contractor={managingContractor}
          open={!!managingContractor}
          onOpenChange={(v) => { if (!v) setManagingContractor(null); }}
          onSaved={() => {
            setManagingContractor(null);
            utils.adminViewAs.allContractors.invalidate();
          }}
        />
      )}
    </div>
  );
}
