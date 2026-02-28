import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Wrench, Building2, HardHat, Shield, ArrowRight, Zap, MapPin, CreditCard } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      if (user.role === "admin") setLocation("/admin");
      else if (user.role === "company_admin") setLocation("/company");
      else if (user.role === "contractor") setLocation("/contractor");
      else setLocation("/onboarding");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Wrench className="h-10 w-10 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="container mx-auto px-4 py-20 relative">
          <nav className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wrench className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xl font-semibold text-foreground">Maintenance Manager</span>
            </div>
            <Button onClick={() => { window.location.href = getLoginUrl(); }} variant="outline" className="border-primary/30 text-foreground hover:bg-primary/10">
              Sign In
            </Button>
          </nav>

          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
              Property Maintenance,{" "}
              <span className="text-primary">Automated</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl">
              AI-powered job triage, contractor marketplace, GPS time tracking, and automated payments — all in one platform built for property management companies.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button size="lg" onClick={() => { window.location.href = getLoginUrl(); }} className="gap-2">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard icon={Zap} title="AI Job Triage" description="Maintenance requests are automatically classified by priority and skill tier using AI, so the right contractor gets notified instantly." />
          <FeatureCard icon={MapPin} title="GPS Time Tracking" description="Contractors clock in and out with GPS verification. Auto clock-out when they return home. Full trip logging and geofence validation." />
          <FeatureCard icon={CreditCard} title="Automated Payments" description="Stripe-powered payment splits, escrow holds, and automated payouts. Companies pay through the app, contractors get paid automatically." />
        </div>
      </div>

      {/* Roles */}
      <div className="container mx-auto px-4 py-20">
        <h2 className="text-2xl font-bold text-foreground mb-10 text-center">Built for Everyone in the Chain</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <RoleCard icon={Building2} role="Property Managers" items={["Post maintenance requests", "AI auto-classifies jobs", "Track contractor time via GPS", "Automated payments & reporting"]} />
          <RoleCard icon={HardHat} role="Contractors" items={["Browse available jobs", "Accept jobs & clock in/out", "Upload parts receipts", "Get paid automatically"]} />
          <RoleCard icon={Shield} role="Platform Admin" items={["Manage all companies", "Platform-wide analytics", "Revenue tracking", "System health monitoring"]} />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Maintenance Manager — Property maintenance automation platform
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl bg-card border border-border">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-card-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function RoleCard({ icon: Icon, role, items }: { icon: React.ComponentType<{ className?: string }>; role: string; items: string[] }) {
  return (
    <div className="p-6 rounded-xl bg-card border border-border">
      <div className="flex items-center gap-3 mb-4">
        <Icon className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-card-foreground">{role}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
            <span className="text-primary mt-1">•</span>{item}
          </li>
        ))}
      </ul>
    </div>
  );
}
