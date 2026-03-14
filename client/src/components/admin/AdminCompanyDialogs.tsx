/**
 * Shared admin dialogs for Company management.
 * Used by both PlatformDashboard (Overview tab) and AdminCompanies page
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
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CreditCard, Percent, Receipt, X, AlertCircle, Clock, Gift, Check } from "lucide-react";
import AddressAutocomplete, { type AddressResult } from "@/components/AddressAutocomplete";

// ─── Create Company Dialog ────────────────────────────────────────────────────
export function CreateCompanyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
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

  const handleAddressSelect = (result: AddressResult) => setAddress(result.formattedAddress);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      companyName,
      adminName,
      email: emailVal,
      password,
      phone: phone || undefined,
      address: address || undefined,
      sendWelcomeEmail: sendWelcome,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Create Company Account
          </DialogTitle>
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

// ─── Manage Company Dialog (Edit info + Plan + Fee Overrides + Trial) ─────────
export function ManageCompanyDialog({
  company,
  open,
  onOpenChange,
  onSaved,
}: {
  company: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"info" | "plan" | "fees" | "trial">("info");

  // ── Info fields ──
  const [name, setName] = useState(company?.name ?? "");
  const [address, setAddress] = useState(company?.address ?? "");
  const [phone, setPhone] = useState(company?.phone ?? "");
  const [email, setEmail] = useState(company?.email ?? "");

  // ── Plan fields ──
  const { data: plans } = trpc.adminViewAs.listCompanyPlans.useQuery();
  const [planId, setPlanId] = useState<string>(company?.planId ? String(company.planId) : "none");
  const [priceOverride, setPriceOverride] = useState(
    company?.planPriceOverride ? String(parseFloat(company.planPriceOverride)) : ""
  );
  const [planNotes, setPlanNotes] = useState(company?.planNotes ?? "");

  // ── Fee override fields ──
  const { data: feeData, isLoading: feeLoading } = trpc.adminViewAs.getCompanyFeeOverride.useQuery(
    { companyId: company?.id },
    { enabled: !!company?.id && open }
  );
  const [feePercent, setFeePercent] = useState("");
  const [perListingEnabled, setPerListingEnabled] = useState(false);
  const [perListingAmount, setPerListingAmount] = useState("");
  const [hasOverride, setHasOverride] = useState(false);
  const [feeInitialized, setFeeInitialized] = useState(false);

  // ── Trial fields ──
  const [trialDays, setTrialDays] = useState("14");
  const [grantPlanId, setGrantPlanId] = useState<string>("");

  // Initialize fee fields when data loads
  if (feeData && !feeInitialized) {
    const planFeePercent = feeData.plan?.feePercent ?? null;
    const planListingEnabled = feeData.plan?.perListingFeeEnabled ?? false;
    const planListingAmount = feeData.plan?.perListingFeeAmount ?? null;
    const co = feeData.company;
    const hasFeeOverride = co?.feeOverridePercent != null || co?.feeOverridePerListingEnabled != null;
    setFeePercent(co?.feeOverridePercent != null ? String(parseFloat(String(co.feeOverridePercent))) : "");
    setPerListingEnabled(co?.feeOverridePerListingEnabled ?? planListingEnabled ?? false);
    setPerListingAmount(co?.feeOverridePerListingAmount != null ? String(parseFloat(String(co.feeOverridePerListingAmount))) : "");
    setHasOverride(hasFeeOverride);
    setFeeInitialized(true);
  }

  const updateCompany = trpc.adminViewAs.updateCompany.useMutation({
    onSuccess: () => { toast.success("Company info updated"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const assignPlan = trpc.adminViewAs.assignCompanyPlan.useMutation({
    onSuccess: () => { toast.success("Plan updated"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const setOverride = trpc.adminViewAs.setCompanyFeeOverride.useMutation({
    onSuccess: () => { toast.success("Fee override saved"); setFeeInitialized(false); onSaved(); },
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
  const planFeePercent = feeData?.plan?.feePercent ?? null;
  const planListingEnabled = feeData?.plan?.perListingFeeEnabled ?? false;
  const planListingAmount = feeData?.plan?.perListingFeeAmount ?? null;

  const handleSaveInfo = () => {
    if (!name.trim()) return;
    updateCompany.mutate({ id: company.id, name, address: address || undefined, phone: phone || undefined, email: email || undefined });
  };

  const handleSavePlan = () => {
    assignPlan.mutate({
      companyId: company.id,
      planId: planId === "none" ? null : parseInt(planId),
      priceOverride: priceOverride ? parseFloat(priceOverride) : null,
      notes: planNotes || null,
    });
  };

  const handleSaveFees = () => {
    setOverride.mutate({
      companyId: company.id,
      feePercent: feePercent ? parseFloat(feePercent) : null,
      perListingEnabled,
      perListingAmount: perListingAmount ? parseFloat(perListingAmount) : null,
    });
  };

  const handleClearOverride = () => {
    setOverride.mutate({ companyId: company.id, feePercent: null, perListingEnabled: false, perListingAmount: null });
    setFeePercent(""); setPerListingEnabled(false); setPerListingAmount(""); setHasOverride(false);
  };

  const TABS = [
    { id: "info", label: "Info" },
    { id: "plan", label: "Plan" },
    { id: "fees", label: "Fees" },
    { id: "trial", label: "Trial / Free" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setFeeInitialized(false); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Manage: {company?.name}
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
            <div className="space-y-1.5">
              <Label>Company Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                onSelect={(r: AddressResult) => setAddress(r.formattedAddress)}
                placeholder="Start typing the company address..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSaveInfo} disabled={!name.trim() || updateCompany.isPending}>
                {updateCompany.isPending ? "Saving..." : "Save Info"}
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
                  {Object.entries(selectedPlan.features ?? {}).map(([key, val]: [string, any]) => (
                    <div key={key} className="flex items-center gap-1.5 text-xs">
                      {val ? <Check className="h-3 w-3 text-green-400" /> : <X className="h-3 w-3 text-muted-foreground/40" />}
                      <span className={val ? "text-foreground" : "text-muted-foreground/60"}>
                        {key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}
                      </span>
                    </div>
                  ))}
                </div>
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
              <Input value={planNotes} onChange={e => setPlanNotes(e.target.value)} placeholder="e.g. Legacy customer, grandfathered rate" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSavePlan} disabled={assignPlan.isPending}>
                {assignPlan.isPending ? "Saving..." : "Save Plan"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Fees tab ── */}
        {tab === "fees" && (
          <div className="space-y-4 pt-2">
            {feeLoading ? (
              <p className="text-sm text-muted-foreground">Loading fee data...</p>
            ) : (
              <>
                <div className="rounded-lg bg-muted/40 border border-border p-3 text-sm space-y-1">
                  <p className="font-medium">Current Plan: <span className="text-primary">{company?.planId ? `Plan #${company.planId}` : "No plan assigned"}</span></p>
                  {feeData?.plan && (
                    <p className="text-xs text-muted-foreground">
                      Plan defaults: {planFeePercent}% service charge
                      {planListingEnabled ? ` + $${planListingAmount != null ? parseFloat(String(planListingAmount)).toFixed(2) : "0.00"} per listing` : " · No listing fee"}
                    </p>
                  )}
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Custom Fee Override</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Leave blank to use plan defaults.</p>
                  </div>
                  {hasOverride && (
                    <Button size="sm" variant="ghost" className="text-xs text-destructive hover:text-destructive gap-1" onClick={handleClearOverride} disabled={setOverride.isPending}>
                      <X className="h-3 w-3" /> Clear Override
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm"><Percent className="h-3.5 w-3.5 text-purple-400" /> Platform Service Charge (%)</Label>
                  <Input
                    type="number" min="0" max="100" step="0.1"
                    placeholder={planFeePercent != null ? `Plan default: ${planFeePercent}%` : "e.g. 5.0"}
                    value={feePercent}
                    onChange={e => { setFeePercent(e.target.value); setHasOverride(true); }}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-sm"><Receipt className="h-3.5 w-3.5 text-orange-400" /> Enable Per-Listing Fee Override</Label>
                    <Switch checked={perListingEnabled} onCheckedChange={v => { setPerListingEnabled(v); setHasOverride(true); }} />
                  </div>
                  {perListingEnabled && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Per-Listing Fee Amount ($)</Label>
                      <Input
                        type="number" min="0" step="0.01"
                        placeholder={planListingAmount != null ? `Plan default: $${parseFloat(String(planListingAmount)).toFixed(2)}` : "e.g. 2.50"}
                        value={perListingAmount}
                        onChange={e => setPerListingAmount(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                {hasOverride && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Custom fee overrides are active for this company.</span>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button onClick={handleSaveFees} disabled={setOverride.isPending}>
                    {setOverride.isPending ? "Saving..." : "Save Fee Override"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}

        {/* ── Trial / Free tab ── */}
        {tab === "trial" && (
          <div className="space-y-6 pt-2">
            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Extend Trial</h4>
              <p className="text-xs text-muted-foreground">Add days to the current trial period for <strong>{company?.name}</strong>.</p>
              <div className="space-y-1.5">
                <Label>Days to add</Label>
                <Input type="number" min="1" max="365" value={trialDays} onChange={e => setTrialDays(e.target.value)} className="w-32" />
              </div>
              <Button
                size="sm"
                onClick={() => extendTrial.mutate({ entityType: "company", entityId: company.id, days: parseInt(trialDays) || 14 })}
                disabled={extendTrial.isPending}
              >
                {extendTrial.isPending ? "Extending..." : "Extend Trial"}
              </Button>
            </div>
            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-semibold flex items-center gap-2"><Gift className="h-4 w-4 text-primary" /> Grant Free Plan</h4>
              <p className="text-xs text-muted-foreground">Grant <strong>{company?.name}</strong> a free (no-expiry) plan.</p>
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
                onClick={() => grantFree.mutate({ entityType: "company", entityId: company.id, planId: grantPlanId ? parseInt(grantPlanId) : undefined })}
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
