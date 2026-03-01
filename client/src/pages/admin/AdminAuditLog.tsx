import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
  create_announcement: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  update_announcement: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  delete_announcement: "bg-red-500/10 text-red-400 border-red-500/20",
  set_maintenance_mode: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  upsert_feature_flag: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  update_feature_flag: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  suspend_account: "bg-red-500/10 text-red-400 border-red-500/20",
  reinstate_account: "bg-green-500/10 text-green-400 border-green-500/20",
  issue_credit: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  place_payout_hold: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  release_payout_hold: "bg-green-500/10 text-green-400 border-green-500/20",
  override_job_fee: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  email_blast: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

export default function AdminAuditLog() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  const { data: entries, isLoading } = trpc.adminControl.listAuditLog.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const filtered = entries?.filter((e: any) =>
    !search || e.action.includes(search.toLowerCase()) || e.details?.toLowerCase().includes(search.toLowerCase()) || e.actorName?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="h-6 w-6 text-primary" /> Audit Log</h1>
        <p className="text-muted-foreground text-sm mt-1">Full history of admin actions on the platform.</p>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search by action, details, or actor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !filtered.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No audit log entries found.</CardContent></Card>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Timestamp</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actor</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((e: any) => (
                  <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium">{e.actorName || `#${e.actorId}`}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs border ${ACTION_COLORS[e.action] ?? "bg-muted text-muted-foreground"}`}>
                        {e.action.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{e.details || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Page {page + 1} · {filtered.length} entries shown</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={(entries?.length ?? 0) < PAGE_SIZE}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
