import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";

const EVENT_COLORS: Record<string, string> = {
  job_created: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  job_completed: "bg-green-500/10 text-green-400 border-green-500/20",
  job_disputed: "bg-red-500/10 text-red-400 border-red-500/20",
  company_registered: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  contractor_registered: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  subscription_started: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  subscription_cancelled: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

export default function AdminActivityFeed() {
  const { data: events, isLoading } = trpc.adminControl.listActivityEvents.useQuery({ limit: 100 });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6 text-primary" /> Activity Feed</h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time platform activity across all users.</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !events?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No activity events yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {events.map((e: any, i: number) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/20 transition-colors">
              <div className="mt-0.5">
                <Badge className={`text-xs border ${EVENT_COLORS[e.eventType] ?? "bg-muted text-muted-foreground"}`}>
                  {e.eventType?.replace(/_/g, " ") ?? "event"}
                </Badge>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{e.description || e.details || "—"}</p>
                {e.actorName && <p className="text-xs text-muted-foreground mt-0.5">by {e.actorName}</p>}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
