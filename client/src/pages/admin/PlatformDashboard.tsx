import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Building2, HardHat, ClipboardList, DollarSign, Plus, Wrench } from "lucide-react";

const TRADE_OPTIONS = [
  "General Handyman", "Plumbing", "Electrical", "HVAC",
  "Carpentry", "Painting", "Roofing", "Appliance Repair",
  "Locksmith", "Landscaping", "Pest Control", "Cleaning",
];

export default function PlatformDashboard() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.platform.stats.useQuery();
  const { data: companies, isLoading: companiesLoading } = trpc.platform.companies.useQuery();
  const { data: contractors, isLoading: contractorsLoading } = trpc.adminViewAs.allContractors.useQuery();

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
      utils.company.listAll.invalidate();
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

  // ─── Link Contractor to Company ─────────────────────────────────────
  const linkContractor = trpc.adminViewAs.linkContractorToCompany.useMutation({
    onSuccess: () => {
      toast.success("Contractor linked to company!");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleTrade = (trade: string) => {
    setSelectedTrades(prev => prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Platform Admin</h1>
          <p className="text-muted-foreground mt-1">Overview of the entire platform</p>
        </div>
        <div className="flex gap-2">
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
                  <Label className="text-foreground">Business Name *</Label>
                  <Input value={contractorName} onChange={e => setContractorName(e.target.value)} placeholder="e.g. Mike's Plumbing" className="bg-secondary border-border" />
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
                        <Checkbox
                          id={`trade-${trade}`}
                          checked={selectedTrades.includes(trade)}
                          onCheckedChange={() => toggleTrade(trade)}
                        />
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Jobs</CardTitle>
              <ClipboardList className="h-4 w-4 text-yellow-400" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-card-foreground">{stats?.totalJobs ?? 0}</div></CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-card-foreground">${stats?.totalRevenue ?? "0"}</div></CardContent>
          </Card>
        </div>
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
              <p className="text-sm text-muted-foreground">No companies yet. Click "Add Company" above to create one for testing.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {companies.map((c: any) => (
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
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">
                    {c.subscriptionStatus || "trialing"}
                  </Badge>
                </div>
              ))}
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
              <p className="text-sm text-muted-foreground">No contractors yet. Click "Add Contractor" above to create one for testing.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {contractors.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <Wrench className="h-4 w-4 text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{c.businessName || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">
                        ID: {c.id} •
                        {c.trades && Array.isArray(c.trades) ? ` ${(c.trades as string[]).join(", ")}` : " No trades listed"}
                        {c.phone ? ` • ${c.phone}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Link to company dropdown */}
                    {companies && companies.length > 0 && (
                      <select
                        className="text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            linkContractor.mutate({ contractorProfileId: c.id, companyId: parseInt(e.target.value) });
                            e.target.value = "";
                          }
                        }}
                      >
                        <option value="">Link to company...</option>
                        {companies.map((co: any) => (
                          <option key={co.id} value={co.id}>{co.name}</option>
                        ))}
                      </select>
                    )}
                    <Badge variant={c.isAvailable ? "default" : "secondary"} className={c.isAvailable ? "bg-green-600/20 text-green-400 border-green-600/30 text-xs" : "text-xs"}>
                      {c.isAvailable ? "Available" : "Unavailable"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
