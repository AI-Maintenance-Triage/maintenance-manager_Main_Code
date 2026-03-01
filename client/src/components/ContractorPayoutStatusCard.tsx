/**
 * ContractorPayoutStatusCard
 * Prominently surfaces Stripe Connect payout status on the contractor dashboard.
 * Shows Not Set Up / Pending KYC / Active states with a direct CTA.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, CheckCircle2, Clock, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function ContractorPayoutStatusCard() {
  const { data: status, isLoading } = trpc.stripePayments.contractorOnboardingStatus.useQuery();
  const onboardingLinkMutation = trpc.stripePayments.contractorOnboardingLink.useMutation({
    onSuccess(data: { url: string }) {
      window.open(data.url, "_blank");
    },
    onError(err: { message: string }) {
      toast.error("Failed to get onboarding link: " + err.message);
    },
  });

  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  // If fully active, show a minimal green badge — no need for a big card
  if (status?.onboardingComplete && status?.payoutsEnabled) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="font-medium">Payouts active</span>
        <span className="text-emerald-400/70">— you will be paid automatically when jobs are completed.</span>
      </div>
    );
  }

  // Not set up at all
  if (!status?.stripeAccountId) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="p-4 flex items-start gap-4">
          <div className="p-2 rounded-full bg-amber-500/15 shrink-0">
            <CreditCard className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-foreground">Set up payouts to get paid</span>
              <Badge variant="outline" className="border-amber-500/50 text-amber-400 text-xs">Action Required</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Connect your bank account through Stripe to receive payments for completed jobs. This takes about 5 minutes.
            </p>
            <Button
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-black font-medium"
              onClick={() => onboardingLinkMutation.mutate({ origin: window.location.origin })}
              disabled={onboardingLinkMutation.isPending}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              {onboardingLinkMutation.isPending ? "Opening..." : "Complete Payout Setup"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Account created but KYC/verification pending
  return (
    <Card className="border-blue-500/40 bg-blue-500/5">
      <CardContent className="p-4 flex items-start gap-4">
        <div className="p-2 rounded-full bg-blue-500/15 shrink-0">
          <Clock className="h-5 w-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-foreground">Payout setup in progress</span>
            <Badge variant="outline" className="border-blue-500/50 text-blue-400 text-xs">Pending Verification</Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Your Stripe account is created but verification is still pending. Complete the remaining steps to enable payouts.
          </p>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
              onClick={() => onboardingLinkMutation.mutate({ origin: window.location.origin })}
              disabled={onboardingLinkMutation.isPending}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              {onboardingLinkMutation.isPending ? "Opening..." : "Continue Setup"}
            </Button>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              <span>Payouts are paused until verification is complete</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
