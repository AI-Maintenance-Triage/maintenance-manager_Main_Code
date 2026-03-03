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
import { Plus, Trash2, Settings, DollarSign, MapPin, Clock, Link2, Pencil, Bell, Wallet, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import PaymentMethodManager from "@/components/PaymentMethodManager";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function CompanySettings() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const [, setLocation] = useLocation();
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
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-1.5" />Notifications</TabsTrigger>
          <TabsTrigger value="integrations" onClick={() => setLocation("/company/integrations")}><Link2 className="h-4 w-4 mr-1.5" />Integrations <ExternalLink className="h-3 w-3 ml-1 opacity-50" /></TabsTrigger>
          <TabsTrigger value="payment-methods"><Wallet className="h-4 w-4 mr-1.5" />Payment Methods</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><GeneralSettings readOnly={false} companyId={isViewingAsCompany ? viewAs.companyId! : undefined} /></TabsContent>
        <TabsContent value="rates"><SkillTiersSettings readOnly={false} isAdmin={isAdmin} companyId={isViewingAsCompany ? viewAs.companyId! : undefined} /></TabsContent>
        <TabsContent value="tracking"><TrackingSettings readOnly={false} companyId={isViewingAsCompany ? viewAs.companyId! : undefined} /></TabsContent>
        <TabsContent value="notifications"><NotificationSettings readOnly={false} companyId={isViewingAsCompany ? viewAs.companyId! : undefined} /></TabsContent>
        <TabsContent value="payment-methods">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <Wallet className="h-5 w-5 text-primary" />
                Payment Methods
              </CardTitle>
              <CardDescription>
                Manage the bank accounts and cards used to pay contractors after job completion. You can select which account to charge right before submitting each payment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentMethodManager />
            </CardContent>
          </Card>
        </TabsContent>
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
  const [defaultVisibility, setDefaultVisibility] = useState<"public" | "private">("public");

  useEffect(() => {
    if (company) setCompanyName((company as any).name || "");
    if (settings) {
      setAutoApprove((settings as any).autoApproveContractors ?? false);
      setEscalationTimeout(String((settings as any).escalationTimeoutMinutes ?? 60));
      setPartsMarkup((settings as any).partsMarkupPercent ?? "0");
      setDefaultVisibility((settings as any).defaultJobBoardVisibility ?? "public");
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
          <div className="space-y-2">
            <Label>Default Job Board Visibility</Label>
            <p className="text-xs text-muted-foreground">
              Where new jobs are posted by default. <strong>Public</strong> = visible to all contractors on the public board. <strong>Private</strong> = visible only to contractors you've marked as trusted.
            </p>
            <Select
              value={defaultVisibility}
              disabled={readOnly}
              onValueChange={(v: "public" | "private") => {
                if (!readOnly) {
                  setDefaultVisibility(v);
                  updateSettings.mutate({ defaultJobBoardVisibility: v });
                }
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public Board</SelectItem>
                <SelectItem value="private">Private Board (Trusted Only)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SkillTiersSettings({ readOnly, isAdmin, companyId }: { readOnly: boolean; isAdmin?: boolean; companyId?: number }) {
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
          {!readOnly && isAdmin && !companyId && (
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
                      {isAdmin && !companyId && (
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => deleteTier.mutate({ id: tier.id })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
            {/* Name and description: only editable by platform admin (not when viewing as a company) */}
            <div className="space-y-2">
              <Label>Tier Name</Label>
              {isAdmin && !companyId
                ? <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                : <p className="text-sm font-medium text-foreground py-2">{editForm.name}</p>
              }
            </div>
            <div className="space-y-2"><Label>Hourly Rate ($)</Label><Input type="number" value={editForm.hourlyRate} onChange={(e) => setEditForm({ ...editForm, hourlyRate: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Description</Label>
              {isAdmin && !companyId
                ? <Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                : <p className="text-sm text-muted-foreground py-1">{editForm.description || <span className="italic">No description</span>}</p>
              }
            </div>
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
  const [excludeOutOfGeofence, setExcludeOutOfGeofence] = useState(false);

  useEffect(() => {
    if (settings) {
      setGeofence(String((settings as any).geofenceRadiusFeet ?? 500));
      setAutoClockOut(String((settings as any).autoClockOutMinutes ?? 5));
      setMaxSession(String((settings as any).maxSessionDurationHours ?? 8));
      setTimesheetReview((settings as any).timesheetReviewEnabled ?? true);
      setBillablePolicy((settings as any).billableTimePolicy ?? "on_site_only");
      setExcludeOutOfGeofence((settings as any).excludeOutOfGeofenceSessions ?? false);
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
          <div className="flex items-center justify-between">
            <div>
              <Label>Exclude Out-of-Geofence Sessions from Billing</Label>
              <p className="text-xs text-muted-foreground">When enabled, time sessions where the contractor was outside the property geofence will not be included in labor cost calculations</p>
            </div>
            <Switch checked={excludeOutOfGeofence} disabled={readOnly} onCheckedChange={(v) => { if (!readOnly) { setExcludeOutOfGeofence(v); updateSettings.mutate({ excludeOutOfGeofenceSessions: v }); } }} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationSettings({ readOnly, companyId }: { readOnly: boolean; companyId?: number }) {
  // Email preferences (per-user, not per-company)
  const emailPrefs = trpc.emailPrefs.get.useQuery(undefined, { enabled: !readOnly });
  const updateEmailPrefs = trpc.emailPrefs.update.useMutation({ onSuccess: () => toast.success("Email preferences saved!") });
  const [emailJobAssigned, setEmailJobAssigned] = useState(true);
  const [emailJobSubmitted, setEmailJobSubmitted] = useState(true);
  const [emailJobPaid, setEmailJobPaid] = useState(true);
  const [emailNewComment, setEmailNewComment] = useState(true);
  const [emailJobDisputed, setEmailJobDisputed] = useState(true);
  useEffect(() => {
    if (emailPrefs.data) {
      setEmailJobAssigned(emailPrefs.data.jobAssigned !== false);
      setEmailJobSubmitted(emailPrefs.data.jobSubmitted !== false);
      setEmailJobPaid(emailPrefs.data.jobPaid !== false);
      setEmailNewComment(emailPrefs.data.newComment !== false);
      setEmailJobDisputed(emailPrefs.data.jobDisputed !== false);
    }
  }, [emailPrefs.data]);
  const toggleEmail = (field: string, value: boolean) => {
    if (!readOnly) updateEmailPrefs.mutate({ [field]: value } as any);
  };

  const regularSettings = trpc.settings.get.useQuery(undefined, { enabled: !readOnly });
  const viewAsSettings = trpc.adminViewAs.companySettings.useQuery({ companyId: companyId! }, { enabled: readOnly && !!companyId });
  const settings = readOnly ? viewAsSettings.data : regularSettings.data;
  const isLoading = readOnly ? viewAsSettings.isLoading : regularSettings.isLoading;
  const updateSettings = trpc.settings.update.useMutation({ onSuccess: () => toast.success("Notification preferences saved!") });

  const [notifyClockIn, setNotifyClockIn] = useState(true);
  const [notifyClockOut, setNotifyClockOut] = useState(true);
  const [notifyJobSubmitted, setNotifyJobSubmitted] = useState(true);
  const [notifyNewContractor, setNotifyNewContractor] = useState(true);

  useEffect(() => {
    if (settings) {
      setNotifyClockIn((settings as any).notifyOnClockIn ?? true);
      setNotifyClockOut((settings as any).notifyOnClockOut ?? true);
      setNotifyJobSubmitted((settings as any).notifyOnJobSubmitted ?? true);
      setNotifyNewContractor((settings as any).notifyOnNewContractor ?? true);
    }
  }, [settings]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const toggle = (field: string, value: boolean) => {
    if (!readOnly) updateSettings.mutate({ [field]: value } as any);
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /> Notification Preferences</CardTitle>
          <CardDescription>Choose which events trigger platform notifications to your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Contractor Clocked In</Label>
              <p className="text-xs text-muted-foreground">Notify when a contractor starts GPS tracking on a job</p>
            </div>
            <Switch checked={notifyClockIn} disabled={readOnly} onCheckedChange={(v) => { setNotifyClockIn(v); toggle("notifyOnClockIn", v); }} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Contractor Clocked Out</Label>
              <p className="text-xs text-muted-foreground">Notify when a contractor ends their session (manual or auto)</p>
            </div>
            <Switch checked={notifyClockOut} disabled={readOnly} onCheckedChange={(v) => { setNotifyClockOut(v); toggle("notifyOnClockOut", v); }} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Job Submitted for Verification</Label>
              <p className="text-xs text-muted-foreground">Notify when a contractor marks a job as complete and submits it for your review</p>
            </div>
            <Switch checked={notifyJobSubmitted} disabled={readOnly} onCheckedChange={(v) => { setNotifyJobSubmitted(v); toggle("notifyOnJobSubmitted", v); }} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">New Contractor Application</Label>
              <p className="text-xs text-muted-foreground">Notify when a contractor requests to join your company</p>
            </div>
            <Switch checked={notifyNewContractor} disabled={readOnly} onCheckedChange={(v) => { setNotifyNewContractor(v); toggle("notifyOnNewContractor", v); }} />
          </div>
        </CardContent>
      </Card>

      {/* Email notification preferences */}
      {!readOnly && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground flex items-center gap-2"><Bell className="h-5 w-5 text-blue-400" /> Email Notifications</CardTitle>
            <CardDescription>Choose which events send you an email. You will always receive critical security emails regardless of these settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Job Submitted for Verification</Label>
                <p className="text-xs text-muted-foreground">Email when a contractor submits a job for your review</p>
              </div>
              <Switch checked={emailJobSubmitted} onCheckedChange={(v) => { setEmailJobSubmitted(v); toggleEmail("jobSubmitted", v); }} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Job Paid / Verified</Label>
                <p className="text-xs text-muted-foreground">Email when a job payment is confirmed</p>
              </div>
              <Switch checked={emailJobPaid} onCheckedChange={(v) => { setEmailJobPaid(v); toggleEmail("jobPaid", v); }} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">New Job Comment</Label>
                <p className="text-xs text-muted-foreground">Email when a contractor posts a note on a job</p>
              </div>
              <Switch checked={emailNewComment} onCheckedChange={(v) => { setEmailNewComment(v); toggleEmail("newComment", v); }} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Job Disputed</Label>
                <p className="text-xs text-muted-foreground">Email when a job is disputed by your team</p>
              </div>
              <Switch checked={emailJobDisputed} onCheckedChange={(v) => { setEmailJobDisputed(v); toggleEmail("jobDisputed", v); }} />
            </div>
          </CardContent>
        </Card>
      )}
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
    { value: "doorloop", label: "DoorLoop", description: "Connect DoorLoop for modern property management and maintenance sync" },
    { value: "realpage", label: "RealPage", description: "Connect RealPage for multifamily and commercial property management sync" },
    { value: "propertyware", label: "Propertyware", description: "Connect Propertyware (a RealPage company) for single-family rental management" },
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
