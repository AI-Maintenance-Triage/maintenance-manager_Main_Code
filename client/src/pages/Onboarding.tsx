import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Building2, HardHat, Wrench } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Onboarding() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"choose" | "company" | "contractor">("choose");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");

  const createCompany = trpc.company.create.useMutation({
    onSuccess: () => {
      toast.success("Company created! Redirecting...");
      setTimeout(() => window.location.href = "/company", 1000);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createContractorProfile = trpc.contractor.setupProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile created! Redirecting...");
      setTimeout(() => window.location.href = "/contractor", 1000);
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (loading) return null;
  if (!user) {
    setLocation("/");
    return null;
  }

  if (step === "choose") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-10">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Wrench className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Welcome to Maintenance Manager</h1>
            <p className="text-muted-foreground">How would you like to use the platform?</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="cursor-pointer hover:border-primary/50 transition-colors bg-card" onClick={() => setStep("company")}>
              <CardHeader className="text-center pb-2">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-card-foreground">Property Manager</CardTitle>
                <CardDescription>I manage properties and need contractors for maintenance</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button variant="outline" className="w-full">Set Up Company</Button>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors bg-card" onClick={() => setStep("contractor")}>
              <CardHeader className="text-center pb-2">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <HardHat className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-card-foreground">Contractor</CardTitle>
                <CardDescription>I provide maintenance services and want to find jobs</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button variant="outline" className="w-full">Create Profile</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (step === "company") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-card">
          <CardHeader>
            <CardTitle className="text-card-foreground">Set Up Your Company</CardTitle>
            <CardDescription>Tell us about your property management company</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input placeholder="e.g. Apex Property Management" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep("choose")} className="flex-1">Back</Button>
              <Button
                onClick={() => createCompany.mutate({ name: companyName, phone })}
                disabled={!companyName || createCompany.isPending}
                className="flex-1"
              >
                {createCompany.isPending ? "Creating..." : "Create Company"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-card">
        <CardHeader>
          <CardTitle className="text-card-foreground">Create Contractor Profile</CardTitle>
          <CardDescription>Set up your contractor profile to start finding jobs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setStep("choose")} className="flex-1">Back</Button>
            <Button
              onClick={() => createContractorProfile.mutate({ phone })}
              disabled={createContractorProfile.isPending}
              className="flex-1"
            >
              {createContractorProfile.isPending ? "Creating..." : "Create Profile"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
