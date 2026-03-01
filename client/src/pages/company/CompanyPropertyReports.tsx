import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart2, Building2, DollarSign, TrendingUp, Wrench, Download } from "lucide-react";

function fmtCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const RANGE_OPTIONS = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last 12 months", days: 365 },
  { label: "All time", days: 0 },
];

export default function CompanyPropertyReports() {
  const [rangeDays, setRangeDays] = useState(90);

  const { fromMs, toMs } = useMemo(() => {
    if (rangeDays === 0) return { fromMs: undefined, toMs: undefined };
    const now = Date.now();
    return { fromMs: now - rangeDays * 24 * 60 * 60 * 1000, toMs: now };
  }, [rangeDays]);

  const { data: rows, isLoading } = trpc.companyReports.revenueByProperty.useQuery({ fromMs, toMs });

  const totals = useMemo(() => {
    if (!rows) return { totalCharged: 0, platformFee: 0, laborCost: 0, partsCost: 0, jobCount: 0 };
    return rows.reduce((acc: any, r: any) => ({
      totalCharged: acc.totalCharged + (r.totalCharged ?? 0),
      platformFee: acc.platformFee + (r.platformFee ?? 0),
      laborCost: acc.laborCost + (r.laborCost ?? 0),
      partsCost: acc.partsCost + (r.partsCost ?? 0),
      jobCount: acc.jobCount + (r.jobCount ?? 0),
    }), { totalCharged: 0, platformFee: 0, laborCost: 0, partsCost: 0, jobCount: 0 });
  }, [rows]);

  const maxCharged = useMemo(() => Math.max(...(rows?.map((r: any) => r.totalCharged ?? 0) ?? [0]), 1), [rows]);

  const handleExportCSV = () => {
    if (!rows?.length) return;
    const headers = ["Property", "Jobs", "Total Charged", "Platform Fee", "Labor Cost", "Parts Cost", "Net Revenue"];
    const csvRows = rows.map((r: any) => [
      `"${r.propertyName}"`,
      r.jobCount,
      (r.totalCharged / 100).toFixed(2),
      (r.platformFee / 100).toFixed(2),
      (r.laborCost / 100).toFixed(2),
      (r.partsCost / 100).toFixed(2),
      ((r.totalCharged - r.platformFee) / 100).toFixed(2),
    ].join(","));
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `property-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" /> Per-Property Billing Report
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Breakdown of maintenance costs and charges by property.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map(o => (
                <SelectItem key={o.days} value={String(o.days)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!rows?.length}>
            <Download className="h-4 w-4 mr-1.5" />Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-400" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Charged</p>
            </div>
            <p className="text-2xl font-bold">{isLoading ? "—" : fmtCents(totals.totalCharged)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Platform Fees</p>
            </div>
            <p className="text-2xl font-bold">{isLoading ? "—" : fmtCents(totals.platformFee)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-purple-400" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Labor + Parts</p>
            </div>
            <p className="text-2xl font-bold">{isLoading ? "—" : fmtCents(totals.laborCost + totals.partsCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-amber-400" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Properties</p>
            </div>
            <p className="text-2xl font-bold">{isLoading ? "—" : rows?.length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Property Table */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !rows?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No billing data for this period.</p>
            <p className="text-sm text-muted-foreground mt-1">Completed and paid jobs will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...rows].sort((a: any, b: any) => (b.totalCharged ?? 0) - (a.totalCharged ?? 0)).map((r: any) => {
            const netRevenue = (r.totalCharged ?? 0) - (r.platformFee ?? 0);
            const barPct = maxCharged > 0 ? Math.round(((r.totalCharged ?? 0) / maxCharged) * 100) : 0;
            return (
              <Card key={r.propertyId} className="overflow-hidden">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold truncate">{r.propertyName}</span>
                      <Badge variant="secondary" className="text-xs shrink-0">{r.jobCount} job{r.jobCount !== 1 ? "s" : ""}</Badge>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-lg">{fmtCents(r.totalCharged ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">total charged</p>
                    </div>
                  </div>

                  {/* Bar */}
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mb-3">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${barPct}%` }} />
                  </div>

                  {/* Cost Breakdown */}
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Platform Fee</p>
                      <p className="font-medium text-red-400">{fmtCents(r.platformFee ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Labor</p>
                      <p className="font-medium">{fmtCents(r.laborCost ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Parts</p>
                      <p className="font-medium">{fmtCents(r.partsCost ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Net Revenue</p>
                      <p className={`font-semibold ${netRevenue >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtCents(netRevenue)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
