import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const requestReset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err) => {
      toast.error("Something went wrong", { description: err.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    requestReset.mutate({ email: email.trim(), origin: window.location.origin });
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="bg-card border-border w-full max-w-md">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-card-foreground mb-2">Check your email</h2>
            <p className="text-sm text-muted-foreground mb-6">
              If an account exists for <strong>{email}</strong>, we've sent a password reset link. 
              It expires in 1 hour.
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Didn't receive it? Check your spam folder, or{" "}
              <button
                onClick={() => setSubmitted(false)}
                className="text-primary hover:underline"
              >
                try again
              </button>.
            </p>
            <Button variant="outline" onClick={() => navigate("/")} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="bg-card border-border w-full max-w-md">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl text-card-foreground">Forgot password?</CardTitle>
              <CardDescription>We'll send you a reset link</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-card-foreground">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="bg-background border-border text-foreground"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={requestReset.isPending || !email.trim()}
            >
              {requestReset.isPending ? "Sending..." : "Send reset link"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
