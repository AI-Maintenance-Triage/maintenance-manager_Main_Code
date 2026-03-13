import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Wrench, CheckCircle2, XCircle, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/**
 * Landing page for company team invitation links.
 * URL: /team-invite/:token
 *
 * 1. Validates the token server-side.
 * 2. Shows a form to set name + password (if new user) or just confirms for existing users.
 * 3. On submit, calls team.acceptInvitation — which creates the account (if needed),
 *    adds them to the company, and issues a session cookie.
 * 4. Redirects to /company dashboard.
 */
export default function TeamInviteAccept() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const [, setLocation] = useLocation();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(false);

  const { data, isLoading, error } = trpc.team.validateInviteToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const acceptMutation = trpc.team.acceptInvitation.useMutation({
    onSuccess: () => {
      setAccepted(true);
      setTimeout(() => {
        // Hard navigate to force a full auth context reload
        window.location.href = "/company";
      }, 1800);
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to accept invitation. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    acceptMutation.mutate({ token, name: name.trim(), password });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wrench className="h-5 w-5 text-primary" />
          </div>
          <span className="text-lg font-semibold text-foreground">Maintenance Manager</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md bg-card border-border">
          <CardContent className="p-8">
            {isLoading && (
              <div className="text-center">
                <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">Validating your invitation…</h2>
                <p className="text-muted-foreground text-sm">Just a moment while we check your invitation.</p>
              </div>
            )}

            {!isLoading && error && (
              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                  <XCircle className="h-8 w-8 text-red-400" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Invitation Unavailable</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  {(error as any)?.message ?? "This invitation link is no longer valid. It may have expired or been revoked."}
                </p>
                <Button variant="ghost" onClick={() => setLocation("/")} className="text-muted-foreground">
                  Go to Homepage
                </Button>
              </div>
            )}

            {!isLoading && accepted && (
              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Welcome to the team!</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  You've joined <strong className="text-foreground">{data?.companyName}</strong>. Redirecting you to the dashboard…
                </p>
                <div className="flex justify-center">
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                </div>
              </div>
            )}

            {!isLoading && data?.valid && !accepted && (
              <>
                <div className="text-center mb-6">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Users className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground mb-1">You're invited!</h2>
                  <p className="text-muted-foreground text-sm">
                    Join <strong className="text-foreground">{data.companyName}</strong> as a team{" "}
                    <span className="capitalize">{data.teamRole}</span>.
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Invitation for: <span className="text-foreground">{data.email}</span>
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your Name</Label>
                    <Input
                      id="name"
                      placeholder="Jane Smith"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      minLength={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Create Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={acceptMutation.isPending || !name.trim() || !password || !confirmPassword}
                  >
                    {acceptMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Joining…</>
                    ) : (
                      <><Users className="h-4 w-4 mr-2" /> Accept Invitation & Join Team</>
                    )}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
