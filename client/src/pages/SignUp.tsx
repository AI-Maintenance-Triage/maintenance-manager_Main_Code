import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wrench, ArrowRight, Loader2, Eye, EyeOff, Mail, Lock, User, ShieldCheck, RefreshCw } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

type Step = "register" | "verify";

export default function SignUp() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const roleIntent = params.get("role") as "company" | "contractor" | null;
  const inviteToken = params.get("inviteToken") ?? "";
  const inviteEmail = params.get("email") ?? "";
  const inviteName = params.get("name") ?? "";
  const inviteCompanyName = params.get("companyName") ?? "";

  const [step, setStep] = useState<Step>("register");
  const [name, setName] = useState(inviteName);
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Verification step state
  const [userId, setUserId] = useState<number | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Password strength calculation
  const getPasswordStrength = (pwd: string): { score: number; label: string; color: string } => {
    if (!pwd) return { score: 0, label: "", color: "" };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { score, label: "Weak", color: "bg-red-500" };
    if (score <= 2) return { score, label: "Fair", color: "bg-yellow-500" };
    if (score <= 3) return { score, label: "Good", color: "bg-blue-500" };
    return { score, label: "Strong", color: "bg-green-500" };
  };
  const passwordStrength = getPasswordStrength(password);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Please enter your name"); return; }
    if (!email.trim()) { toast.error("Please enter your email"); return; }
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { toast.error("Passwords do not match"); return; }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Registration failed");
        return;
      }
      if (data.requiresVerification) {
        setUserId(data.userId);
        setVerifiedEmail(data.email);
        setStep("verify");
        setResendCooldown(60);
        toast.success("Check your email for a 6-digit verification code.");
      } else {
        // Fallback: no verification needed (shouldn't happen in normal flow)
        redirectAfterAuth();
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    // Auto-advance
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    // Auto-submit when all 6 digits entered
    if (digit && index === 5 && newCode.every(d => d !== "")) {
      submitCode(newCode.join(""));
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      submitCode(pasted);
    }
  };

  const submitCode = async (codeStr: string) => {
    if (!userId) return;
    setIsVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: codeStr }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Verification failed");
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }
      toast.success("Email verified! Setting up your profile...");
      redirectAfterAuth();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const codeStr = code.join("");
    if (codeStr.length !== 6) { toast.error("Please enter the full 6-digit code"); return; }
    submitCode(codeStr);
  };

  const handleResend = async () => {
    if (!userId || resendCooldown > 0) return;
    setIsResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to resend code"); return; }
      toast.success("A new code has been sent to your email.");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      setResendCooldown(60);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const redirectAfterAuth = () => {
    const registerParams = new URLSearchParams();
    if (roleIntent) registerParams.set("role", roleIntent);
    if (inviteToken) registerParams.set("inviteToken", inviteToken);
    const qs = registerParams.toString();
    window.location.href = qs ? `/register?${qs}` : "/register";
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
        {step === "register" ? (
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
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <div className="relative">
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" className="pl-9" autoFocus autoComplete="name" />
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="pl-9" autoComplete="email" />
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="pl-9 pr-10" autoComplete="new-password" />
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {password.length > 0 && (
                    <div className="space-y-1 mt-1.5">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                              passwordStrength.score >= i ? passwordStrength.color : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <p className={`text-xs font-medium ${
                        passwordStrength.label === "Weak" ? "text-red-500" :
                        passwordStrength.label === "Fair" ? "text-yellow-500" :
                        passwordStrength.label === "Good" ? "text-blue-500" : "text-green-500"
                      }`}>{passwordStrength.label}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <Input id="confirm-password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" className="pl-9" autoComplete="new-password" />
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <Button type="submit" className="w-full gap-2 h-11 mt-2" disabled={isLoading}>
                  {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</> : <>Create Account <ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>
              <div className="mt-6 text-center text-xs text-muted-foreground">
                By creating an account, you agree to our Terms of Service and Privacy Policy.
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-3">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="h-7 w-7 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl">Verify your email</CardTitle>
              <CardDescription>
                We sent a 6-digit code to <strong className="text-foreground">{verifiedEmail}</strong>. Enter it below to activate your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerifySubmit} className="space-y-6">
                {/* 6-digit code input */}
                <div className="flex justify-center gap-2" onPaste={handleCodePaste}>
                  {code.map((digit, i) => (
                    <Input
                      key={i}
                      ref={el => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(i, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(i, e)}
                      className="w-12 h-14 text-center text-xl font-bold tracking-widest"
                      autoFocus={i === 0}
                    />
                  ))}
                </div>

                <Button type="submit" className="w-full gap-2 h-11" disabled={isVerifying || code.join("").length !== 6}>
                  {isVerifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</> : <><ShieldCheck className="h-4 w-4" /> Verify Email</>}
                </Button>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">Didn't receive the code?</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResend}
                    disabled={isResending || resendCooldown > 0}
                    className="gap-2 text-primary hover:text-primary/80"
                  >
                    {isResending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  The code expires in 15 minutes. Check your spam folder if you don't see it.
                </p>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
