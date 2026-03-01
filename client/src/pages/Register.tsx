import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ServiceAreaMap } from "@/components/ServiceAreaMap";
import {
  Building2, HardHat, ArrowRight, ArrowLeft, CheckCircle2, Wrench, Loader2,
  Phone, MapPin, Briefcase, Shield, FileText,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

type Step = "choose" | "company-form" | "contractor-form" | "done-company" | "done-contractor";

export default function Register() {
  const { user, loading, refresh } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const roleIntent = params.get("role") as "company" | "contractor" | null;
  const inviteToken = params.get("inviteToken") ?? "";
  const [step, setStep] = useState<Step>(() => {
    if (roleIntent === "company") return "company-form";
    if (roleIntent === "contractor") return "contractor-form";
    return "choose";
  });

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your account...</p>
        </div>
      </div>
    );
  }

  // Already registered — redirect to correct dashboard
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
      <div className="border-b border-border bg-card/50 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wrench className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground">Maintenance Manager</span>
            <span className="text-muted-foreground text-sm">— Create Account</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
              {user.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <span className="hidden sm:inline">{user.name || user.email}</span>
          </div>
        </div>
      </div>

      {/* Progress indicator */}
      {step !== "choose" && step !== "done-company" && step !== "done-contractor" && (
        <div className="border-b border-border bg-background">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Step 1: Choose role</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-foreground font-medium">Step 2: Complete your profile</span>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-12">
        {step === "choose" && (
          <ChooseRole onSelect={(role) => setStep(role === "company" ? "company-form" : "contractor-form")} />
        )}
        {step === "company-form" && (
          <CompanyForm
            userId={user.id}
            onBack={() => setStep("choose")}
            onDone={async () => {
              await refresh();
              setStep("done-company");
            }}
          />
        )}
        {step === "contractor-form" && (
          <ContractorForm
            userId={user.id}
            userName={user.name || ""}
            userEmail={user.email || ""}
            inviteToken={inviteToken || undefined}
            onBack={() => setStep("choose")}
            onDone={async () => {
              await refresh();
              setStep("done-contractor");
            }}
          />
        )}
        {step === "done-company" && (
          <DoneStep
            type="company"
            onContinue={() => setLocation("/company")}
          />
        )}
        {step === "done-contractor" && (
          <DoneStep
            type="contractor"
            onContinue={() => setLocation("/contractor")}
          />
        )}
      </div>
    </div>
  );
}

function ChooseRole({ onSelect }: { onSelect: (role: "company" | "contractor") => void }) {
  return (
    <div>
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-foreground mb-3">
          Welcome! How will you use Maintenance Manager?
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Choose your role to get started. This determines your dashboard and the features available to you.
          You can always contact us if you need to change this later.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {/* Company Card */}
        <Card
          className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 group relative overflow-hidden"
          onClick={() => onSelect("company")}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 to-primary opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="pb-4">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Property Management Company</CardTitle>
            <CardDescription>I manage properties and need contractors to handle maintenance</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 mb-6">
              {[
                "Post and track maintenance requests",
                "Manage your contractor network",
                "GPS-verified time tracking",
                "Automated payments & expense reports",
                "Connect your PM software (Buildium, AppFolio, etc.)",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
            <Button className="w-full gap-2 group-hover:gap-3 transition-all">
              Register as Company <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Contractor Card */}
        <Card
          className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 group relative overflow-hidden"
          onClick={() => onSelect("contractor")}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 to-primary opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="pb-4">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
              <HardHat className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Contractor / Handyman</CardTitle>
            <CardDescription>I fix things and want to find maintenance jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 mb-6">
              {[
                "Browse jobs from multiple companies",
                "Accept jobs matching your trades",
                "Simple clock in/out with GPS",
                "Upload parts receipts on the go",
                "Get paid automatically after completion",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full gap-2 border-primary/30 hover:bg-primary/10 group-hover:gap-3 transition-all">
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
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");

  const createCompany = trpc.company.create.useMutation({
    onSuccess: () => {
      toast.success("Company registered successfully!");
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Company name is required");
      return;
    }
    createCompany.mutate({
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      zipCode: zipCode.trim() || undefined,
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Button variant="ghost" onClick={onBack} className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
        <ArrowLeft className="h-4 w-4" /> Back to role selection
      </Button>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
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
            {/* Company Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Company Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Apex Property Management"
                autoFocus
              />
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Business Email</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="info@yourcompany.com"
                    className="pl-9"
                  />
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="pl-9"
                  />
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="address">Office Address</Label>
              <div className="relative">
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main Street"
                  className="pl-9"
                />
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input id="state" value={state} onChange={(e) => setState(e.target.value)} placeholder="CA" maxLength={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP Code</Label>
                <Input id="zip" value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="90210" />
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full gap-2 h-11" disabled={createCompany.isPending}>
                {createCompany.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating your account...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> Create Company Account</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-3">
                You can add properties and configure settings after registration
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const ALL_TRADES = [
  "General Handyman", "Plumbing", "Electrical", "HVAC",
  "Carpentry", "Painting", "Appliance Repair", "Roofing",
  "Landscaping", "Locksmith", "Pest Control", "Cleaning",
  "Flooring", "Drywall", "Concrete / Masonry", "Pool & Spa",
];

function ContractorForm({
  userId,
  userName,
  userEmail,
  inviteToken,
  onBack,
  onDone,
}: {
  userId: number;
  userName: string;
  userEmail: string;
  inviteToken?: string;
  onBack: () => void;
  onDone: () => void;
}) {
  // Pre-fill first/last name from the account name
  const nameParts = userName.trim().split(" ");
  const [firstName, setFirstName] = useState(nameParts[0] || "");
  const [lastName, setLastName] = useState(nameParts.slice(1).join(" ") || "");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [trades, setTrades] = useState<string[]>([]);
  const [serviceZip, setServiceZip] = useState("");
  const [serviceRadius, setServiceRadius] = useState(25);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [insuranceInfo, setInsuranceInfo] = useState("");

  const setupProfile = trpc.contractor.setupProfile.useMutation({
    onSuccess: () => {
      toast.success("Contractor profile created!");
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleTrade = (trade: string) => {
    setTrades((prev) =>
      prev.includes(trade) ? prev.filter((t) => t !== trade) : [...prev, trade]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trades.length === 0) {
      toast.error("Please select at least one trade");
      return;
    }
    setupProfile.mutate({
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      businessName: businessName.trim() || undefined,
      phone: phone.trim() || undefined,
      trades,
      serviceAreaZips: serviceZip ? [serviceZip] : undefined,
      serviceRadiusMiles: serviceRadius,
      licenseNumber: licenseNumber.trim() || undefined,
      insuranceInfo: insuranceInfo.trim() || undefined,
      inviteToken: inviteToken || undefined,
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Button variant="ghost" onClick={onBack} className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
        <ArrowLeft className="h-4 w-4" /> Back to role selection
      </Button>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
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
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name & Contact */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fname">First Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="fname"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Mike"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lname">Last Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="lname"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Johnson"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bname">Business Name</Label>
                  <div className="relative">
                    <Input
                      id="bname"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g., Mike's Plumbing"
                      className="pl-9"
                    />
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">Optional — leave blank to use your name</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cphone">Phone Number</Label>
                  <div className="relative">
                    <Input
                      id="cphone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="pl-9"
                    />
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </div>

            {/* Trades */}
            <div className="space-y-3">
              <div>
                <Label>
                  Trades & Skills <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Select all that apply — this determines which jobs you'll see on the job board
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ALL_TRADES.map((trade) => (
                  <button
                    key={trade}
                    type="button"
                    onClick={() => toggleTrade(trade)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left ${
                      trades.includes(trade)
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {trade}
                  </button>
                ))}
              </div>
              {trades.length > 0 && (
                <p className="text-xs text-primary font-medium">
                  {trades.length} trade{trades.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>

            {/* Service Area */}
            <div className="space-y-3">
              <Label>Service Area</Label>
              <ServiceAreaMap
                zip={serviceZip}
                radiusMiles={serviceRadius}
                onZipChange={setServiceZip}
                onRadiusChange={setServiceRadius}
              />
            </div>

            {/* Credentials */}
            <div className="space-y-4">
              <Label>Credentials (Optional)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="license" className="text-xs text-muted-foreground font-normal">License Number</Label>
                  <div className="relative">
                    <Input
                      id="license"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder="e.g., C-10 #12345"
                      className="pl-9"
                    />
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insurance" className="text-xs text-muted-foreground font-normal">Insurance Info</Label>
                  <Input
                    id="insurance"
                    value={insuranceInfo}
                    onChange={(e) => setInsuranceInfo(e.target.value)}
                    placeholder="Provider & policy number"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full gap-2 h-11" disabled={setupProfile.isPending}>
                {setupProfile.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating your profile...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> Create Contractor Profile</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-3">
                You can update your profile, trades, and service area at any time
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function DoneStep({ type, onContinue }: { type: "company" | "contractor"; onContinue: () => void }) {
  const isCompany = type === "company";
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="h-10 w-10 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-3">You're All Set!</h2>
      <p className="text-muted-foreground mb-3 max-w-sm mx-auto">
        {isCompany
          ? "Your company account is ready. Start by adding your properties and inviting contractors to your network."
          : "Your contractor profile is live. Head to the job board to browse available jobs in your area."}
      </p>
      <div className="flex flex-col gap-2 items-center mb-8">
        {isCompany ? (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Company account created
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Default hourly rate tiers configured
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Ready to add properties and jobs
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Contractor profile created
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Trades and service area saved
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Ready to browse the job board
            </div>
          </>
        )}
      </div>
      <Button onClick={onContinue} size="lg" className="gap-2 h-12 px-8">
        Go to {isCompany ? "Company Dashboard" : "Job Board"} <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
