import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Phone, MapPin, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const TRADE_OPTIONS = [
  "General Handyman", "Plumbing", "Electrical", "HVAC",
  "Carpentry", "Painting", "Roofing", "Appliance Repair",
  "Locksmith", "Landscaping", "Flooring", "Drywall",
];

export default function ContractorProfile() {
  const { data: profile, isLoading } = trpc.contractor.getProfile.useQuery();
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
    setTrades(prev => prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]);
  };

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your contractor profile and availability</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground flex items-center gap-2"><User className="h-5 w-5 text-primary" /> Business Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Business Name</Label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your business name" />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Available for Jobs</Label>
              <p className="text-xs text-muted-foreground">Toggle off to stop receiving new job notifications</p>
            </div>
            <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
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
                className={`cursor-pointer transition-colors ${trades.includes(trade) ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
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
            <Input value={serviceAreaZips} onChange={(e) => setServiceAreaZips(e.target.value)} placeholder="02101, 02102, 02103" />
            <p className="text-xs text-muted-foreground">Comma-separated zip codes</p>
          </div>
          <div className="space-y-2">
            <Label>Service Radius (miles)</Label>
            <Input type="number" value={serviceRadiusMiles} onChange={(e) => setServiceRadiusMiles(e.target.value)} />
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
