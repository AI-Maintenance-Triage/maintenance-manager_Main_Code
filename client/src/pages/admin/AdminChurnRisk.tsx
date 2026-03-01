import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, AlertCircle, Clock } from "lucide-react";

function RiskBadge({ score }: { score: number }) {
  if (score >= 70) return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 border text-xs">High Risk</Badge>;
  if (score >= 40) return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 border text-xs">Medium Risk</Badge>;
  return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 border text-xs">Low Risk</Badge>;
}

export default function AdminChurnRisk() {
  const { data: companies, isLoading } = trpc.adminControl.churnRisk.useQuery();

  const highRisk = companies?.filter((c: any) => (c.churnScore ?? 0) >= 70) ?? [];
  const mediumRisk = companies?.filter((c: any) => (c.churnScore ?? 0) >= 40 && (c.churnScore ?? 0) < 70) ?? [];
  const lowRisk = companies?.filter((c: any) => (c.churnScore ?? 0) < 40) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingDown className="h-6 w-6 text-red-500" /> Churn Risk Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Companies at risk of churning based on activity and engagement signals.</p>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-red-500/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div>
                  <p className="text-2xl font-bold text-red-400">{highRisk.length}</p>
                  <p className="text-xs text-muted-foreground">High Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-400" />
                <div>
                  <p className="text-2xl font-bold text-yellow-400">{mediumRisk.length}</p>
                  <p className="text-xs text-muted-foreground">Medium Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold text-blue-400">{lowRisk.length}</p>
                  <p className="text-xs text-muted-foreground">Low Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !companies?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No churn risk data available yet.</CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Risk Score</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Active</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Jobs (30d)</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {companies.map((c: any) => (
                <tr key={c.companyId} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.companyName || `Company #${c.companyId}`}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${(c.churnScore ?? 0) >= 70 ? "bg-red-500" : (c.churnScore ?? 0) >= 40 ? "bg-yellow-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min(100, c.churnScore ?? 0)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono">{c.churnScore ?? 0}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.lastActiveAt ? new Date(c.lastActiveAt).toLocaleDateString() : "Never"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.recentJobs ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.planName || "—"}</td>
                  <td className="px-4 py-3"><RiskBadge score={c.churnScore ?? 0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
