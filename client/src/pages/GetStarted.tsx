import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2, HardHat, ArrowRight, Wrench, CheckCircle2,
} from "lucide-react";
import { useLocation, useSearch } from "wouter";

export default function GetStarted() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preselectedRole = params.get("role") as "company" | "contractor" | null;

  // If role is pre-selected, go directly to signup with that role
  if (preselectedRole === "company" || preselectedRole === "contractor") {
    setLocation(`/signup?role=${preselectedRole}`);
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-semibold text-foreground">Maintenance Manager</span>
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Already have an account?</span>
            <Button variant="ghost" onClick={() => setLocation("/signin")} className="text-primary hover:text-primary/80">
              Sign In
            </Button>
          </div>
        </div>
      </div>

      {/* Role Selection */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-foreground mb-3">
            How will you use Maintenance Manager?
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Choose your role to get started. This determines your dashboard and the features available to you.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Property Management Company */}
          <Card
            className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 group relative overflow-hidden"
            onClick={() => setLocation("/signup?role=company")}
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

          {/* Contractor */}
          <Card
            className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 group relative overflow-hidden"
            onClick={() => setLocation("/signup?role=contractor")}
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
              <Button
                variant="outline"
                className="w-full gap-2 border-primary/30 hover:bg-primary/10 group-hover:gap-3 transition-all"
              >
                Register as Contractor <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          You can always contact us if you need to change your role later.
        </p>
      </div>
    </div>
  );
}
