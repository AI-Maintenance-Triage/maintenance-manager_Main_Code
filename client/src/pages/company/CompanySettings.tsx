import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useViewAs } from "@/contexts/ViewAsContext";
import { Plus, Trash2, Settings, DollarSign, MapPin, Clock, Link2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function CompanySettings() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const isAdmin = user?.role === "admin";
  const isViewingAsCompany = isAdmin && viewAs.mode === "company" && viewAs.companyId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          {isViewingAsCompany ? `Managing settings for ${viewAs.companyName}` : "Configure your company's maintenance operations"}
        </p>
      </div>
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="bg-secondary">
          <TabsTrigger value="general"><Settings className="h-4 w-4 mr-1.5" />General</TabsTrigger>
          <TabsTrigger value="rates"><DollarSign className="h-4 w-4 mr-1.5" />Skill Tiers</TabsTrigger>
          <TabsTrigger value="tracking"><MapPin className="h-4 w-4 mr-1.5" />GPS & Time</TabsTrigger>
          <TabsTrigger value="integrations"><Link2 className="h-4 w-4 mr-1.5" />Integrations</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><GeneralSettings readOnly={false} companyId={isViewingAsCompany ? viewAs.companyId! : undefined} /></TabsContent>
        <TabsContent value="rates"><SkillTiersSettings readOnly={false} companyId={isViewingAsCompany ? viewAs.companyId! : undefined} /></TabsContent>
        <TabsContent value="tracking"><TrackingSettings readOnly={false} companyId={isViewingAsCompany ? viewAs.companyId! : undefined} /></TabsContent>
        <TabsContent value="integrations"><IntegrationSettings readOnly={false} companyId={isViewingAsCompany ? viewAs.companyId! : undefined} /></TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralSettings({ readOnly, companyId }: { readOnly: boolean; companyId?: number }) {
  const regularSettings = trpc.settings.get.useQuery(undefined, { enabled: !readOnly });
  const regularCompany = trpc.company.get.useQuery(undefined, { enabled: !readOnly });
  const viewAsSettings = trpc.adminViewAs.companySettings.useQuery({ companyId: companyId! }, { enabled: readOnly && !!companyId });
  const viewAsCompany = trpc.adminViewAs.companyDetails.useQuery({ companyId: companyId! }, { enabled: readOnly && !!companyId });

  const settings = readOnly ? viewAsSettings.data : regularSettings.data;
  const company = readOnly ? viewAsCompany.data : regularCompany.data;
  const isLoading = readOnly ? viewAsSettings.isLoading : regularSettings.isLoading;

  const updateSettings = trpc.settings.update.useMutation({ onSuccess: () => toast.success("Settings saved!") });
  const updateCompany = trpc.company.update.useMutation({ onSuccess: () => toast.success("Company updated!") });

  const [companyName, setCompanyName] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [escalationTimeout, setEscalationTimeout] = useState("60");
  const [partsMarkup, setPartsMarkup] = useState("0");

  useEffect(() => {
    if (company) setCompanyName((company as any).name || "");
    if (settings) {
      setAutoApprove((settings as any).autoApproveContractors ?? false);
      setEscalationTimeout(String((settings as any).escalationTimeoutMinutes ?? 60));
      setPartsMarkup((settings as any).partsMarkupPercent ?? "0");
    }
  }, [company, settings]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Company Profile</CardTitle>
          <CardDescription>Basic company information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={readOnly} />
          </div>
          {!readOnly && (
            <Button onClick={() => updateCompany.mutate({ name: companyName })} disabled={updateCompany.isPending}>
              {updateCompany.isPending ? "Saving..." : "Save"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Contractor Management</CardTitle>
          <CardDescription>How contractors join and interact with your company</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-Approve Contractors</Label>
              <p className="text-xs text-muted-foreground">Automatically approve contractors who request to join</p>
            </div>
            <Switch checked={autoApprove} disabled={readOnly} onCheckedChange={(v) => { if (!readOnly) { setAutoApprove(v); updateSettings.mutate({ autoApproveContractors: v }); } }} />
          </div>
          <div className="space-y-2">
            <Label>Job Escalation Timeout (minutes)</Label>
            <p className="text-xs text-muted-foreground">Auto-escalate if no contractor accepts within this time</p>
            <Input type="number" value={escalationTimeout} disabled={readOnly} onChange={(e) => setEscalationTimeout(e.target.value)} onBlur={() => { if (!readOnly) updateSettings.mutate({ escalationTimeoutMinutes: Number(escalationTimeout) }); }} />
          </div>
          <div className="space-y-2">
            <Label>Parts Markup (%)</Label>
            <p className="text-xs text-muted-foreground">Markup percentage applied to contractor-submitted parts receipts</p>
            <Input type="number" value={partsMarkup} disabled={readOnly} onChange={(e) => setPartsMarkup(e.target.value)} onBlur={() => { if (!readOnly) updateSettings.mutate({ partsMarkupPercent: partsMarkup }); }} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SkillTiersSettings({ readOnly, companyId }: { readOnly: boolean; companyId?: number }) {
  const utils = trpc.useUtils();
  const regularTiers = trpc.skillTiers.list.useQuery(undefined, { enabled: !readOnly });
  const viewAsTiers = trpc.adminViewAs.companySkillTiers.useQuery({ companyId: companyId! }, { enabled: readOnly && !!companyId });

  const tiers = readOnly ? viewAsTiers.data : regularTiers.data;
  const isLoading = readOnly ? viewAsTiers.isLoading : regularTiers.isLoading;

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", hourlyRate: "", description: "", emergencyMultiplier: "1.5" });
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: 0, name: "", hourlyRate: "", description: "", emergencyMultiplier: "1.5" });

  const createTier = trpc.skillTiers.create.useMutation({
    onSuccess: () => { toast.success("Tier created!"); utils.skillTiers.list.invalidate(); setOpen(false); setForm({ name: "", hourlyRate: "", description: "", emergencyMultiplier: "1.5" }); },
  });
  const updateTier = trpc.skillTiers.update.useMutation({
    onSuccess: () => { toast.success("Tier updated!"); utils.skillTiers.list.invalidate(); setEditOpen(false); },
  });
  const deleteTier = trpc.skillTiers.delete.useMutation({
    onSuccess: () => { toast.success("Tier removed"); utils.skillTiers.list.invalidate(); },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-card-foreground">Skill Tiers & Hourly Rates</CardTitle>
            <CardDescription>Define the skill tiers and their hourly rates. The AI uses these to classify incoming jobs.</CardDescription>
          </div>
          {!readOnly && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Tier</Button></DialogTrigger>
              <DialogContent className="bg-card">
                <DialogHeader><DialogTitle className="text-card-foreground">Add Skill Tier</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Tier Name</Label><Input placeholder="e.g. General Handyman" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Hourly Rate ($)</Label><Input type="number" placeholder="35" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Description</Label><Input placeholder="Basic repairs, minor fixes" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Emergency Multiplier</Label><Input type="number" step="0.1" placeholder="1.5" value={form.emergencyMultiplier} onChange={(e) => setForm({ ...form, emergencyMultiplier: e.target.value })} /></div>
                  <Button onClick={() => createTier.mutate({ name: form.name, hourlyRate: form.hourlyRate, description: form.description || undefined, emergencyMultiplier: form.emergencyMultiplier })} disabled={!form.name || !form.hourlyRate || createTier.isPending} className="w-full">
                    {createTier.isPending ? "Creating..." : "Create Tier"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {!tiers || tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No skill tiers configured. {!readOnly ? 'Add tiers like "General Handyman ($35/hr)", "Skilled Trade ($50/hr)", "Specialty ($80/hr)".' : ""}</p>
          ) : (
            <div className="space-y-2">
  {tiers.map((tier: any) => (
                <div key={tier.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{tier.name}</span>
                      <span className="text-primary font-semibold">${tier.hourlyRate}/hr</span>
                    </div>
                    {tier.description && <p className="text-xs text-muted-foreground mt-0.5">{tier.description}</p>}
                    <p className="text-xs text-muted-foreground">Emergency: {tier.emergencyMultiplier}x</p>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => { setEditForm({ id: tier.id, name: tier.name, hourlyRate: tier.hourlyRate, description: tier.description || "", emergencyMultiplier: String(tier.emergencyMultiplier) }); setEditOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => deleteTier.mutate({ id: tier.id })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Tier Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card">
          <DialogHeader><DialogTitle className="text-card-foreground">Edit Skill Tier</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Tier Name</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Hourly Rate ($)</Label><Input type="number" value={editForm.hourlyRate} onChange={(e) => setEditForm({ ...editForm, hourlyRate: e.target.value })} /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></div>
            <div className="space-y-2"><Label>Emergency Multiplier</Label><Input type="number" step="0.1" value={editForm.emergencyMultiplier} onChange={(e) => setEditForm({ ...editForm, emergencyMultiplier: e.target.value })} /></div>
            <Button onClick={() => updateTier.mutate({ id: editForm.id, name: editForm.name, hourlyRate: editForm.hourlyRate, description: editForm.description || undefined, emergencyMultiplier: editForm.emergencyMultiplier })} disabled={!editForm.name || !editForm.hourlyRate || updateTier.isPending} className="w-full">
              {updateTier.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TrackingSettings({ readOnly, companyId }: { readOnly: boolean; companyId?: number }) {
  const regularSettings = trpc.settings.get.useQuery(undefined, { enabled: !readOnly });
  const viewAsSettings = trpc.adminViewAs.companySettings.useQuery({ companyId: companyId! }, { enabled: readOnly && !!companyId });

  const settings = readOnly ? viewAsSettings.data : regularSettings.data;
  const isLoading = readOnly ? viewAsSettings.isLoading : regularSettings.isLoading;

  const updateSettings = trpc.settings.update.useMutation({ onSuccess: () => toast.success("Settings saved!") });

  const [geofence, setGeofence] = useState("500");
  const [autoClockOut, setAutoClockOut] = useState("5");
  const [maxSession, setMaxSession] = useState("8");
  const [timesheetReview, setTimesheetReview] = useState(true);
  const [billablePolicy, setBillablePolicy] = useState("on_site_only");

  useEffect(() => {
    if (settings) {
      setGeofence(String((settings as any).geofenceRadiusFeet ?? 500));
      setAutoClockOut(String((settings as any).autoClockOutMinutes ?? 5));
      setMaxSession(String((settings as any).maxSessionDurationHours ?? 8));
      setTimesheetReview((settings as any).timesheetReviewEnabled ?? true);
      setBillablePolicy((settings as any).billableTimePolicy ?? "on_site_only");
    }
  }, [settings]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Geofence Settings</CardTitle>
          <CardDescription>Control how GPS location is verified against property addresses</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Geofence Radius (feet)</Label>
            <p className="text-xs text-muted-foreground">Contractor must be within this distance of the property to clock in/out</p>
            <Input type="number" value={geofence} disabled={readOnly} onChange={(e) => setGeofence(e.target.value)} onBlur={() => { if (!readOnly) updateSettings.mutate({ geofenceRadiusFeet: Number(geofence) }); }} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Time Tracking Rules</CardTitle>
          <CardDescription>Configure automatic time tracking behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Auto Clock-Out Timer (minutes)</Label>
            <p className="text-xs text-muted-foreground">Auto clock-out when contractor returns to starting location for this duration</p>
            <Input type="number" value={autoClockOut} disabled={readOnly} onChange={(e) => setAutoClockOut(e.target.value)} onBlur={() => { if (!readOnly) updateSettings.mutate({ autoClockOutMinutes: Number(autoClockOut) }); }} />
          </div>
          <div className="space-y-2">
            <Label>Max Session Duration (hours)</Label>
            <p className="text-xs text-muted-foreground">Auto-flag sessions exceeding this duration for review</p>
            <Input type="number" value={maxSession} disabled={readOnly} onChange={(e) => setMaxSession(e.target.value)} onBlur={() => { if (!readOnly) updateSettings.mutate({ maxSessionDurationHours: Number(maxSession) }); }} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Timesheet Review Window</Label>
              <p className="text-xs text-muted-foreground">Allow contractors to review calculated time before submission</p>
            </div>
            <Switch checked={timesheetReview} disabled={readOnly} onCheckedChange={(v) => { if (!readOnly) { setTimesheetReview(v); updateSettings.mutate({ timesheetReviewEnabled: v }); } }} />
          </div>
          <div className="space-y-2">
            <Label>Billable Time Policy</Label>
            <p className="text-xs text-muted-foreground">How contractor time is calculated for billing</p>
            <Select value={billablePolicy} disabled={readOnly} onValueChange={(v) => { if (!readOnly) { setBillablePolicy(v); updateSettings.mutate({ billableTimePolicy: v as any }); } }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="on_site_only">On-Site Only — Only time at the property</SelectItem>
                <SelectItem value="full_trip">Full Trip — From clock-in to clock-out including travel</SelectItem>
                <SelectItem value="hybrid_with_cap">Hybrid with Cap — On-site + capped off-site time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationSettings({ readOnly, companyId }: { readOnly: boolean; companyId?: number }) {
  const utils = trpc.useUtils();
  const regularIntegrations = trpc.integrations.list.useQuery(undefined, { enabled: !readOnly });
  const viewAsIntegrations = trpc.adminViewAs.companyIntegrations.useQuery({ companyId: companyId! }, { enabled: readOnly && !!companyId });

  const integrations = readOnly ? viewAsIntegrations.data : regularIntegrations.data;
  const isLoading = readOnly ? viewAsIntegrations.isLoading : regularIntegrations.isLoading;

  const upsertIntegration = trpc.integrations.upsert.useMutation({
    onSuccess: () => { toast.success("Integration saved!"); utils.integrations.list.invalidate(); },
  });

  const [provider, setProvider] = useState<string>("buildium");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const providers = [
    { value: "buildium", label: "Buildium", description: "Connect your Buildium account to auto-import maintenance requests" },
    { value: "appfolio", label: "AppFolio", description: "Connect AppFolio for property management sync" },
    { value: "rentmanager", label: "Rent Manager", description: "Connect Rent Manager for maintenance request import" },
    { value: "yardi", label: "Yardi", description: "Connect Yardi Voyager for enterprise property management" },
  ];

  return (
    <div className="space-y-6">
      {!readOnly && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /> Property Management Software</CardTitle>
            <CardDescription>Connect your property management software to automatically import maintenance requests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{providers.find(p => p.value === provider)?.description}</p>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input type="password" placeholder="Enter your API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Base URL (optional)</Label>
              <Input placeholder="https://api.buildium.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
            <Button
              onClick={() => upsertIntegration.mutate({ provider: provider as any, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined, isActive: true })}
              disabled={!apiKey || upsertIntegration.isPending}
            >
              {upsertIntegration.isPending ? "Saving..." : "Save Integration"}
            </Button>
          </CardContent>
        </Card>
      )}

      {integrations && integrations.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-card-foreground">Connected Integrations</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {integrations.map((i: any) => (
                <div key={i.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <span className="font-medium text-foreground capitalize">{i.provider}</span>
                    <span className={`ml-2 text-xs ${i.isActive ? "text-green-400" : "text-muted-foreground"}`}>
                      {i.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {readOnly && (!integrations || integrations.length === 0) && (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">This company has no integrations configured.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
