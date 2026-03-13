/**
 * ContractorOnboardingChecklist - Session 18 updated version
 * - Tracks dismissed steps separately from completed steps (server-side via tRPC)
 * - Re-shows checklist if a key step becomes undone (e.g. service area cleared)
 * - "Get Help" link on each step opens a contextual help tooltip
 * - Fires completeOnboarding mutation + shows congratulations toast when all steps done
 */
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Circle, X, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Step definitions ─────────────────────────────────────────────────────────
interface StepDef {
  id: string;
  label: string;
  description: string;
  helpText: string;
  path: string;
  isDone: (profile: ContractorProfile) => boolean;
  isKeyStep: boolean;
}

const STEPS: StepDef[] = [
  {
    id: "business_name",
    label: "Add your business name",
    description: "Help companies find and trust you",
    helpText: "Go to Profile → Business Name. This is the name companies will see when you apply for jobs.",
    path: "/contractor/profile",
    isDone: p => !!p.businessName?.trim(),
    isKeyStep: false,
  },
  {
    id: "phone",
    label: "Add a contact phone number",
    description: "Required for job notifications",
    helpText: "Go to Profile → Phone. You'll receive SMS alerts for new job assignments.",
    path: "/contractor/profile",
    isDone: p => !!p.phone?.trim(),
    isKeyStep: false,
  },
  {
    id: "trades",
    label: "Select your trades",
    description: "Get matched to the right jobs",
    helpText: "Go to Profile → Trades. Select all trades you're qualified for to appear in relevant job searches.",
    path: "/contractor/profile",
    isDone: p => Array.isArray(p.trades) && p.trades.length > 0,
    isKeyStep: false,
  },
  {
    id: "service_area",
    label: "Set your service area",
    description: "Define the zip codes you cover",
    helpText: "Go to Profile → Service Area. Add the ZIP codes where you're available to work. This is required to appear in job searches.",
    path: "/contractor/profile",
    isDone: p => Array.isArray(p.serviceAreaZips) && p.serviceAreaZips.length > 0,
    isKeyStep: true,
  },
  {
    id: "license",
    label: "Add license information",
    description: "Increases trust with property managers",
    helpText: "Go to Profile → License. Add your contractor license number. This significantly increases your acceptance rate.",
    path: "/contractor/profile",
    isDone: p => !!p.licenseNumber?.trim(),
    isKeyStep: false,
  },
  {
    id: "insurance",
    label: "Add insurance information",
    description: "Required by most companies",
    helpText: "Go to Profile → Insurance. Add your general liability insurance policy details. Most property management companies require this.",
    path: "/contractor/profile",
    isDone: p => !!p.insuranceInfo?.trim(),
    isKeyStep: false,
  },
  {
    id: "stripe",
    label: "Set up Stripe payouts",
    description: "Required to receive payments",
    helpText: "Go to Billing → Set Up Payouts. Connect your bank account via Stripe to receive direct deposits when jobs are paid.",
    path: "/contractor/billing",
    isDone: p => !!p.stripeOnboardingComplete,
    isKeyStep: true,
  },
];

interface ContractorProfile {
  businessName?: string | null;
  phone?: string | null;
  trades?: string[] | null;
  serviceAreaZips?: string[] | null;
  licenseNumber?: string | null;
  insuranceInfo?: string | null;
  stripeOnboardingComplete?: boolean;
  onboardingDismissedSteps?: string[] | null;
  onboardingCompletedAt?: number | null;
}

interface Props {
  profile: ContractorProfile;
  onRefresh?: () => void;
}

export function ContractorOnboardingChecklist({ profile, onRefresh }: Props) {
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(true);
  const completionFiredRef = useRef(false);

  const dismissedSteps: string[] = (profile.onboardingDismissedSteps as string[] | null) ?? [];
  const alreadyCompleted = !!profile.onboardingCompletedAt;

  const allItems = STEPS.map(step => ({
    ...step,
    done: step.isDone(profile),
  }));

  const completedCount = allItems.filter(i => i.done).length;
  const total = allItems.length;
  const allDone = completedCount === total;
  const percent = Math.round((completedCount / total) * 100);

  // Visible: completed steps always shown; incomplete shown unless dismissed;
  // key steps re-appear if undone even if previously dismissed
  const visibleItems = allItems.filter(item => {
    if (item.done) return true;
    if (dismissedSteps.includes(item.id)) return item.isKeyStep;
    return true;
  });

  const dismissStep = trpc.contractor.dismissOnboardingStep.useMutation({
    onSuccess: () => onRefresh?.(),
    onError: err => toast.error(`Could not dismiss step: ${err.message}`),
  });

  const completeOnboarding = trpc.contractor.completeOnboarding.useMutation({
    onSuccess: (data) => {
      if (!data.alreadyCompleted) {
        toast.success("You've completed your profile setup! Welcome to Maintenance Manager.", { duration: 6000 });
      }
      onRefresh?.();
    },
  });

  useEffect(() => {
    if (allDone && !alreadyCompleted && !completionFiredRef.current) {
      completionFiredRef.current = true;
      completeOnboarding.mutate();
    }
  }, [allDone, alreadyCompleted]);

  // Hide if already completed and all steps still done
  if (alreadyCompleted && allDone) return null;
  // Hide if nothing visible to show
  if (!visibleItems.some(i => !i.done) && allDone) return null;

  return (
    <TooltipProvider>
      <Card className="border-primary/20 bg-primary/5 relative">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Complete your profile</CardTitle>
              <Badge variant="outline" className="text-xs">
                {completedCount}/{total} done
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(e => !e)}
              aria-label={expanded ? "Collapse checklist" : "Expand checklist"}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
          <div className="space-y-1 mt-1">
            <Progress value={percent} className="h-1.5" />
            <p className="text-xs text-muted-foreground">{percent}% complete — finish setup to start receiving jobs</p>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {visibleItems.map(item => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-2 p-2.5 rounded-lg relative group",
                    item.done ? "opacity-60" : "hover:bg-accent"
                  )}
                >
                  <button
                    onClick={() => !item.done && setLocation(item.path)}
                    disabled={item.done}
                    className="flex items-start gap-2.5 flex-1 text-left"
                  >
                    {item.done ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className={cn("text-sm font-medium leading-tight", item.done && "line-through text-muted-foreground")}>
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                    </div>
                  </button>

                  {!item.done && (
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={`Get help with: ${item.label}`}
                          >
                            <HelpCircle className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          {item.helpText}
                        </TooltipContent>
                      </Tooltip>

                      {!item.isKeyStep && (
                        <button
                          className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                          onClick={() => dismissStep.mutate({ stepId: item.id })}
                          aria-label={`Dismiss: ${item.label}`}
                          title="Dismiss this step"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </TooltipProvider>
  );
}
