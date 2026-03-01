import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Flag, Plus } from "lucide-react";

export default function AdminFeatureFlags() {
  const utils = trpc.useUtils();
  const { data: flags, isLoading } = trpc.adminControl.listFeatureFlags.useQuery();

  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [enabledForCompanies, setEnabledForCompanies] = useState(true);
  const [enabledForContractors, setEnabledForContractors] = useState(true);

  const resetForm = () => { setKey(""); setLabel(""); setDescription(""); setEnabledForCompanies(true); setEnabledForContractors(true); };

  const upsertMutation = trpc.adminControl.upsertFeatureFlag.useMutation({
    onSuccess: () => { toast.success("Feature flag saved!"); setOpen(false); resetForm(); utils.adminControl.listFeatureFlags.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.adminControl.updateFeatureFlag.useMutation({
    onSuccess: () => { toast.success("Flag updated!"); utils.adminControl.listFeatureFlags.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Flag className="h-6 w-6 text-primary" /> Feature Flags</h1>
          <p className="text-muted-foreground text-sm mt-1">Enable or disable platform features per audience.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Flag</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Feature Flag</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5"><Label>Key (unique identifier)</Label><Input value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))} placeholder="new_feature_key" /></div>
              <div className="space-y-1.5"><Label>Label</Label><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="New Feature Name" /></div>
              <div className="space-y-1.5"><Label>Description (optional)</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What this feature does..." /></div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div><p className="text-sm font-medium">Enable for Companies</p></div>
                  <Switch checked={enabledForCompanies} onCheckedChange={setEnabledForCompanies} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div><p className="text-sm font-medium">Enable for Contractors</p></div>
                  <Switch checked={enabledForContractors} onCheckedChange={setEnabledForContractors} />
                </div>
              </div>
              <Button className="w-full" onClick={() => upsertMutation.mutate({ key, label, description, enabledForCompanies, enabledForContractors })} disabled={upsertMutation.isPending || !key || !label}>
                Create Flag
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !flags?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No feature flags defined yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {flags.map((f: any) => (
            <Card key={f.key}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{f.label}</CardTitle>
                    <CardDescription className="text-xs font-mono mt-0.5">{f.key}</CardDescription>
                    {f.description && <p className="text-sm text-muted-foreground mt-1">{f.description}</p>}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={f.enabledForCompanies}
                      onCheckedChange={(v) => updateMutation.mutate({ key: f.key, enabledForCompanies: v })}
                    />
                    <span className="text-sm">Companies</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={f.enabledForContractors}
                      onCheckedChange={(v) => updateMutation.mutate({ key: f.key, enabledForContractors: v })}
                    />
                    <span className="text-sm">Contractors</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Last updated: {f.updatedAt ? new Date(f.updatedAt).toLocaleString() : "—"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
