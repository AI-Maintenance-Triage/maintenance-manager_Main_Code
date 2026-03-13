import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { HardHat, Calendar, Plus, Star, MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import AddressAutocomplete, { type AddressResult } from "@/components/AddressAutocomplete";

const TRADE_OPTIONS = [
  "General Handyman", "Plumbing", "Electrical", "HVAC",
  "Carpentry", "Painting", "Roofing", "Appliance Repair",
  "Locksmith", "Landscaping", "Flooring", "Drywall",
];

// ─── Create Contractor Dialog ─────────────────────────────────────────────────
function CreateContractorDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [emailVal, setEmailVal] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [serviceZips, setServiceZips] = useState("");
  const [address, setAddress] = useState("");
  const [sendWelcome, setSendWelcome] = useState(true);

  const handleAddressSelect = (result: AddressResult) => {
    setAddress(result.formattedAddress);
  };

  const toggleTrade = (trade: string) => {
    setSelectedTrades(prev =>
      prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]
    );
  };

  const create = trpc.adminViewAs.adminCreateContractor.useMutation({
    onSuccess: () => {
      toast.success("Contractor account created successfully!");
      setName(""); setEmailVal(""); setPassword(""); setBusinessName(""); setPhone(""); setLicenseNumber(""); setSelectedTrades([]); setServiceZips(""); setAddress("");
      onCreated();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

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
          <DialogTitle className="flex items-center gap-2"><HardHat className="h-5 w-5 text-primary" /> Create Contractor Account</DialogTitle>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminContractors() {
  const { data: contractors, isLoading, refetch } = trpc.adminViewAs.allContractors.useQuery();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contractors</h1>
          <p className="text-muted-foreground mt-1">Manage all registered contractors on the platform</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Create Contractor
        </Button>
      </div>

      <CreateContractorDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => refetch()} />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !contractors || contractors.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <HardHat className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-card-foreground mb-2">No Contractors Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              When contractors sign up and create profiles, they'll appear here. Use the "Create Contractor" button above to add one directly.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contractors.map((contractor: any) => (
            <Card key={contractor.id} className="bg-card border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <HardHat className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-card-foreground truncate">
                          {contractor.businessName || contractor.userName || `Contractor #${contractor.id}`}
                        </h3>
                        {contractor.userEmail && (
                          <p className="text-xs text-muted-foreground truncate">{contractor.userEmail}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Joined {new Date(contractor.createdAt).toLocaleDateString()}
                      </span>
                      {contractor.averageRating && (
                        <span className="flex items-center gap-1 text-yellow-400">
                          <Star className="h-3 w-3 fill-current" />
                          {parseFloat(contractor.averageRating).toFixed(1)}
                        </span>
                      )}
                      {contractor.serviceAreaZips && contractor.serviceAreaZips.length > 0 && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {contractor.serviceAreaZips.slice(0, 3).join(", ")}{contractor.serviceAreaZips.length > 3 ? ` +${contractor.serviceAreaZips.length - 3}` : ""}
                        </span>
                      )}
                    </div>
                    {contractor.trades && contractor.trades.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {contractor.trades.slice(0, 5).map((trade: string) => (
                          <Badge key={trade} variant="secondary" className="text-xs px-2 py-0">{trade}</Badge>
                        ))}
                        {contractor.trades.length > 5 && (
                          <Badge variant="secondary" className="text-xs px-2 py-0">+{contractor.trades.length - 5} more</Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge
                      variant={contractor.isAvailable ? "default" : "secondary"}
                      className={contractor.isAvailable ? "bg-green-600/20 text-green-400 border-green-600/30" : ""}
                    >
                      {contractor.isAvailable ? "Available" : "Unavailable"}
                    </Badge>
                    {contractor.completedJobs != null && (
                      <span className="text-xs text-muted-foreground">{contractor.completedJobs} jobs</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
