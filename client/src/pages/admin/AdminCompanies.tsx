import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Building2, Calendar, Settings, Percent, Receipt, X, AlertCircle, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import AddressAutocomplete, { type AddressResult } from "@/components/AddressAutocomplete";

interface FeeOverrideDialogProps {
  company: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function FeeOverrideDialog({ company, open, onOpenChange, onSaved }: FeeOverrideDialogProps) {
  const utils = trpc.useUtils();

  // Load company + effective plan
  const { data, isLoading } = trpc.platform.getCompany.useQuery(
    { companyId: company.id },
    { enabled: open }
  );

  const [feePercent, setFeePercent] = useState<string>("");
  const [perListingEnabled, setPerListingEnabled] = useState<boolean>(false);
  const [perListingAmount, setPerListingAmount] = useState<string>("");
  const [hasOverride, setHasOverride] = useState(false);

  // Populate form when data loads
  const [initialized, setInitialized] = useState(false);
  if (data && !initialized) {
    const c = data.company as any;
    setHasOverride(
      c.feeOverridePercent != null ||
      c.feeOverridePerListingEnabled != null ||
      c.feeOverridePerListingAmount != null
    );
    setFeePercent(c.feeOverridePercent != null ? String(parseFloat(c.feeOverridePercent)) : "");
    setPerListingEnabled(c.feeOverridePerListingEnabled ?? false);
    setPerListingAmount(c.feeOverridePerListingAmount != null ? String(parseFloat(c.feeOverridePerListingAmount)) : "");
    setInitialized(true);
  }

  const setOverride = trpc.platform.setCompanyFeeOverride.useMutation({
    onSuccess: () => {
      toast.success("Fee override saved");
      utils.platform.companies.invalidate();
      utils.platform.getCompany.invalidate({ companyId: company.id });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSave = () => {
    setOverride.mutate({
      companyId: company.id,
      feeOverridePercent: feePercent !== "" ? parseFloat(feePercent) : null,
      feeOverridePerListingEnabled: hasOverride ? perListingEnabled : null,
      feeOverridePerListingAmount: perListingAmount !== "" ? parseFloat(perListingAmount) : null,
    });
  };

  const handleClearOverride = () => {
    setOverride.mutate({
      companyId: company.id,
      feeOverridePercent: null,
      feeOverridePerListingEnabled: null,
      feeOverridePerListingAmount: null,
    });
    setFeePercent("");
    setPerListingEnabled(false);
    setPerListingAmount("");
    setHasOverride(false);
  };

  const planFeePercent = data?.plan ? parseFloat(String(data.plan.platformFeePercent ?? "0")) : null;
  const planListingEnabled = data?.plan?.perListingFeeEnabled ?? false;
  const planListingAmount = data?.plan ? parseFloat(String(data.plan.perListingFeeAmount ?? "0")) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setInitialized(false); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Manage: {company.name}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Plan info */}
            <div className="rounded-lg bg-muted/40 border border-border p-3 text-sm space-y-1">
              <p className="font-medium text-foreground">
                Current Plan: <span className="text-primary">{data?.plan?.name ?? "No plan assigned"}</span>
              </p>
              {data?.plan && (
                <p className="text-muted-foreground text-xs">
                  Plan defaults: {planFeePercent}% service charge
                  {planListingEnabled ? ` + $${planListingAmount?.toFixed(2)} per listing` : " · No listing fee"}
                </p>
              )}
            </div>

            <Separator />

            {/* Fee Override Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Custom Fee Override</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Override this company's fees independent of their plan tier. Leave blank to use plan defaults.
                  </p>
                </div>
                {hasOverride && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-destructive hover:text-destructive gap-1"
                    onClick={handleClearOverride}
                    disabled={setOverride.isPending}
                  >
                    <X className="h-3 w-3" /> Clear Override
                  </Button>
                )}
              </div>

              {/* Platform Fee % Override */}
              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-purple-400" />
                  Platform Service Charge (%)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder={planFeePercent != null ? `Plan default: ${planFeePercent}%` : "e.g. 5.0"}
                  value={feePercent}
                  onChange={(e) => { setFeePercent(e.target.value); setHasOverride(true); }}
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">
                  Charged as a % on top of the job cost (labor + parts). Leave blank to use plan default.
                </p>
              </div>

              {/* Per-Listing Fee Override */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 text-orange-400" />
                    Enable Per-Listing Fee Override
                  </Label>
                  <Switch
                    checked={perListingEnabled}
                    onCheckedChange={(v) => { setPerListingEnabled(v); setHasOverride(true); }}
                  />
                </div>
                {perListingEnabled && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Per-Listing Fee Amount ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={planListingAmount != null ? `Plan default: $${planListingAmount.toFixed(2)}` : "e.g. 2.50"}
                      value={perListingAmount}
                      onChange={(e) => setPerListingAmount(e.target.value)}
                      className="h-9"
                    />
                  </div>
                )}
              </div>

              {hasOverride && (
                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>This company has custom fee overrides that take precedence over their plan defaults.</span>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { setInitialized(false); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSave} disabled={setOverride.isPending || isLoading}>
            {setOverride.isPending ? "Saving..." : "Save Override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Company Dialog ────────────────────────────────────────────────────
function CreateCompanyDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [companyName, setCompanyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [emailVal, setEmailVal] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [sendWelcome, setSendWelcome] = useState(true);

  const create = trpc.adminViewAs.adminCreateCompany.useMutation({
    onSuccess: () => {
      toast.success("Company account created successfully!");
      setCompanyName(""); setAdminName(""); setEmailVal(""); setPassword(""); setPhone(""); setAddress("");
      onCreated();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleAddressSelect = (result: AddressResult) => {
    setAddress(result.formattedAddress);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ companyName, adminName, email: emailVal, password, phone: phone || undefined, address: address || undefined, sendWelcomeEmail: sendWelcome });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Create Company Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Company Name *</Label>
            <Input placeholder="Acme Property Management" value={companyName} onChange={e => setCompanyName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Admin Contact Name *</Label>
            <Input placeholder="Jane Smith" value={adminName} onChange={e => setAdminName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Email Address *</Label>
            <Input type="email" placeholder="jane@acme.com" value={emailVal} onChange={e => setEmailVal(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Password * (min 8 characters)</Label>
            <Input type="password" placeholder="Temporary password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Office Address</Label>
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              onSelect={handleAddressSelect}
              placeholder="Start typing the company address..."
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Send welcome email</p>
              <p className="text-xs text-muted-foreground">Email credentials to the new user</p>
            </div>
            <Switch checked={sendWelcome} onCheckedChange={setSendWelcome} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating..." : "Create Company"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCompanies() {
  const { data: companies, isLoading, refetch } = trpc.platform.companies.useQuery();
  const [managingCompany, setManagingCompany] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Companies</h1>
          <p className="text-muted-foreground mt-1">Manage all registered property management companies</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Create Company
        </Button>
      </div>
      <CreateCompanyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => refetch()} />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !companies || companies.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-card-foreground mb-2">No Companies Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              When property management companies sign up and register on the platform, they'll appear here.
              You'll be able to view their details, subscription status, and activity.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((company: any) => {
            const hasFeeOverride = company.feeOverridePercent != null || company.feeOverridePerListingEnabled != null || company.feeOverridePerListingAmount != null;
            return (
              <Card key={company.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-card-foreground truncate">{company.name}</h3>
                            {hasFeeOverride && (
                              <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400 bg-amber-500/10">
                                Custom Fee
                              </Badge>
                            )}
                          </div>
                          {company.email && (
                            <p className="text-xs text-muted-foreground truncate">{company.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Joined {new Date(company.createdAt).toLocaleDateString()}
                        </span>
                        {company.phone && <span>{company.phone}</span>}
                        {hasFeeOverride && company.feeOverridePercent != null && (
                          <span className="text-amber-400">
                            Override: {parseFloat(company.feeOverridePercent)}% fee
                            {company.feeOverridePerListingEnabled && company.feeOverridePerListingAmount != null
                              ? ` + $${parseFloat(company.feeOverridePerListingAmount).toFixed(2)}/listing`
                              : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Badge
                        variant={company.subscriptionStatus === "active" ? "default" : "secondary"}
                        className={company.subscriptionStatus === "active" ? "bg-green-600/20 text-green-400 border-green-600/30" : ""}
                      >
                        {company.subscriptionStatus || "No subscription"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 h-7"
                        onClick={() => setManagingCompany(company)}
                      >
                        <Settings className="h-3 w-3" /> Manage
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {managingCompany && (
        <FeeOverrideDialog
          company={managingCompany}
          open={!!managingCompany}
          onOpenChange={(v) => { if (!v) setManagingCompany(null); }}
          onSaved={() => refetch()}
        />
      )}
    </div>
  );
}
