/**
 * AdminPromoCodes
 *
 * Admin page for creating and managing promo codes.
 * Promo codes can:
 *   - Take a % off the monthly subscription
 *   - Take a % off the platform service charge (per-job fee)
 *   - Take a % off the per-listing fee
 *   - Apply for a set number of billing cycles or forever
 *   - Have a max number of redemptions or be unlimited
 *   - Have an expiry date
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Tag,
  Plus,
  RefreshCw,
  Copy,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
  Infinity,
  Calendar,
  Users,
  Percent,
} from "lucide-react";
import { toast } from "sonner";

interface PromoCode {
  id: number;
  code: string;
  description: string | null;
  affectsSubscription: boolean;
  affectsServiceCharge: boolean;
  affectsListingFee: boolean;
  discountPercent: string;
  billingCycles: number | null;
  isActive: boolean;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: number | null;
  createdAt: Date;
}

const DEFAULT_FORM = {
  code: "",
  description: "",
  affectsSubscription: true,
  affectsServiceCharge: false,
  affectsListingFee: false,
  discountPercent: 10,
  billingCycles: "" as string | number,
  maxRedemptions: "" as string | number,
  expiresAt: "",
  isActive: true,
};

export default function AdminPromoCodes() {
  const utils = trpc.useUtils();
  const { data: codes = [], isLoading } = trpc.promoCodes.list.useQuery();

  const [showCreate, setShowCreate] = useState(false);
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });

  const generateCode = trpc.promoCodes.generateCode.useQuery(undefined, { enabled: false });

  const createMutation = trpc.promoCodes.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Promo code "${data.code}" created`);
      utils.promoCodes.list.invalidate();
      setShowCreate(false);
      setForm({ ...DEFAULT_FORM });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.promoCodes.update.useMutation({
    onSuccess: () => {
      toast.success("Promo code updated");
      utils.promoCodes.list.invalidate();
      setEditingCode(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.promoCodes.delete.useMutation({
    onSuccess: () => {
      toast.success("Promo code deleted");
      utils.promoCodes.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleGenerateCode = async () => {
    const result = await generateCode.refetch();
    if (result.data?.code) {
      setForm((f) => ({ ...f, code: result.data!.code }));
    }
  };

  const handleCreate = () => {
    if (!form.affectsSubscription && !form.affectsServiceCharge && !form.affectsListingFee) {
      toast.error("Select at least one thing the promo code affects");
      return;
    }
    createMutation.mutate({
      code: form.code || undefined,
      description: form.description || undefined,
      affectsSubscription: form.affectsSubscription,
      affectsServiceCharge: form.affectsServiceCharge,
      affectsListingFee: form.affectsListingFee,
      discountPercent: Number(form.discountPercent),
      billingCycles: form.billingCycles !== "" ? Number(form.billingCycles) : undefined,
      maxRedemptions: form.maxRedemptions !== "" ? Number(form.maxRedemptions) : undefined,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : undefined,
    });
  };

  const handleUpdate = () => {
    if (!editingCode) return;
    updateMutation.mutate({
      id: editingCode.id,
      description: form.description || undefined,
      isActive: form.isActive,
      discountPercent: Number(form.discountPercent),
      affectsSubscription: form.affectsSubscription,
      affectsServiceCharge: form.affectsServiceCharge,
      affectsListingFee: form.affectsListingFee,
      billingCycles: form.billingCycles !== "" ? Number(form.billingCycles) : null,
      maxRedemptions: form.maxRedemptions !== "" ? Number(form.maxRedemptions) : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : null,
    });
  };

  const openEdit = (code: PromoCode) => {
    setEditingCode(code);
    setForm({
      code: code.code,
      description: code.description ?? "",
      affectsSubscription: code.affectsSubscription,
      affectsServiceCharge: code.affectsServiceCharge,
      affectsListingFee: code.affectsListingFee,
      discountPercent: Number(code.discountPercent),
      billingCycles: code.billingCycles ?? "",
      maxRedemptions: code.maxRedemptions ?? "",
      expiresAt: code.expiresAt ? new Date(code.expiresAt).toISOString().slice(0, 10) : "",
      isActive: code.isActive,
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Copied "${code}" to clipboard`);
  };

  const scopeBadges = (code: PromoCode) => {
    const badges = [];
    if (code.affectsSubscription) badges.push(<Badge key="sub" variant="outline" className="text-xs border-blue-500/40 text-blue-400">Subscription</Badge>);
    if (code.affectsServiceCharge) badges.push(<Badge key="svc" variant="outline" className="text-xs border-purple-500/40 text-purple-400">Service Charge</Badge>);
    if (code.affectsListingFee) badges.push(<Badge key="lst" variant="outline" className="text-xs border-orange-500/40 text-orange-400">Listing Fee</Badge>);
    return badges;
  };

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Tag className="h-6 w-6 text-amber-400" />
              Promo Codes
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Create discount codes for subscription plans, service charges, and listing fees.
            </p>
          </div>
          <Button onClick={() => { setShowCreate(true); setForm({ ...DEFAULT_FORM }); }} className="gap-2">
            <Plus className="h-4 w-4" />
            New Promo Code
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Codes</p>
            <p className="text-2xl font-bold text-foreground mt-1">{codes.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Active Codes</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{codes.filter((c) => c.isActive).length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Redemptions</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{codes.reduce((sum, c) => sum + c.redemptionCount, 0)}</p>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Applies To</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Redemptions</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading...</TableCell>
                </TableRow>
              )}
              {!isLoading && codes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No promo codes yet. Create one to get started.
                  </TableCell>
                </TableRow>
              )}
              {codes.map((code) => (
                <TableRow key={code.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-amber-400">{code.code}</span>
                      <button onClick={() => copyCode(code.code)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {code.description && <p className="text-xs text-muted-foreground mt-0.5">{code.description}</p>}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-green-400">{Number(code.discountPercent).toFixed(0)}% off</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">{scopeBadges(code)}</div>
                  </TableCell>
                  <TableCell>
                    {code.billingCycles == null ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Infinity className="h-3.5 w-3.5" /> Forever</span>
                    ) : (
                      <span className="text-xs text-foreground">{code.billingCycles} cycle{code.billingCycles !== 1 ? "s" : ""}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-foreground">{code.redemptionCount}</span>
                    {code.maxRedemptions != null && (
                      <span className="text-xs text-muted-foreground"> / {code.maxRedemptions}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {code.expiresAt ? (
                      <span className="text-xs text-muted-foreground">{new Date(code.expiresAt).toLocaleDateString()}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {code.isActive ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-xs">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(code)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-400 hover:text-red-300"
                            onClick={() => {
                              if (confirm(`Delete promo code "${code.code}"?`)) {
                                deleteMutation.mutate({ id: code.id });
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-amber-400" />
                Create Promo Code
              </DialogTitle>
            </DialogHeader>
            <PromoCodeForm form={form} setForm={setForm} onGenerateCode={handleGenerateCode} isCreate />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Code"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editingCode} onOpenChange={(open) => { if (!open) setEditingCode(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-amber-400" />
                Edit Promo Code — <span className="font-mono text-amber-400">{editingCode?.code}</span>
              </DialogTitle>
            </DialogHeader>
            <PromoCodeForm form={form} setForm={setForm} onGenerateCode={handleGenerateCode} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingCode(null)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// ─── Shared Form Component ─────────────────────────────────────────────────
interface FormState {
  code: string;
  description: string;
  affectsSubscription: boolean;
  affectsServiceCharge: boolean;
  affectsListingFee: boolean;
  discountPercent: number;
  billingCycles: string | number;
  maxRedemptions: string | number;
  expiresAt: string;
  isActive: boolean;
}

function PromoCodeForm({
  form,
  setForm,
  onGenerateCode,
  isCreate,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onGenerateCode: () => void;
  isCreate?: boolean;
}) {
  return (
    <div className="space-y-4 py-2">
      {/* Code */}
      {isCreate && (
        <div className="space-y-1.5">
          <Label>Promo Code</Label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. SUMMER25 (leave blank to auto-generate)"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              className="font-mono"
            />
            <Button type="button" variant="outline" size="sm" onClick={onGenerateCode} className="shrink-0 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Generate
            </Button>
          </div>
        </div>
      )}

      {/* Description */}
      <div className="space-y-1.5">
        <Label>Description <span className="text-muted-foreground text-xs">(optional, internal note)</span></Label>
        <Input
          placeholder="e.g. Launch discount for Q1 2026"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>

      {/* Discount % */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5"><Percent className="h-3.5 w-3.5" /> Discount Percentage</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            value={form.discountPercent}
            onChange={(e) => setForm((f) => ({ ...f, discountPercent: Number(e.target.value) }))}
            className="w-28"
          />
          <span className="text-muted-foreground text-sm">% off</span>
        </div>
      </div>

      {/* Applies To */}
      <div className="space-y-2">
        <Label>Applies To <span className="text-red-400 text-xs">*</span></Label>
        <div className="space-y-2 pl-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={form.affectsSubscription}
              onCheckedChange={(v) => setForm((f) => ({ ...f, affectsSubscription: !!v }))}
            />
            <span className="text-sm text-foreground">Monthly subscription price</span>
            <Badge variant="outline" className="text-xs border-blue-500/40 text-blue-400">Subscription</Badge>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={form.affectsServiceCharge}
              onCheckedChange={(v) => setForm((f) => ({ ...f, affectsServiceCharge: !!v }))}
            />
            <span className="text-sm text-foreground">Platform service charge % (per job)</span>
            <Badge variant="outline" className="text-xs border-purple-500/40 text-purple-400">Service Charge</Badge>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={form.affectsListingFee}
              onCheckedChange={(v) => setForm((f) => ({ ...f, affectsListingFee: !!v }))}
            />
            <span className="text-sm text-foreground">Per-listing fee (per job)</span>
            <Badge variant="outline" className="text-xs border-orange-500/40 text-orange-400">Listing Fee</Badge>
          </label>
        </div>
      </div>

      {/* Billing Cycles */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Billing Cycles
          <span className="text-muted-foreground text-xs">(leave blank = applies forever)</span>
        </Label>
        <Input
          type="number"
          min={1}
          placeholder="e.g. 3 (blank = forever)"
          value={form.billingCycles}
          onChange={(e) => setForm((f) => ({ ...f, billingCycles: e.target.value }))}
          className="w-40"
        />
      </div>

      {/* Max Redemptions */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Max Redemptions
          <span className="text-muted-foreground text-xs">(leave blank = unlimited)</span>
        </Label>
        <Input
          type="number"
          min={1}
          placeholder="e.g. 100 (blank = unlimited)"
          value={form.maxRedemptions}
          onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
          className="w-40"
        />
      </div>

      {/* Expiry Date */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Expiry Date
          <span className="text-muted-foreground text-xs">(leave blank = no expiry)</span>
        </Label>
        <Input
          type="date"
          value={form.expiresAt}
          onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
          className="w-48"
        />
      </div>

      {/* Active toggle (edit only) */}
      {!isCreate && (
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={form.isActive}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: !!v }))}
          />
          <span className="text-sm text-foreground">Active (companies can redeem this code)</span>
          {form.isActive ? (
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          ) : (
            <XCircle className="h-4 w-4 text-red-400" />
          )}
        </label>
      )}
    </div>
  );
}
