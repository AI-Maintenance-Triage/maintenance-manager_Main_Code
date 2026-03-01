import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wrench, ArrowRight, Loader2, Eye, EyeOff, Mail, Lock, User, Building2, HardHat } from "lucide-react";
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

export default function SignUp() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const roleIntent = params.get("role") as "company" | "contractor" | null;
  const inviteToken = params.get("inviteToken") ?? "";
  const inviteEmail = params.get("email") ?? "";
  const inviteName = params.get("name") ?? "";
  const inviteCompanyName = params.get("companyName") ?? "";
  const [name, setName] = useState(inviteName);
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!email.trim()) {
      toast.error("Please enter your email");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Registration failed");
        return;
      }

      toast.success("Account created! Let's set up your profile.");
      // After registration, redirect to role selection / onboarding, passing role + invite token if present
      const registerParams = new URLSearchParams();
      if (roleIntent) registerParams.set("role", roleIntent);
      if (inviteToken) registerParams.set("inviteToken", inviteToken);
      const registerQs = registerParams.toString();
      window.location.href = registerQs ? `/register?${registerQs}` : "/register";
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
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

      <div className="max-w-md mx-auto px-4 py-16">
        <Card>
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl">Create your account</CardTitle>
            <CardDescription>
              {inviteCompanyName
                ? `You've been invited by ${inviteCompanyName} — create your contractor account to get started`
                : roleIntent === "company" ? "Create your property management company account"
                : roleIntent === "contractor" ? "Create your contractor account to find maintenance jobs"
                : "Sign up to manage properties or find maintenance jobs"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Smith"
                    className="pl-9"
                    autoFocus
                    autoComplete="name"
                  />
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="pl-9"
                    autoComplete="email"
                  />
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="pl-9 pr-10"
                    autoComplete="new-password"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="pl-9"
                    autoComplete="new-password"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <Button type="submit" className="w-full gap-2 h-11 mt-2" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</>
                ) : (
                  <>Create Account <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-xs text-muted-foreground">
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
