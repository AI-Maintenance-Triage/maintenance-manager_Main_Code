import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewAs } from "@/contexts/ViewAsContext";
import { Plus, MapPin, Trash2, Building, ArrowUpRight, MoreVertical, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const emptyForm = { name: "", address: "", city: "", state: "", zipCode: "", units: "", lat: "", lng: "", propertyType: "single_family" as string };

const PROPERTY_TYPE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  single_family: { label: "Single Family", variant: "secondary" },
  multi_family: { label: "Multi Family", variant: "default" },
  commercial: { label: "Commercial", variant: "outline" },
  other: { label: "Other", variant: "outline" },
};

export default function CompanyProperties() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin";
  const isImpersonating = isAdmin && viewAs.mode === "company" && !!viewAs.companyId;

  const [open, setOpen] = useState(false);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitMessage, setLimitMessage] = useState("");

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editingProp, setEditingProp] = useState<any>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  // Delete confirm state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingPropId, setDeletingPropId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Queries — use adminViewAs when impersonating, regular otherwise
  const regularProps = trpc.properties.list.useQuery(undefined, { enabled: !isImpersonating });
  const viewAsProps = trpc.adminViewAs.companyProperties.useQuery(
    { companyId: viewAs.companyId! },
    { enabled: isImpersonating }
  );

  const properties = isImpersonating ? viewAsProps.data : regularProps.data;
  const isLoading = isImpersonating ? viewAsProps.isLoading : regularProps.isLoading;

  const [form, setForm] = useState(emptyForm);

  const invalidateProps = () => {
    utils.properties.list.invalidate();
    utils.adminViewAs.companyProperties.invalidate();
  };

  const createProperty = trpc.properties.create.useMutation({
    onSuccess: () => {
      toast.success("Property added!");
      invalidateProps();
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      if (
        err?.data?.code === "FORBIDDEN" ||
        err?.message?.toLowerCase().includes("maximum") ||
        err?.message?.toLowerCase().includes("plan")
      ) {
        setLimitMessage(err.message);
        setLimitDialogOpen(true);
      } else {
        toast.error(err.message);
      }
    },
  });

  const updateProperty = trpc.properties.update.useMutation({
    onSuccess: () => {
      toast.success("Property updated!");
      invalidateProps();
      setEditOpen(false);
      setEditingProp(null);
      setEditForm(emptyForm);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteProperty = trpc.properties.delete.useMutation({
    onSuccess: () => {
      toast.success("Property removed");
      invalidateProps();
      setDeleteConfirmOpen(false);
      setDeletingPropId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreate = () => {
    createProperty.mutate({
      name: form.name || undefined,
      address: form.address,
      city: form.city || undefined,
      state: form.state || undefined,
      zipCode: form.zipCode || undefined,
      units: form.units ? Number(form.units) : undefined,
      latitude: form.lat || undefined,
      longitude: form.lng || undefined,
      propertyType: form.propertyType as any || undefined,
    });
  };

  const openEdit = (prop: any) => {
    setEditingProp(prop);
    setEditForm({
      name: prop.name ?? "",
      address: prop.address ?? "",
      city: prop.city ?? "",
      state: prop.state ?? "",
      zipCode: prop.zipCode ?? "",
      units: prop.units ? String(prop.units) : "",
      lat: prop.latitude ? String(prop.latitude) : "",
      lng: prop.longitude ? String(prop.longitude) : "",
      propertyType: prop.propertyType ?? "single_family",
    });
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editingProp) return;
    updateProperty.mutate({
      id: editingProp.id,
      name: editForm.name || undefined,
      address: editForm.address || undefined,
      city: editForm.city || undefined,
      state: editForm.state || undefined,
      zipCode: editForm.zipCode || undefined,
      units: editForm.units ? Number(editForm.units) : undefined,
      latitude: editForm.lat || undefined,
      longitude: editForm.lng || undefined,
      propertyType: editForm.propertyType as any || undefined,
    });
  };

  const confirmDelete = (id: number) => {
    setDeletingPropId(id);
    setDeleteConfirmOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Properties</h1>
          <p className="text-muted-foreground mt-1">
            {isImpersonating ? `Managing properties for ${viewAs.companyName}` : "Manage your property portfolio"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add Property</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-card">
            <DialogHeader><DialogTitle className="text-card-foreground">Add Property</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Property Name <span className="text-muted-foreground text-xs">(optional — defaults to address)</span></Label>
                <Input placeholder="e.g. Sunset Apartments" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Address <span className="text-destructive">*</span></Label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={(val) => setForm({ ...form, address: val })}
                  onSelect={(result) => setForm({
                    ...form,
                    address: result.street || result.formattedAddress,
                    city: result.city,
                    state: result.state,
                    zipCode: result.zipCode,
                    lat: result.lat,
                    lng: result.lng,
                  })}
                  placeholder="Start typing an address..."
                />
                {form.lat && (
                  <p className="text-xs text-emerald-500 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Location confirmed ({parseFloat(form.lat).toFixed(4)}, {parseFloat(form.lng).toFixed(4)})
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input placeholder="Boston" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input placeholder="MA" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Zip</Label>
                  <Input placeholder="02101" value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Number of Units</Label>
                <Input type="number" placeholder="12" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Property Type</Label>
                <Select value={form.propertyType} onValueChange={(v) => setForm({ ...form, propertyType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_family">Single Family</SelectItem>
                    <SelectItem value="multi_family">Multi Family</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={!form.address || createProperty.isPending} className="w-full">
                {createProperty.isPending ? "Adding..." : "Add Property"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Plan limit upgrade dialog */}
      <AlertDialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-primary" /> Property Limit Reached
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">{limitMessage}</span>
              <span className="block text-muted-foreground text-xs">
                Upgrade your plan to add more properties and unlock additional features.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not Now</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setLimitDialogOpen(false);
                setOpen(false);
                setLocation("/company/billing");
              }}
            >
              <ArrowUpRight className="h-4 w-4 mr-2" /> View Plans & Upgrade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit property dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditingProp(null); setEditForm(emptyForm); } }}>
        <DialogContent className="max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle className="text-card-foreground">Edit Property</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Property Name</Label>
              <Input placeholder="e.g. Sunset Apartments" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <AddressAutocomplete
                value={editForm.address}
                onChange={(val) => setEditForm({ ...editForm, address: val })}
                onSelect={(result) => setEditForm({
                  ...editForm,
                  address: result.street || result.formattedAddress,
                  city: result.city,
                  state: result.state,
                  zipCode: result.zipCode,
                  lat: result.lat,
                  lng: result.lng,
                })}
                placeholder="Start typing an address..."
              />
              {editForm.lat && (
                <p className="text-xs text-emerald-500 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Location confirmed ({parseFloat(editForm.lat).toFixed(4)}, {parseFloat(editForm.lng).toFixed(4)})
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input placeholder="Boston" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input placeholder="MA" value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Zip</Label>
                <Input placeholder="02101" value={editForm.zipCode} onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Number of Units</Label>
              <Input type="number" placeholder="12" value={editForm.units} onChange={(e) => setEditForm({ ...editForm, units: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Property Type</Label>
              <Select value={editForm.propertyType} onValueChange={(v) => setEditForm({ ...editForm, propertyType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_family">Single Family</SelectItem>
                  <SelectItem value="multi_family">Multi Family</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setEditOpen(false); setEditingProp(null); setEditForm(emptyForm); }}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={updateProperty.isPending} className="flex-1">
                {updateProperty.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Property?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the property and cannot be undone. Jobs associated with this property will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingPropId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingPropId !== null && deleteProperty.mutate({ id: deletingPropId })}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Remove Property
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : !properties || properties.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <Building className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No properties yet. Add your first property to start creating maintenance jobs.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {properties.map((prop: any) => (
            <Card key={prop.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-card-foreground">{prop.name}</h3>
                      {prop.propertyType && (() => {
                        const pt = PROPERTY_TYPE_LABELS[prop.propertyType] ?? { label: prop.propertyType, variant: "outline" as const };
                        return <Badge variant={pt.variant} className="text-xs">{pt.label}</Badge>;
                      })()}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{prop.address}{prop.city ? `, ${prop.city}` : ""}{prop.state ? `, ${prop.state}` : ""} {prop.zipCode}</span>
                    </div>
                    {prop.units && prop.units > 1 && <p className="text-xs text-muted-foreground mt-1">{prop.units} units</p>}
                    {prop.latitude && prop.longitude && (
                      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Geocoded ({parseFloat(String(prop.latitude)).toFixed(4)}, {parseFloat(String(prop.longitude)).toFixed(4)})
                      </p>
                    )}
                  </div>
                  {/* 3-dot menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Property options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => openEdit(prop)} className="gap-2 cursor-pointer">
                        <Pencil className="h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => confirmDelete(prop.id)}
                        className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
