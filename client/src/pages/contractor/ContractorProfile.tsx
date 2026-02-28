import { trpc } from "@/lib/trpc";
import { useViewAs } from "@/contexts/ViewAsContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Phone, MapPin, Wrench, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const TRADE_OPTIONS = [
  "General Handyman", "Plumbing", "Electrical", "HVAC",
  "Carpentry", "Painting", "Roofing", "Appliance Repair",
  "Locksmith", "Landscaping", "Flooring", "Drywall",
];

export default function ContractorProfile() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const isAdmin = user?.role === "admin";
  const isViewingAsContractor = isAdmin && viewAs.mode === "contractor" && viewAs.contractorProfileId;

  const { data: adminProfile, isLoading: adminLoading } = trpc.adminViewAs.contractorProfile.useQuery(
    { contractorProfileId: viewAs.contractorProfileId! },
    { enabled: !!isViewingAsContractor }
  );

  const { data: myProfile, isLoading: myLoading } = trpc.contractor.getProfile.useQuery(undefined, { enabled: !isViewingAsContractor });

  const profile = isViewingAsContractor ? adminProfile : myProfile;
  const isLoading = isViewingAsContractor ? adminLoading : myLoading;
  const readOnly = !!isViewingAsContractor;

  const updateProfile = trpc.contractor.updateProfile.useMutation({
    onSuccess: () => toast.success("Profile updated!"),
    onError: (err: any) => toast.error(err.message),
  });

  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceAreaZips, setServiceAreaZips] = useState("");
  const [serviceRadiusMiles, setServiceRadiusMiles] = useState("25");
  const [trades, setTrades] = useState<string[]>([]);
  const [isAvailable, setIsAvailable] = useState(true);

  useEffect(() => {
    if (profile) {
      setBusinessName(profile.businessName || "");
      setPhone(profile.phone || "");
      setServiceAreaZips((profile.serviceAreaZips as string[] || []).join(", "));
      setServiceRadiusMiles(String(profile.serviceRadiusMiles ?? 25));
      setTrades(profile.trades as string[] || []);
      setIsAvailable(profile.isAvailable ?? true);
    }
  }, [profile]);

  const toggleTrade = (trade: string) => {
    if (readOnly) return;
    setTrades(prev => prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]);
  };

  if (!isViewingAsContractor && isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Contractor Profile</h1>
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Select a contractor from the "View as Contractor" dropdown above to see their profile.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {readOnly ? `${profile?.businessName || "Contractor"}'s Profile` : "My Profile"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {readOnly ? "Viewing contractor profile (read-only)" : "Manage your contractor profile and availability"}
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground flex items-center gap-2"><User className="h-5 w-5 text-primary" /> Business Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Business Name</Label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your business name" disabled={readOnly} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" disabled={readOnly} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Available for Jobs</Label>
              <p className="text-xs text-muted-foreground">Toggle off to stop receiving new job notifications</p>
            </div>
            <Switch checked={isAvailable} onCheckedChange={setIsAvailable} disabled={readOnly} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" /> Trades & Skills</CardTitle>
          <CardDescription>Select all trades you're qualified to perform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {TRADE_OPTIONS.map((trade) => (
              <Badge
                key={trade}
                variant={trades.includes(trade) ? "default" : "outline"}
                className={`cursor-pointer transition-colors ${trades.includes(trade) ? "bg-primary text-primary-foreground" : "hover:bg-secondary"} ${readOnly ? "pointer-events-none" : ""}`}
                onClick={() => toggleTrade(trade)}
              >
                {trade}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Service Area</CardTitle>
          <CardDescription>Define where you're willing to take jobs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Service Area Zip Codes</Label>
            <Input value={serviceAreaZips} onChange={(e) => setServiceAreaZips(e.target.value)} placeholder="02101, 02102, 02103" disabled={readOnly} />
            <p className="text-xs text-muted-foreground">Comma-separated zip codes</p>
          </div>
          <div className="space-y-2">
            <Label>Service Radius (miles)</Label>
            <Input type="number" value={serviceRadiusMiles} onChange={(e) => setServiceRadiusMiles(e.target.value)} disabled={readOnly} />
          </div>
        </CardContent>
      </Card>

      {!readOnly && (
        <Button
          onClick={() => updateProfile.mutate({
            businessName: businessName || undefined,
            phone: phone || undefined,
            trades,
            serviceAreaZips: serviceAreaZips.split(",").map(z => z.trim()).filter(Boolean),
            serviceRadiusMiles: Number(serviceRadiusMiles),
            isAvailable,
          })}
          disabled={updateProfile.isPending}
          className="w-full"
          size="lg"
        >
          {updateProfile.isPending ? "Saving..." : "Save Profile"}
        </Button>
      )}
    </div>
  );
}
