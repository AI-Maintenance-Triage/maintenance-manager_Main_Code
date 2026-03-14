/**
 * Shared admin dialogs for Contractor management.
 * Used by both PlatformDashboard (Overview tab) and AdminContractors page
 * so every entry point shows the same UI.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HardHat, Clock, Gift, Check, X } from "lucide-react";
import AddressAutocomplete, { type AddressResult } from "@/components/AddressAutocomplete";

const TRADE_OPTIONS = [
  "General Handyman", "Plumbing", "Electrical", "HVAC",
  "Carpentry", "Painting", "Roofing", "Appliance Repair",
  "Locksmith", "Landscaping", "Pest Control", "Cleaning",
  "Flooring", "Drywall", "Concrete", "Welding",
];

// ─── Create Contractor Dialog ─────────────────────────────────────────────────
export function CreateContractorDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [emailVal, setEmailVal] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [address, setAddress] = useState("");
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [serviceZips, setServiceZips] = useState("");
  const [sendWelcome, setSendWelcome] = useState(true);

  const create = trpc.adminViewAs.adminCreateContractor.useMutation({
    onSuccess: () => {
      toast.success("Contractor account created successfully!");
      setName(""); setBusinessName(""); setEmailVal(""); setPassword(""); setPhone("");
      setLicenseNumber(""); setAddress(""); setSelectedTrades([]); setServiceZips("");
      onCreated();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleTrade = (trade: string) =>
    setSelectedTrades(prev => prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]);

  const handleAddressSelect = (result: AddressResult) => setAddress(result.formattedAddress);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const zips = serviceZips.split(",").map(z => z.trim()).filter(Boolean);
    create.mutate({
      name,
      email: emailVal,
      password,
      businessName: businessName || undefined,
      phone: phone || undefined,
      licenseNumber: licenseNumber || undefined,
      address: address || undefined,
      trades: selectedTrades.length > 0 ? selectedTrades : undefined,
      serviceAreaZips: zips.length > 0 ? zips : undefined,
      sendWelcomeEmail: sendWelcome,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="h-5 w-5 text-primary" /> Create Contractor Account
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Full Name *</Label>
            <Input placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Business Name</Label>
            <Input placeholder="Doe Repairs LLC" value={businessName} onChange={e => setBusinessName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email Address *</Label>
            <Input type="email" placeholder="john@doerepairs.com" value={emailVal} onChange={e => setEmailVal(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Password * (min 8 characters)</Label>
            <Input type="password" placeholder="Temporary password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>License #</Label>
              <Input placeholder="LIC-12345" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Business Address</Label>
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              onSelect={handleAddressSelect}
              placeholder="Start typing the contractor's address..."
            />
          </div>
          <div className="space-y-2">
            <Label>Trades / Skills</Label>
            <div className="flex flex-wrap gap-2">
              {TRADE_OPTIONS.map(trade => (
                <button
                  key={trade}
                  type="button"
                  onClick={() => toggleTrade(trade)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedTrades.includes(trade)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {trade}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Service Area ZIP Codes</Label>
            <Input placeholder="25301, 25302, 25303 (comma-separated)" value={serviceZips} onChange={e => setServiceZips(e.target.value)} />
            <p className="text-xs text-muted-foreground">Separate multiple ZIP codes with commas</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Send welcome email</p>
              <p className="text-xs text-muted-foreground">Email credentials to the new contractor</p>
            </div>
            <Switch checked={sendWelcome} onCheckedChange={setSendWelcome} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating..." : "Create Contractor"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Manage Contractor Dialog (Edit info + Plan + Trial) ──────────────────────
export function ManageContractorDialog({
  contractor,
  open,
  onOpenChange,
  onSaved,
}: {
  contractor: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"info" | "plan" | "trial">("info");

  // ── Info fields ──
  const [name, setName] = useState(contractor?.userName ?? "");
  const [businessName, setBusinessName] = useState(contractor?.businessName ?? "");
  const [phone, setPhone] = useState(contractor?.phone ?? "");
  const [email, setEmail] = useState(contractor?.email ?? "");
  const [address, setAddress] = useState(contractor?.address ?? "");
  const [licenseNumber, setLicenseNumber] = useState(contractor?.licenseNumber ?? "");
  const [selectedTrades, setSelectedTrades] = useState<string[]>(contractor?.trades ?? []);

  // ── Plan fields ──
  const { data: plans } = trpc.adminViewAs.listContractorPlans.useQuery();
  const [planId, setPlanId] = useState<string>(contractor?.planId ? String(contractor.planId) : "none");
  const [priceOverride, setPriceOverride] = useState(
    contractor?.planPriceOverride ? String(parseFloat(contractor.planPriceOverride)) : ""
  );
  const [planNotes, setPlanNotes] = useState(contractor?.planNotes ?? "");

  // ── Trial fields ──
  const [trialDays, setTrialDays] = useState("14");
  const [grantPlanId, setGrantPlanId] = useState<string>("");

  const toggleTrade = (trade: string) =>
    setSelectedTrades(prev => prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]);

  const updateContractor = trpc.adminViewAs.updateContractor.useMutation({
    onSuccess: () => { toast.success("Contractor info updated"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const assignPlan = trpc.adminViewAs.assignContractorPlan.useMutation({
    onSuccess: () => { toast.success("Plan updated"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const extendTrial = trpc.adminViewAs.extendTrial.useMutation({
    onSuccess: (data: any) => { toast.success(`Trial extended to ${new Date(data.newExpiresAt).toLocaleDateString()}`); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const grantFree = trpc.adminViewAs.grantFreePlan.useMutation({
    onSuccess: () => { toast.success("Free plan granted"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  const selectedPlan = plans?.find((p: any) => String(p.id) === planId);

  const handleSaveInfo = () => {
    updateContractor.mutate({
      id: contractor.id,
      name: name || undefined,
      businessName: businessName || undefined,
      phone: phone || undefined,
      email: email || undefined,
      address: address || undefined,
      licenseNumber: licenseNumber || undefined,
      trades: selectedTrades.length > 0 ? selectedTrades : undefined,
    });
  };

  const handleSavePlan = () => {
    assignPlan.mutate({
      contractorId: contractor.id,
      planId: planId === "none" ? null : parseInt(planId),
      priceOverride: priceOverride ? parseFloat(priceOverride) : null,
      notes: planNotes || null,
    });
  };

  const TABS = [
    { id: "info", label: "Info" },
    { id: "plan", label: "Plan" },
    { id: "trial", label: "Trial / Free" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="h-5 w-5 text-primary" /> Manage: {contractor?.businessName || contractor?.userName}
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border pb-0 -mx-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium rounded-t transition-colors ${
                tab === t.id
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Info tab ── */}
        {tab === "info" && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Business Name</Label>
                <Input value={businessName} onChange={e => setBusinessName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>License #</Label>
                <Input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Business Address</Label>
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                onSelect={(r: AddressResult) => setAddress(r.formattedAddress)}
                placeholder="Start typing the contractor's address..."
              />
            </div>
            <div className="space-y-2">
              <Label>Trades / Skills</Label>
              <div className="flex flex-wrap gap-2">
                {TRADE_OPTIONS.map(trade => (
                  <button
                    key={trade}
                    type="button"
                    onClick={() => toggleTrade(trade)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedTrades.includes(trade)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/40 text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {trade}
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSaveInfo} disabled={updateContractor.isPending}>
                {updateContractor.isPending ? "Saving..." : "Save Info"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Plan tab ── */}
        {tab === "plan" && (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Assigned Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue placeholder="No plan assigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No plan (unassigned)</SelectItem>
                  {(plans ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} — ${parseFloat(p.priceMonthly ?? "0").toFixed(0)}/mo{!p.isActive ? " (inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPlan && (
              <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Plan features</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(selectedPlan.features ?? {}).filter(([k]) =>
                    !["maxActiveJobs", "maxCompanies"].includes(k)
                  ).map(([key, val]: [string, any]) => (
                    <div key={key} className="flex items-center gap-1.5 text-xs">
                      {val ? <Check className="h-3 w-3 text-green-400" /> : <X className="h-3 w-3 text-muted-foreground/40" />}
                      <span className={val ? "text-foreground" : "text-muted-foreground/60"}>
                        {key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}
                      </span>
                    </div>
                  ))}
                </div>
                {((selectedPlan.features as any)?.maxActiveJobs != null || (selectedPlan.features as any)?.maxCompanies != null) && (
                  <div className="flex gap-3 text-xs text-muted-foreground pt-1 border-t border-border">
                    {(selectedPlan.features as any)?.maxActiveJobs != null && (
                      <span>Max {(selectedPlan.features as any).maxActiveJobs} active jobs</span>
                    )}
                    {(selectedPlan.features as any)?.maxCompanies != null && (
                      <span>Max {(selectedPlan.features as any).maxCompanies} companies</span>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Custom Price Override ($/mo) <span className="text-xs text-muted-foreground font-normal">— leave blank for plan default</span></Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number" min="0" step="0.01"
                  value={priceOverride}
                  onChange={e => setPriceOverride(e.target.value)}
                  placeholder={selectedPlan ? `${parseFloat(selectedPlan.priceMonthly ?? "0").toFixed(2)} (default)` : "0.00"}
                />
                {priceOverride && <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPriceOverride("")}>Clear</Button>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Internal Notes</Label>
              <Input value={planNotes} onChange={e => setPlanNotes(e.target.value)} placeholder="e.g. Early adopter, grandfathered rate" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSavePlan} disabled={assignPlan.isPending}>
                {assignPlan.isPending ? "Saving..." : "Save Plan"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Trial / Free tab ── */}
        {tab === "trial" && (
          <div className="space-y-6 pt-2">
            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Extend Trial</h4>
              <p className="text-xs text-muted-foreground">Add days to the current trial period for <strong>{contractor?.businessName || contractor?.userName}</strong>.</p>
              <div className="space-y-1.5">
                <Label>Days to add</Label>
                <Input type="number" min="1" max="365" value={trialDays} onChange={e => setTrialDays(e.target.value)} className="w-32" />
              </div>
              <Button
                size="sm"
                onClick={() => extendTrial.mutate({ entityType: "contractor", entityId: contractor.id, days: parseInt(trialDays) || 14 })}
                disabled={extendTrial.isPending}
              >
                {extendTrial.isPending ? "Extending..." : "Extend Trial"}
              </Button>
            </div>
            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-semibold flex items-center gap-2"><Gift className="h-4 w-4 text-primary" /> Grant Free Plan</h4>
              <p className="text-xs text-muted-foreground">Grant <strong>{contractor?.businessName || contractor?.userName}</strong> a free (no-expiry) plan.</p>
              <div className="space-y-1.5">
                <Label>Plan (optional)</Label>
                <Select value={grantPlanId} onValueChange={setGrantPlanId}>
                  <SelectTrigger><SelectValue placeholder="Keep current plan" /></SelectTrigger>
                  <SelectContent>
                    {(plans ?? []).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={() => grantFree.mutate({ entityType: "contractor", entityId: contractor.id, planId: grantPlanId ? parseInt(grantPlanId) : undefined })}
                disabled={grantFree.isPending}
              >
                {grantFree.isPending ? "Granting..." : "Grant Free Plan"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
