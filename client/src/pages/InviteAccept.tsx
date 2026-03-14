import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Wrench, CheckCircle2, XCircle, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Landing page for contractor invite links.
 * URL: /invite/:token
 *
 * Validates the token server-side, then redirects to /signup?role=contractor&inviteToken=<token>&email=<email>
 * so the registration flow can pre-fill the email and pass the token through to setupProfile.
 */
export default function InviteAccept() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = trpc.invites.validateToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  // Auto-redirect once validated
  useEffect(() => {
    if (data?.valid) {
      const qs = new URLSearchParams({
        role: "contractor",
        inviteToken: token,
        email: data.email ?? "",
        name: data.name ?? "",
        companyId: String(data.companyId),
        companyName: data.companyName,
      });
      // Short delay so the user sees the success state briefly
      const t = setTimeout(() => setLocation(`/signup?${qs.toString()}`), 1800);
      return () => clearTimeout(t);
    }
  }, [data, token, setLocation]);

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
          <CardContent className="p-8 text-center">
            {isLoading && (
              <>
                <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">Validating your invite…</h2>
                <p className="text-muted-foreground text-sm">Just a moment while we check your invitation.</p>
              </>
            )}

            {!isLoading && data?.valid && (
              <>
                <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Invite Accepted!</h2>
                <p className="text-muted-foreground text-sm mb-1">
                  You've been invited by <strong className="text-foreground">{data.companyName}</strong>.
                </p>
                <p className="text-muted-foreground text-sm mb-6">
                  Redirecting you to sign up…
                </p>
                <div className="flex justify-center">
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                </div>
              </>
            )}

            {!isLoading && error && (
              <>
                <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                  <XCircle className="h-8 w-8 text-red-400" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Invite Unavailable</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  {error instanceof Error ? error.message : "This invite link is no longer valid. It may have expired or been revoked."}
                </p>
                <div className="flex flex-col gap-3">
                  <Button onClick={() => setLocation("/get-started?role=contractor")} className="gap-2">
                    <UserPlus className="h-4 w-4" /> Sign Up Without Invite
                  </Button>
                  <Button variant="ghost" onClick={() => setLocation("/")} className="text-muted-foreground">
                    Go to Homepage
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
