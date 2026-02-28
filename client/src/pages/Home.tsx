import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import {
  Wrench, Building2, HardHat, ArrowRight, Zap, MapPin,
  CreditCard, Clock, Shield, BarChart3, Bell, CheckCircle2,
  Globe, Users, FileText, Star,
} from "lucide-react";
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
      else setLocation("/register");
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
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-semibold text-foreground">Maintenance Manager</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => { window.location.href = getLoginUrl(); }} className="text-muted-foreground hover:text-foreground">
              Sign In
            </Button>
            <Button onClick={() => { window.location.href = getLoginUrl(); }} className="gap-2">
              Get Started <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-primary/4" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Zap className="h-3.5 w-3.5" />
              AI-Powered Maintenance Automation
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6 leading-tight">
              Property Maintenance,{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Fully Automated
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
              From tenant request to contractor payment — AI classifies jobs, GPS tracks time, 
              and payments flow automatically. Built for property management companies who want 
              to stop chasing contractors and start scaling.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button size="lg" onClick={() => { window.location.href = getLoginUrl(); }} className="gap-2 h-12 px-8 text-base">
                Start Free <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="h-12 px-8 text-base border-border text-foreground hover:bg-accent">
                See How It Works
              </Button>
            </div>
            <div className="flex items-center gap-6 mt-10 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Free during beta</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Setup in minutes</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Four steps from tenant complaint to paid contractor — most of it happens automatically.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", icon: Bell, title: "Request Comes In", desc: "Tenant submits a maintenance request through your property management software, or you create one manually." },
              { step: "02", icon: Zap, title: "AI Classifies It", desc: "Our AI reads the description, assigns priority (emergency, high, medium, low), and determines the skill tier and hourly rate." },
              { step: "03", icon: HardHat, title: "Contractor Accepts", desc: "Qualified contractors in your network get notified. They accept the job, clock in with GPS, and get to work." },
              { step: "04", icon: CreditCard, title: "Auto Payment", desc: "When the job is done, time is verified via GPS, and payment flows automatically — contractor gets paid, you get your fee." },
            ].map((item) => (
              <div key={item.step} className="relative">
                <div className="text-5xl font-bold text-primary/10 mb-4">{item.step}</div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">Everything You Need</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">A complete platform for managing maintenance at scale — from a single duplex to thousands of units.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard icon={Zap} title="AI Job Classification" description="Automatically categorizes jobs by trade, priority, and skill level. Assigns the right hourly rate tier based on job complexity." />
            <FeatureCard icon={MapPin} title="GPS Time Tracking" description="Contractors clock in/out with GPS verification. Auto clock-out when they return home. Full trip timeline with geofence validation." />
            <FeatureCard icon={CreditCard} title="Automated Payments" description="Stripe-powered marketplace. Escrow holds on acceptance, auto-split on completion. Companies pay, contractors get paid, you earn your fee." />
            <FeatureCard icon={Clock} title="Smart Time Policies" description="Configure billable time rules — on-site only, full trip, or hybrid. Set geofence radius, auto clock-out timers, and max session limits." />
            <FeatureCard icon={Globe} title="Software Integrations" description="Connect Buildium, AppFolio, Rent Manager, Yardi, and more. Self-service setup wizard pulls maintenance requests automatically." />
            <FeatureCard icon={BarChart3} title="Financial Reporting" description="Per-property expense reports, contractor income dashboards, payment history, and automated 1099-K generation at year end." />
            <FeatureCard icon={Users} title="Contractor Marketplace" description="Contractors sign up once and connect to multiple companies. Profiles include trades, service area, licenses, and performance ratings." />
            <FeatureCard icon={FileText} title="Parts & Receipts" description="Contractors photograph and upload receipts. Companies review and approve with configurable markup percentages." />
            <FeatureCard icon={Shield} title="Configurable Skill Tiers" description="Set your own hourly rates by skill level — General, Skilled, Specialty, Emergency. Each with customizable rates and multipliers." />
          </div>
        </div>
      </section>

      {/* Two Audiences */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">Built for Both Sides</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Whether you manage properties or fix them, Maintenance Manager works for you.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 rounded-2xl bg-card border border-border">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-card-foreground">Property Managers</h3>
                  <p className="text-sm text-muted-foreground">Automate your maintenance workflow</p>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  "AI auto-classifies every maintenance request",
                  "GPS-verified contractor time tracking",
                  "Automated payments through the platform",
                  "Per-property expense reports and analytics",
                  "Connect your existing PM software",
                  "Customizable hourly rate tiers",
                  "Contractor performance benchmarking",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button onClick={() => { window.location.href = getLoginUrl(); }} className="w-full mt-8 gap-2">
                Register as Property Manager <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-8 rounded-2xl bg-card border border-border">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <HardHat className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-card-foreground">Contractors & Handymen</h3>
                  <p className="text-sm text-muted-foreground">Find jobs and get paid faster</p>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  "Browse jobs from multiple companies",
                  "Accept jobs that match your skills",
                  "Simple clock in/out with GPS",
                  "Upload parts receipts on the go",
                  "Get paid automatically after job completion",
                  "Build your reputation with ratings",
                  "Set your availability and service area",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button onClick={() => { window.location.href = getLoginUrl(); }} variant="outline" className="w-full mt-8 gap-2 border-primary/30 text-foreground hover:bg-primary/10">
                Register as Contractor <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-16 bg-card/30 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <StatBlock value="100%" label="Automated Payments" />
            <StatBlock value="AI" label="Job Classification" />
            <StatBlock value="GPS" label="Time Verification" />
            <StatBlock value="24/7" label="Always Running" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="flex -space-x-1">
              {[Star, Star, Star, Star, Star].map((Icon, i) => (
                <Icon key={i} className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              ))}
            </div>
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-4">Ready to Automate Your Maintenance?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join property managers who are saving hours every week by letting AI handle job classification, 
            GPS handle time tracking, and Stripe handle payments.
          </p>
          <Button size="lg" onClick={() => { window.location.href = getLoginUrl(); }} className="gap-2 h-12 px-8 text-base">
            Get Started Free <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Maintenance Manager</span>
          </div>
          <p className="text-sm text-muted-foreground">Property maintenance automation platform</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-base font-semibold text-card-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-primary mb-1">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
