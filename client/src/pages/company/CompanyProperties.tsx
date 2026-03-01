import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewAs } from "@/contexts/ViewAsContext";
import { Plus, MapPin, Trash2, Building } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import AddressAutocomplete from "@/components/AddressAutocomplete";

export default function CompanyProperties() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const isAdmin = user?.role === "admin";
  const isImpersonating = isAdmin && viewAs.mode === "company" && !!viewAs.companyId;

  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  // Queries — use adminViewAs when impersonating, regular otherwise
  const regularProps = trpc.properties.list.useQuery(undefined, { enabled: !isImpersonating });
  const viewAsProps = trpc.adminViewAs.companyProperties.useQuery(
    { companyId: viewAs.companyId! },
    { enabled: isImpersonating }
  );

  const properties = isImpersonating ? viewAsProps.data : regularProps.data;
  const isLoading = isImpersonating ? viewAsProps.isLoading : regularProps.isLoading;

  const emptyForm = { name: "", address: "", city: "", state: "", zipCode: "", units: "", lat: "", lng: "" };
  const [form, setForm] = useState(emptyForm);

  // Single mutation — works for both regular users and admin impersonation
  // (admin sends x-impersonate-company-id header automatically via tRPC client)
  const createProperty = trpc.properties.create.useMutation({
    onSuccess: () => {
      toast.success("Property added!");
      utils.properties.list.invalidate();
      utils.adminViewAs.companyProperties.invalidate();
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteProperty = trpc.properties.delete.useMutation({
    onSuccess: () => {
      toast.success("Property removed");
      utils.properties.list.invalidate();
      utils.adminViewAs.companyProperties.invalidate();
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
      // Pass coordinates if autocomplete already resolved them
      latitude: form.lat || undefined,
      longitude: form.lng || undefined,
    });
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
              <Button onClick={handleCreate} disabled={!form.address || createProperty.isPending} className="w-full">
                {createProperty.isPending ? "Adding..." : "Add Property"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
                    <h3 className="font-medium text-card-foreground">{prop.name}</h3>
                    <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{prop.address}{prop.city ? `, ${prop.city}` : ""}{prop.state ? `, ${prop.state}` : ""} {prop.zipCode}</span>
                    </div>
                    {prop.units && <p className="text-xs text-muted-foreground mt-1">{prop.units} units</p>}
                    {prop.latitude && prop.longitude && (
                      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Geocoded
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => deleteProperty.mutate({ id: prop.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
