import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Building2, HardHat, ArrowRight, ArrowLeft, CheckCircle2, Wrench, Loader2,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type Step = "choose" | "company-form" | "contractor-form" | "done";

export default function Register() {
  const { user, loading, refresh } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("choose");

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Already registered
  if (user.role === "company_admin") {
    setLocation("/company");
    return null;
  }
  if (user.role === "contractor") {
    setLocation("/contractor");
    return null;
  }
  if (user.role === "admin") {
    setLocation("/admin");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wrench className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-foreground">Maintenance Manager</span>
          <span className="text-muted-foreground text-sm ml-2">— Registration</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        {step === "choose" && <ChooseRole onSelect={(role) => setStep(role === "company" ? "company-form" : "contractor-form")} />}
        {step === "company-form" && <CompanyForm userId={user.id} onBack={() => setStep("choose")} onDone={() => { refresh(); setStep("done"); }} />}
        {step === "contractor-form" && <ContractorForm userId={user.id} userName={user.name || ""} userEmail={user.email || ""} onBack={() => setStep("choose")} onDone={() => { refresh(); setStep("done"); }} />}
        {step === "done" && <DoneStep role={user.role} onContinue={() => {
          if (user.role === "company_admin") setLocation("/company");
          else if (user.role === "contractor") setLocation("/contractor");
          else window.location.reload();
        }} />}
      </div>
    </div>
  );
}

function ChooseRole({ onSelect }: { onSelect: (role: "company" | "contractor") => void }) {
  return (
    <div>
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-foreground mb-3">Welcome! How will you use Maintenance Manager?</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">Choose your role to get started. This determines your dashboard experience and the features available to you.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 group" onClick={() => onSelect("company")}>
          <CardHeader className="pb-4">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Property Management Company</CardTitle>
            <CardDescription>I manage properties and need contractors to handle maintenance</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[
                "Post maintenance requests",
                "Manage contractor network",
                "Track jobs with GPS verification",
                "Automated payments & reporting",
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <Button className="w-full mt-6 gap-2">
              Register as Company <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 group" onClick={() => onSelect("contractor")}>
          <CardHeader className="pb-4">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
              <HardHat className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Contractor / Handyman</CardTitle>
            <CardDescription>I fix things and want to find maintenance jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[
                "Browse available jobs",
                "Accept jobs matching your skills",
                "Clock in/out with GPS tracking",
                "Get paid automatically",
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full mt-6 gap-2 border-primary/30 hover:bg-primary/10">
              Register as Contractor <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CompanyForm({ userId, onBack, onDone }: { userId: number; onBack: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");

  const createCompany = trpc.company.create.useMutation({
    onSuccess: () => {
      toast.success("Company registered successfully!");
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Company name is required"); return; }
    createCompany.mutate({ name: name.trim(), address: address.trim() || undefined, city: city.trim() || undefined, state: state.trim() || undefined, zipCode: zipCode.trim() || undefined, phone: phone.trim() || undefined, website: website.trim() || undefined });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Button variant="ghost" onClick={onBack} className="mb-6 gap-2 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Register Your Company</CardTitle>
              <CardDescription>Tell us about your property management company</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Company Name <span className="text-destructive">*</span></Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Apex Property Management" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Office Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main Street" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input id="state" value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP Code</Label>
                <Input id="zip" value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="12345" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourcompany.com" />
            </div>

            <Button type="submit" className="w-full gap-2" disabled={createCompany.isPending}>
              {createCompany.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Create Company
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ContractorForm({ userId, userName, userEmail, onBack, onDone }: { userId: number; userName: string; userEmail: string; onBack: () => void; onDone: () => void }) {
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [trades, setTrades] = useState<string[]>([]);
  const [serviceZips, setServiceZips] = useState("");
  const [serviceRadius, setServiceRadius] = useState("25");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [insuranceInfo, setInsuranceInfo] = useState("");

  const allTrades = [
    "General Handyman", "Plumbing", "Electrical", "HVAC",
    "Carpentry", "Painting", "Appliance Repair", "Roofing",
    "Landscaping", "Locksmith", "Pest Control", "Cleaning",
  ];

  const setupProfile = trpc.contractor.setupProfile.useMutation({
    onSuccess: () => {
      toast.success("Contractor profile created!");
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleTrade = (trade: string) => {
    setTrades((prev) => prev.includes(trade) ? prev.filter((t) => t !== trade) : [...prev, trade]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trades.length === 0) { toast.error("Select at least one trade"); return; }
    setupProfile.mutate({
      businessName: businessName.trim() || undefined,
      phone: phone.trim() || undefined,
      trades,
      serviceAreaZips: serviceZips.trim() ? serviceZips.split(",").map((z) => z.trim()) : undefined,
      serviceRadiusMiles: parseInt(serviceRadius) || 25,
      licenseNumber: licenseNumber.trim() || undefined,
      insuranceInfo: insuranceInfo.trim() || undefined,
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Button variant="ghost" onClick={onBack} className="mb-6 gap-2 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <HardHat className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Create Your Contractor Profile</CardTitle>
              <CardDescription>Tell us about your skills and service area</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="bname">Business Name</Label>
              <Input id="bname" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g., Mike's Plumbing Services" />
              <p className="text-xs text-muted-foreground">Optional — leave blank if you operate under your own name</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cphone">Phone Number</Label>
              <Input id="cphone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
            </div>

            <div className="space-y-2">
              <Label>Trades & Skills <span className="text-destructive">*</span></Label>
              <p className="text-xs text-muted-foreground mb-2">Select all that apply — this determines which jobs you'll see</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {allTrades.map((trade) => (
                  <button
                    key={trade}
                    type="button"
                    onClick={() => toggleTrade(trade)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                      trades.includes(trade)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {trade}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zips">Service Area ZIP Codes</Label>
                <Input id="zips" value={serviceZips} onChange={(e) => setServiceZips(e.target.value)} placeholder="10001, 10002, 10003" />
                <p className="text-xs text-muted-foreground">Comma-separated</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="radius">Service Radius (miles)</Label>
                <Input id="radius" type="number" value={serviceRadius} onChange={(e) => setServiceRadius(e.target.value)} placeholder="25" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="license">License Number</Label>
              <Input id="license" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="Optional — for licensed trades" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="insurance">Insurance Information</Label>
              <Textarea id="insurance" value={insuranceInfo} onChange={(e) => setInsuranceInfo(e.target.value)} placeholder="Optional — insurance provider and policy number" rows={2} />
            </div>

            <Button type="submit" className="w-full gap-2" disabled={setupProfile.isPending}>
              {setupProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Create Profile
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function DoneStep({ role, onContinue }: { role: string | null; onContinue: () => void }) {
  return (
    <div className="max-w-lg mx-auto text-center py-12">
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-3">You're All Set!</h2>
      <p className="text-muted-foreground mb-8">
        Your account has been created. Click below to go to your dashboard.
      </p>
      <Button onClick={onContinue} className="gap-2">
        Go to Dashboard <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
