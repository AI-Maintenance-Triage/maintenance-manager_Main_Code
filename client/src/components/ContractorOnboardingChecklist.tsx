import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContractorProfile {
  businessName?: string | null;
  phone?: string | null;
  trades?: string[] | null;
  serviceAreaZips?: string[] | null;
  licenseNumber?: string | null;
  insuranceInfo?: string | null;
  stripeOnboardingComplete?: boolean;
}

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  done: boolean;
  path: string;
}

const DISMISSED_KEY = "contractor_onboarding_dismissed";

function buildChecklist(profile: ContractorProfile): ChecklistItem[] {
  return [
    {
      id: "business_name",
      label: "Add your business name",
      description: "Help companies find and trust you",
      done: !!profile.businessName?.trim(),
      path: "/contractor/profile",
    },
    {
      id: "phone",
      label: "Add a contact phone number",
      description: "Required for job notifications",
      done: !!profile.phone?.trim(),
      path: "/contractor/profile",
    },
    {
      id: "trades",
      label: "Select your trades",
      description: "Get matched to the right jobs",
      done: Array.isArray(profile.trades) && profile.trades.length > 0,
      path: "/contractor/profile",
    },
    {
      id: "service_area",
      label: "Set your service area",
      description: "Define the zip codes you cover",
      done: Array.isArray(profile.serviceAreaZips) && profile.serviceAreaZips.length > 0,
      path: "/contractor/profile",
    },
    {
      id: "license",
      label: "Add license information",
      description: "Increases trust with property managers",
      done: !!profile.licenseNumber?.trim(),
      path: "/contractor/profile",
    },
    {
      id: "insurance",
      label: "Add insurance information",
      description: "Required by most companies",
      done: !!profile.insuranceInfo?.trim(),
      path: "/contractor/profile",
    },
    {
      id: "stripe",
      label: "Set up Stripe payouts",
      description: "Required to receive payments",
      done: !!profile.stripeOnboardingComplete,
      path: "/contractor/billing",
    },
  ];
}

interface Props {
  profile: ContractorProfile;
}

export function ContractorOnboardingChecklist({ profile }: Props) {
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(DISMISSED_KEY) === "true";
  });
  const [expanded, setExpanded] = useState(true);

  const items = buildChecklist(profile);
  const completed = items.filter(i => i.done).length;
  const total = items.length;
  const percent = Math.round((completed / total) * 100);
  const allDone = completed === total;

  // Auto-dismiss once all steps are done
  if (allDone && !dismissed) {
    return null;
  }

  if (dismissed) return null;

  return (
    <Card className="border-primary/20 bg-primary/5 relative">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Complete your profile</CardTitle>
            <Badge variant="outline" className="text-xs">
              {completed}/{total} done
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(e => !e)}
              aria-label={expanded ? "Collapse checklist" : "Expand checklist"}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                localStorage.setItem(DISMISSED_KEY, "true");
                setDismissed(true);
              }}
              aria-label="Dismiss checklist"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1 mt-1">
          <Progress value={percent} className="h-1.5" />
          <p className="text-xs text-muted-foreground">{percent}% complete — finish setup to start receiving jobs</p>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => !item.done && setLocation(item.path)}
                disabled={item.done}
                className={cn(
                  "flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-colors",
                  item.done
                    ? "opacity-60 cursor-default"
                    : "hover:bg-accent cursor-pointer"
                )}
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
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
