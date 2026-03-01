import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
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
import { Building2, HardHat, ClipboardList, DollarSign, Plus, Wrench, Pencil, Trash2, MapPin, Loader2, Settings, Clock, CreditCard, Check, X } from "lucide-react";

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

  // ─── Create Company Form ────────────────────────────────────────────
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");

  const createCompany = trpc.adminViewAs.createTestCompany.useMutation({
    onSuccess: () => {
      toast.success("Company created successfully!");
      setCompanyOpen(false);
      setCompanyName(""); setCompanyAddress(""); setCompanyPhone(""); setCompanyEmail("");
      utils.platform.stats.invalidate();
      utils.platform.companies.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Edit Company ───────────────────────────────────────────────────
  const [editCompanyOpen, setEditCompanyOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<any>(null);
  // Plan assignment state
  const [editCompanyPlanId, setEditCompanyPlanId] = useState<string>("none");
  const [editCompanyPriceOverride, setEditCompanyPriceOverride] = useState("");
  const [editCompanyPlanNotes, setEditCompanyPlanNotes] = useState("");

  const updateCompany = trpc.adminViewAs.updateCompany.useMutation({
    onSuccess: () => {
      toast.success("Company updated!");
      setEditCompanyOpen(false);
      utils.platform.companies.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const assignCompanyPlan = trpc.adminViewAs.assignCompanyPlan.useMutation({
    onSuccess: () => {
      utils.platform.companies.invalidate();
      utils.adminViewAs.companiesWithPlans.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCompany = trpc.adminViewAs.deleteCompany.useMutation({
    onSuccess: () => {
      toast.success("Company deleted");
      utils.platform.stats.invalidate();
      utils.platform.companies.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Create Contractor Form ─────────────────────────────────────────
  const [contractorOpen, setContractorOpen] = useState(false);
  const [contractorName, setContractorName] = useState("");
  const [contractorPhone, setContractorPhone] = useState("");
  const [contractorLicense, setContractorLicense] = useState("");
  const [contractorZips, setContractorZips] = useState("");
  const [contractorRadius, setContractorRadius] = useState("25");
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);

  const createContractor = trpc.adminViewAs.createTestContractor.useMutation({
    onSuccess: () => {
      toast.success("Contractor created successfully!");
      setContractorOpen(false);
      setContractorName(""); setContractorPhone(""); setContractorLicense("");
      setContractorZips(""); setContractorRadius("25"); setSelectedTrades([]);
      utils.platform.stats.invalidate();
      utils.adminViewAs.allContractors.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Edit Contractor ────────────────────────────────────────────────
  const [editContractorOpen, setEditContractorOpen] = useState(false);
  const [editContractor, setEditContractor] = useState<any>(null);
  const [editContractorTrades, setEditContractorTrades] = useState<string[]>([]);
  // Contractor plan assignment state
  const [editContractorPlanId, setEditContractorPlanId] = useState<string>("none");
  const [editContractorPriceOverride, setEditContractorPriceOverride] = useState("");
  const [editContractorPlanNotes, setEditContractorPlanNotes] = useState("");

  const { data: contractorPlans } = trpc.adminViewAs.listContractorPlans.useQuery();

  const assignContractorPlan = trpc.adminViewAs.assignContractorPlan.useMutation({
    onSuccess: () => { utils.adminViewAs.allContractors.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const updateContractor = trpc.adminViewAs.updateContractor.useMutation({
    onSuccess: () => {
      toast.success("Contractor updated!");
      setEditContractorOpen(false);
      utils.adminViewAs.allContractors.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteContractor = trpc.adminViewAs.deleteContractor.useMutation({
    onSuccess: () => {
      toast.success("Contractor deleted");
      utils.platform.stats.invalidate();
      utils.adminViewAs.allContractors.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleTrade = (trade: string) => {
    setSelectedTrades(prev => prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]);
  };

  const toggleEditTrade = (trade: string) => {
    setEditContractorTrades(prev => prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]);
  };

  // ─── Platform Fee Settings ─────────────────────────────────────────────
  const { data: platformSettings, isLoading: settingsLoading } = trpc.stripePayments.getPlatformSettings.useQuery();
  const [feePercent, setFeePercent] = useState("");
  const [perListingEnabled, setPerListingEnabled] = useState(false);
  const [perListingAmount, setPerListingAmount] = useState("");
  const [autoClockOutMinutes, setAutoClockOutMinutes] = useState("");
  const [autoClockOutRadius, setAutoClockOutRadius] = useState("");
  useEffect(() => {
    if (platformSettings) {
      setFeePercent(platformSettings.platformFeePercent ?? "5.00");
      setPerListingEnabled(platformSettings.perListingFeeEnabled ?? false);
      setPerListingAmount(platformSettings.perListingFeeAmount ?? "0.00");
      setAutoClockOutMinutes(String(platformSettings.autoClockOutMinutes ?? 15));
      setAutoClockOutRadius(String(platformSettings.autoClockOutRadiusMeters ?? 200));
    }
  }, [platformSettings]);
  const updateSettings = trpc.stripePayments.updatePlatformSettings.useMutation({
    onSuccess: () => {
      toast.success("Platform settings updated!");
      utils.stripePayments.getPlatformSettings.invalidate();
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

  const openEditCompany = (c: any) => {
    setEditCompany({ ...c });
    setEditCompanyPlanId(c.planId ? String(c.planId) : "none");
    setEditCompanyPriceOverride(c.planPriceOverride ? String(parseFloat(c.planPriceOverride)) : "");
    setEditCompanyPlanNotes(c.planNotes ?? "");
    setEditCompanyOpen(true);
  };

  const openEditContractor = (c: any) => {
    setEditContractor({ ...c.profile, userName: c.user.name, userEmail: c.user.email });
    setEditContractorTrades(c.profile.trades || []);
    setEditContractorPlanId(c.profile.planId ? String(c.profile.planId) : "none");
    setEditContractorPriceOverride(c.profile.planPriceOverride ? String(parseFloat(c.profile.planPriceOverride)) : "");
    setEditContractorPlanNotes(c.profile.planNotes ?? "");
    setEditContractorOpen(true);
  };

  const handleSaveCompany = async () => {
    if (!editCompany) return;
    // Save basic info
    await updateCompany.mutateAsync({
      id: editCompany.id,
      name: editCompany.name,
      address: editCompany.address || undefined,
      phone: editCompany.phone || undefined,
      email: editCompany.email || undefined,
    });
    // Save plan assignment
    await assignCompanyPlan.mutateAsync({
      companyId: editCompany.id,
      planId: editCompanyPlanId !== "none" ? parseInt(editCompanyPlanId) : null,
      planPriceOverride: editCompanyPriceOverride !== "" ? parseFloat(editCompanyPriceOverride) : null,
      planNotes: editCompanyPlanNotes || undefined,
    });
    toast.success("Company and plan saved!");
    setEditCompanyOpen(false);
    utils.platform.companies.invalidate();
    utils.adminViewAs.companiesWithPlans.invalidate();
  };

  // Find the currently selected plan object (company)
  const selectedPlan = plans?.find((p: any) => String(p.id) === editCompanyPlanId);

  const handleSaveContractor = async () => {
    if (!editContractor) return;
    // Save basic profile info
    await updateContractor.mutateAsync({
      id: editContractor.id,
      businessName: editContractor.businessName || undefined,
      phone: editContractor.phone || undefined,
      trades: editContractorTrades,
      serviceAreaZips: editContractor.serviceAreaZips || undefined,
      serviceRadiusMiles: editContractor.serviceRadiusMiles || undefined,
      licenseNumber: editContractor.licenseNumber || undefined,
    });
    // Save plan assignment
    await assignContractorPlan.mutateAsync({
      contractorProfileId: editContractor.id,
      planId: editContractorPlanId !== "none" ? parseInt(editContractorPlanId) : null,
      planPriceOverride: editContractorPriceOverride !== "" ? parseFloat(editContractorPriceOverride) : null,
      planNotes: editContractorPlanNotes || undefined,
    });
    toast.success("Contractor and plan saved!");
    setEditContractorOpen(false);
    utils.adminViewAs.allContractors.invalidate();
  };

  // Find the currently selected contractor plan object
  const selectedContractorPlan = contractorPlans?.find((p: any) => String(p.id) === editContractorPlanId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Platform Admin</h1>
          <p className="text-muted-foreground mt-1">Overview of the entire platform</p>
        </div>
        <div className="flex gap-2">
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
          {/* Create Company Dialog */}
          <Dialog open={companyOpen} onOpenChange={setCompanyOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                <Plus className="h-4 w-4" /> Add Company
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-card-foreground">Create Test Company</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-foreground">Company Name *</Label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Sunrise Property Management" className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Address</Label>
                  <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="123 Main St, City, ST 12345" className="bg-secondary border-border" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-foreground">Phone</Label>
                    <Input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} placeholder="(555) 123-4567" className="bg-secondary border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Email</Label>
                    <Input value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} placeholder="info@company.com" className="bg-secondary border-border" />
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!companyName.trim() || createCompany.isPending}
                  onClick={() => createCompany.mutate({ name: companyName, address: companyAddress || undefined, phone: companyPhone || undefined, email: companyEmail || undefined })}
                >
                  {createCompany.isPending ? "Creating..." : "Create Company"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Create Contractor Dialog */}
          <Dialog open={contractorOpen} onOpenChange={setContractorOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-green-500/30 text-green-400 hover:bg-green-500/10">
                <Plus className="h-4 w-4" /> Add Contractor
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-card-foreground">Create Test Contractor</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-foreground">Business Name / Full Name *</Label>
                  <Input value={contractorName} onChange={e => setContractorName(e.target.value)} placeholder="e.g. Mike's Plumbing or John Smith" className="bg-secondary border-border" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-foreground">Phone</Label>
                    <Input value={contractorPhone} onChange={e => setContractorPhone(e.target.value)} placeholder="(555) 987-6543" className="bg-secondary border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">License #</Label>
                    <Input value={contractorLicense} onChange={e => setContractorLicense(e.target.value)} placeholder="LIC-12345" className="bg-secondary border-border" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Trades *</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {TRADE_OPTIONS.map(trade => (
                      <div key={trade} className="flex items-center gap-2">
                        <Checkbox id={`trade-${trade}`} checked={selectedTrades.includes(trade)} onCheckedChange={() => toggleTrade(trade)} />
                        <label htmlFor={`trade-${trade}`} className="text-sm text-foreground cursor-pointer">{trade}</label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-foreground">Service Area Zips</Label>
                    <Input value={contractorZips} onChange={e => setContractorZips(e.target.value)} placeholder="10001, 10002, 10003" className="bg-secondary border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Service Radius (mi)</Label>
                    <Input type="number" value={contractorRadius} onChange={e => setContractorRadius(e.target.value)} className="bg-secondary border-border" />
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!contractorName.trim() || selectedTrades.length === 0 || createContractor.isPending}
                  onClick={() => createContractor.mutate({
                    businessName: contractorName,
                    phone: contractorPhone || undefined,
                    trades: selectedTrades,
                    serviceAreaZips: contractorZips ? contractorZips.split(",").map(z => z.trim()).filter(Boolean) : undefined,
                    serviceRadiusMiles: parseInt(contractorRadius) || 25,
                    licenseNumber: contractorLicense || undefined,
                  })}
                >
                  {createContractor.isPending ? "Creating..." : "Create Contractor"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Companies</CardTitle>
              <Building2 className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-card-foreground">{stats?.totalCompanies ?? 0}</div></CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Contractors</CardTitle>
              <HardHat className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-card-foreground">{stats?.totalContractors ?? 0}</div></CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Jobs (Paid)</CardTitle>
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
        </>
      )}

      {/* Companies List */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-card-foreground">Registered Companies</CardTitle>
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEditCompany(c)}>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEditContractor(c)}>
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
              <Button
                onClick={() => updateSettings.mutate({
                  platformFeePercent: parseFloat(feePercent) || 5,
                  perListingFeeEnabled: false,
                  perListingFeeAmount: 0,
                  autoClockOutMinutes: parseInt(autoClockOutMinutes) || 15,
                  autoClockOutRadiusMeters: parseInt(autoClockOutRadius) || 200,
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

      {/* Edit Company Dialog */}
      {editCompany && (
        <Dialog open={editCompanyOpen} onOpenChange={setEditCompanyOpen}>
          <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-card-foreground">Edit Company: {editCompany.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 pt-2">
              {/* Basic Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Basic Information</h3>
                <div className="space-y-2">
                  <Label className="text-foreground">Company Name *</Label>
                  <Input value={editCompany.name} onChange={e => setEditCompany({ ...editCompany, name: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Address</Label>
                  <Input value={editCompany.address || ""} onChange={e => setEditCompany({ ...editCompany, address: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-foreground">Phone</Label>
                    <Input value={editCompany.phone || ""} onChange={e => setEditCompany({ ...editCompany, phone: e.target.value })} className="bg-secondary border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Email</Label>
                    <Input value={editCompany.email || ""} onChange={e => setEditCompany({ ...editCompany, email: e.target.value })} className="bg-secondary border-border" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Plan Assignment */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" /> Subscription Plan
                </h3>

                <div className="space-y-2">
                  <Label className="text-foreground">Assigned Plan</Label>
                  <Select value={editCompanyPlanId} onValueChange={setEditCompanyPlanId}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="No plan assigned" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="none">No plan (unassigned)</SelectItem>
                      {(plans ?? []).map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name} — ${parseFloat(p.priceMonthly ?? "0").toFixed(0)}/mo
                          {!p.isActive ? " (inactive)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Show plan features when a plan is selected */}
                {selectedPlan && (
                  <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Plan Features</p>
                    <div className="grid grid-cols-2 gap-1">
                      {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                        const enabled = (selectedPlan.features as any)?.[key];
                        return (
                          <div key={key} className="flex items-center gap-1.5 text-xs">
                            {enabled ? (
                              <Check className="h-3 w-3 text-green-400 shrink-0" />
                            ) : (
                              <X className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                            )}
                            <span className={enabled ? "text-foreground" : "text-muted-foreground/60"}>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-foreground">
                    Custom Price Override ($/mo)
                    <span className="text-xs text-muted-foreground ml-2">— leave blank to use plan default</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">$</span>
                    <Input
                      type="number" min="0" step="0.01"
                      value={editCompanyPriceOverride}
                      onChange={e => setEditCompanyPriceOverride(e.target.value)}
                      placeholder={selectedPlan ? `${parseFloat(selectedPlan.priceMonthly ?? "0").toFixed(2)} (plan default)` : "0.00"}
                      className="bg-secondary border-border"
                    />
                    {editCompanyPriceOverride && (
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setEditCompanyPriceOverride("")}>
                        Clear
                      </Button>
                    )}
                  </div>
                  {editCompanyPriceOverride && selectedPlan && (
                    <p className="text-xs text-amber-400">
                      Custom price: ${parseFloat(editCompanyPriceOverride).toFixed(2)}/mo
                      (plan default: ${parseFloat(selectedPlan.priceMonthly ?? "0").toFixed(2)}/mo)
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">Internal Notes</Label>
                  <Input
                    value={editCompanyPlanNotes}
                    onChange={e => setEditCompanyPlanNotes(e.target.value)}
                    placeholder="e.g. Legacy customer, grandfathered rate"
                    className="bg-secondary border-border"
                  />
                </div>
              </div>

              <Button
                className="w-full"
                disabled={!editCompany.name?.trim() || updateCompany.isPending || assignCompanyPlan.isPending}
                onClick={handleSaveCompany}
              >
                {(updateCompany.isPending || assignCompanyPlan.isPending) ? "Saving..." : "Save All Changes"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Contractor Dialog */}
      {editContractor && (
        <Dialog open={editContractorOpen} onOpenChange={setEditContractorOpen}>
          <DialogContent className="bg-card border-border sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-card-foreground">Edit Contractor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Account: {editContractor.userEmail || editContractor.userName}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Business Name / Full Name</Label>
                <Input value={editContractor.businessName || ""} onChange={e => setEditContractor({ ...editContractor, businessName: e.target.value })} placeholder="Business name or first & last name" className="bg-secondary border-border" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-foreground">Phone</Label>
                  <Input value={editContractor.phone || ""} onChange={e => setEditContractor({ ...editContractor, phone: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">License #</Label>
                  <Input value={editContractor.licenseNumber || ""} onChange={e => setEditContractor({ ...editContractor, licenseNumber: e.target.value })} className="bg-secondary border-border" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Trades</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TRADE_OPTIONS.map(trade => (
                    <div key={trade} className="flex items-center gap-2">
                      <Checkbox id={`edit-trade-${trade}`} checked={editContractorTrades.includes(trade)} onCheckedChange={() => toggleEditTrade(trade)} />
                      <label htmlFor={`edit-trade-${trade}`} className="text-sm text-foreground cursor-pointer">{trade}</label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-foreground">Service Area Zips</Label>
                  <Input
                    value={Array.isArray(editContractor.serviceAreaZips) ? editContractor.serviceAreaZips.join(", ") : ""}
                    onChange={e => setEditContractor({ ...editContractor, serviceAreaZips: e.target.value.split(",").map((z: string) => z.trim()).filter(Boolean) })}
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Service Radius (mi)</Label>
                  <Input type="number" value={editContractor.serviceRadiusMiles || 25} onChange={e => setEditContractor({ ...editContractor, serviceRadiusMiles: parseInt(e.target.value) || 25 })} className="bg-secondary border-border" />
                </div>
              </div>

              <Separator />

              {/* Contractor Plan Assignment */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" /> Contractor Plan
                </h3>

                {/* Plan selector */}
                <div className="space-y-2">
                  <Label className="text-foreground">Assigned Plan</Label>
                  <Select value={editContractorPlanId} onValueChange={setEditContractorPlanId}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="No plan assigned" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="none">No plan assigned</SelectItem>
                      {(contractorPlans ?? []).map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name} — ${parseFloat(p.priceMonthly ?? "0").toFixed(0)}/mo
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!contractorPlans?.length && (
                    <p className="text-xs text-muted-foreground">
                      No contractor plans exist yet. Create them in the{" "}
                      <a href="/admin/plans" className="text-primary underline">Plans page</a>.
                    </p>
                  )}
                </div>

                {/* Feature preview */}
                {selectedContractorPlan && (
                  <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Included features</p>
                    <div className="grid grid-cols-2 gap-1">
                      {Object.entries(selectedContractorPlan.features ?? {}).filter(([k]) =>
                        !["maxActiveJobs", "maxCompanies"].includes(k)
                      ).map(([key, val]) => (
                        <div key={key} className="flex items-center gap-1.5 text-xs">
                          {val ? <Check className="h-3 w-3 text-green-400" /> : <X className="h-3 w-3 text-muted-foreground/40" />}
                          <span className={val ? "text-foreground" : "text-muted-foreground/60"}>
                            {key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}
                          </span>
                        </div>
                      ))}
                    </div>
                    {((selectedContractorPlan.features as any)?.maxActiveJobs != null || (selectedContractorPlan.features as any)?.maxCompanies != null) && (
                      <div className="flex gap-3 text-xs text-muted-foreground pt-1 border-t border-border">
                        {(selectedContractorPlan.features as any)?.maxActiveJobs != null && (
                          <span>Max {(selectedContractorPlan.features as any).maxActiveJobs} active jobs</span>
                        )}
                        {(selectedContractorPlan.features as any)?.maxCompanies != null && (
                          <span>Max {(selectedContractorPlan.features as any).maxCompanies} companies</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Price override */}
                {editContractorPlanId !== "none" && (
                  <div className="space-y-2">
                    <Label className="text-foreground text-sm">
                      Custom Price Override
                      <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-sm">$</span>
                      <Input
                        type="number" min="0" step="0.01"
                        value={editContractorPriceOverride}
                        onChange={e => setEditContractorPriceOverride(e.target.value)}
                        placeholder={selectedContractorPlan ? `Default: $${parseFloat(selectedContractorPlan.priceMonthly ?? "0").toFixed(2)}/mo` : ""}
                        className="bg-secondary border-border"
                      />
                      <span className="text-muted-foreground text-sm">/mo</span>
                      {editContractorPriceOverride !== "" && (
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-8 px-2"
                          onClick={() => setEditContractorPriceOverride("")}>Clear</Button>
                      )}
                    </div>
                    {editContractorPriceOverride !== "" && selectedContractorPlan && (
                      <p className="text-xs text-amber-400">
                        Override: ${parseFloat(editContractorPriceOverride).toFixed(2)}/mo
                        (plan default: ${parseFloat(selectedContractorPlan.priceMonthly ?? "0").toFixed(2)}/mo)
                      </p>
                    )}
                  </div>
                )}

                {/* Internal notes */}
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Internal Notes</Label>
                  <Input
                    value={editContractorPlanNotes}
                    onChange={e => setEditContractorPlanNotes(e.target.value)}
                    placeholder="e.g. Early adopter, grandfathered rate"
                    className="bg-secondary border-border"
                  />
                </div>
              </div>

              <Button
                className="w-full"
                disabled={updateContractor.isPending || assignContractorPlan.isPending}
                onClick={handleSaveContractor}
              >
                {(updateContractor.isPending || assignContractorPlan.isPending) ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
