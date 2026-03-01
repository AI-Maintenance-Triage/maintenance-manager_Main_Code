import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wrench, ArrowRight, Loader2, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

export default function SignIn() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Please enter your email");
      return;
    }
    if (!password) {
      toast.error("Please enter your password");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Login failed");
        return;
      }

      toast.success("Welcome back!");
      // Full page reload to pick up the new session cookie
      window.location.href = "/";
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
            <span className="text-muted-foreground">Don't have an account?</span>
            <Button variant="ghost" onClick={() => setLocation("/signup")} className="text-primary hover:text-primary/80">
              Sign Up
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-16">
        <Card>
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>
              Sign in to your Maintenance Manager account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    autoFocus
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
                    placeholder="Enter your password"
                    className="pl-9 pr-10"
                    autoComplete="current-password"
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

              {/* Forgot password */}
              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  onClick={() => setLocation("/forgot-password")}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              <Button type="submit" className="w-full gap-2 h-11 mt-2" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>
                ) : (
                  <>Sign In <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            {/* Manus OAuth - for admin access */}
            <Button
              variant="outline"
              className="w-full gap-2 h-11 border-border text-foreground hover:bg-accent"
              onClick={() => { window.location.href = getLoginUrl(); }}
            >
              <Wrench className="h-4 w-4 text-primary" />
              Sign in with Manus (Admin)
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              For platform administrators only
            </p>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button onClick={() => setLocation("/signup")} className="text-primary hover:underline font-medium">
                Create one now
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
