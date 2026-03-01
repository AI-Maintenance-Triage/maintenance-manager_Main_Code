import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Star } from "lucide-react";

const RANK_STYLES = [
  "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  "text-slate-300 bg-slate-500/10 border-slate-500/20",
  "text-orange-400 bg-orange-500/10 border-orange-500/20",
];

export default function AdminLeaderboard() {
  const { data: contractors, isLoading } = trpc.adminControl.contractorLeaderboard.useQuery({ limit: 25 });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="h-6 w-6 text-yellow-500" /> Contractor Leaderboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Top contractors ranked by completed jobs and average rating.</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !contractors?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No contractor data yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {contractors.map((c: any, i: number) => (
            <div key={c.contractorId ?? i} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/20 transition-colors">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border ${RANK_STYLES[i] ?? "text-muted-foreground bg-muted/20 border-muted"}`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{c.businessName || c.contractorName || `Contractor #${c.contractorId}`}</p>
                <p className="text-xs text-muted-foreground">{c.trades?.join(", ") || "General"}</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <p className="font-semibold">{c.completedJobs ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Jobs</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                    <span className="font-semibold">{c.avgRating ? Number(c.avgRating).toFixed(1) : "—"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Rating</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold">${c.totalEarnings ? (c.totalEarnings / 100).toLocaleString() : "0"}</p>
                  <p className="text-xs text-muted-foreground">Earned</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
