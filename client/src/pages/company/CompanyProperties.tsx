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

  const [form, setForm] = useState({ name: "", address: "", city: "", state: "", zipCode: "", units: "" });

  // Regular create mutation
  const createPropertyRegular = trpc.properties.create.useMutation({
    onSuccess: () => {
      toast.success("Property added!");
      utils.properties.list.invalidate();
      setOpen(false);
      setForm({ name: "", address: "", city: "", state: "", zipCode: "", units: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Admin impersonation create mutation
  const createPropertyAdmin = trpc.adminViewAs.createProperty.useMutation({
    onSuccess: () => {
      toast.success("Property added!");
      utils.adminViewAs.companyProperties.invalidate();
      setOpen(false);
      setForm({ name: "", address: "", city: "", state: "", zipCode: "", units: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteProperty = trpc.properties.delete.useMutation({
    onSuccess: () => {
      toast.success("Property removed");
      utils.properties.list.invalidate();
      utils.adminViewAs.companyProperties.invalidate();
    },
  });

  const handleCreate = () => {
    const payload = {
      name: form.name || undefined,
      address: form.address,
      city: form.city || undefined,
      state: form.state || undefined,
      zipCode: form.zipCode || undefined,
      units: form.units ? Number(form.units) : undefined,
    };
    if (isImpersonating) {
      createPropertyAdmin.mutate({ companyId: viewAs.companyId!, ...payload, name: form.name || form.address });
    } else {
      createPropertyRegular.mutate(payload);
    }
  };

  const isPending = isImpersonating ? createPropertyAdmin.isPending : createPropertyRegular.isPending;

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
                <Input placeholder="123 Main Street" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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
              <Button onClick={handleCreate} disabled={!form.address || isPending} className="w-full">
                {isPending ? "Adding..." : "Add Property"}
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
