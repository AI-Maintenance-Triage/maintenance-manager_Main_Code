import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, DollarSign, TrendingUp, Briefcase, Calendar, Download, Minus } from "lucide-react";

function fmt(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
}

function statusColor(status: string) {
  switch (status) {
    case "captured":
    case "paid_out": return "bg-green-500/15 text-green-400 border-green-500/30";
    case "pending":
    case "escrow": return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "refunded": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "failed": return "bg-red-500/15 text-red-400 border-red-500/30";
    default: return "bg-secondary text-muted-foreground";
  }
}

export default function ContractorBilling() {
  const { data: earnings, isLoading } = trpc.contractor.getEarnings.useQuery();

  const rawTxns = earnings?.transactions ?? [];
  const totalEarned = earnings?.totalEarned ?? 0;
  const totalFees = rawTxns.reduce((s: number, t: any) => s + parseFloat(String(t.platformFee ?? "0")), 0);
  const totalGross = rawTxns.reduce((s: number, t: any) => s + parseFloat(String(t.totalCharged ?? "0")), 0);
  const avgPerJob = rawTxns.length > 0 ? totalEarned / rawTxns.length : 0;

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Receipt className="h-6 w-6 text-primary" /> Payment History
        </h1>
        <p className="text-muted-foreground mt-1">Your earnings breakdown — payout received per completed job</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Earned</span>
            </div>
            <p className="text-2xl font-bold text-green-400">{fmt(totalEarned)}</p>
            <p className="text-xs text-muted-foreground mt-1">{rawTxns.length} paid jobs</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Gross Billed</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{fmt(totalGross)}</p>
            <p className="text-xs text-muted-foreground mt-1">Before platform fee</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Minus className="h-4 w-4 text-orange-400" />
              <span className="text-xs text-muted-foreground">Platform Fees</span>
            </div>
            <p className="text-2xl font-bold text-orange-400">{fmt(totalFees)}</p>
            <p className="text-xs text-muted-foreground mt-1">Added to job cost</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase className="h-4 w-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">Avg per Job</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{fmt(avgPerJob)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Payment Records</CardTitle>
          <CardDescription>Download a receipt PDF for any completed job</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rawTxns.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No payments yet. Completed and verified jobs will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Job</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Labor</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Parts</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Gross</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Your Payout</th>
                    <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                    <th className="text-center px-4 py-3 text-muted-foreground font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {rawTxns.map((t: any) => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {t.paidAt ? new Date(t.paidAt).toLocaleDateString() : new Date(t.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[200px]">
                        <div className="truncate font-medium">{t.jobTitle ?? `Job #${t.maintenanceRequestId}`}</div>
                        {t.propertyName && <div className="text-xs text-muted-foreground truncate">{t.propertyName}</div>}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">{fmt(t.laborCost)}</td>
                      <td className="px-4 py-3 text-right text-foreground">{fmt(t.partsCost)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt(t.totalCharged)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-400">{fmt(t.contractorPayout)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(t.status)}`}>
                          {t.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-primary hover:text-primary"
                          onClick={() => window.open(`/api/receipt/${t.maintenanceRequestId}`, "_blank")}
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          PDF
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-secondary/30">
                    <td colSpan={2} className="px-4 py-3 font-semibold text-foreground">Totals</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {fmt(rawTxns.reduce((s: number, t: any) => s + parseFloat(String(t.laborCost ?? "0")), 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {fmt(rawTxns.reduce((s: number, t: any) => s + parseFloat(String(t.partsCost ?? "0")), 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-muted-foreground">{fmt(totalGross)}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-400">{fmt(totalEarned)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Note about platform fee */}
      <p className="text-xs text-muted-foreground text-center">
        The platform fee is charged to the company on top of the job cost — your payout is the full agreed job amount.
      </p>
    </div>
  );
}
