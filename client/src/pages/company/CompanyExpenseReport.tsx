import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  DollarSign, Building2, FileDown, TrendingUp, Wrench, Package, CreditCard, Archive,
} from "lucide-react";
import { toast } from "sonner";

function formatCurrency(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
}

function formatMonth(ym: string) {
  const [year, month] = ym.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleString("default", { month: "short", year: "2-digit" });
}

export default function CompanyExpenseReport() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const [bulkFrom, setBulkFrom] = useState(firstOfMonth);
  const [bulkTo, setBulkTo] = useState(today);
  const [bulkLoading, setBulkLoading] = useState(false);

  const { data, isLoading } = trpc.transactions.expenseReport.useQuery(undefined, {
    refetchInterval: 60000,
  });

  const handleExportCSV = () => {
    if (!data?.transactions?.length) return;
    const headers = ["Date", "Job", "Property", "Labor", "Parts", "Platform Fee", "Total Charged", "Status"];
    const rows = data.transactions.map((t) => [
      new Date(t.createdAt).toLocaleDateString(),
      t.jobTitle ?? "",
      t.propertyName ?? t.propertyAddress ?? "",
      parseFloat(t.laborCost ?? "0").toFixed(2),
      parseFloat(t.partsCost ?? "0").toFixed(2),
      parseFloat(t.platformFee ?? "0").toFixed(2),
      parseFloat(t.totalCharged ?? "0").toFixed(2),
      t.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expense-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkExport = async () => {
    if (!bulkFrom || !bulkTo) {
      toast.error("Please select both a start and end date.");
      return;
    }
    if (bulkFrom > bulkTo) {
      toast.error("Start date must be before end date.");
      return;
    }
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/invoices/bulk?from=${bulkFrom}&to=${bulkTo}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(err.error ?? "Failed to export invoices");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoices-${bulkFrom}-${bulkTo}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Invoice ZIP downloaded successfully");
    } catch {
      toast.error("Failed to export invoices. Please try again.");
    } finally {
      setBulkLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Expense Report</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const txns = data?.transactions ?? [];
  const monthlyTotals = data?.monthlyTotals ?? [];
  const propertyTotals = data?.propertyTotals ?? [];

  const totalSpent = txns.reduce((s, t) => s + parseFloat(t.totalCharged ?? "0"), 0);
  const totalLabor = txns.reduce((s, t) => s + parseFloat(t.laborCost ?? "0"), 0);
  const totalParts = txns.reduce((s, t) => s + parseFloat(t.partsCost ?? "0"), 0);
  const totalFees = txns.reduce((s, t) => s + parseFloat(t.platformFee ?? "0"), 0);

  const chartData = monthlyTotals.map((m) => ({
    month: formatMonth(m.month),
    total: parseFloat(m.total ?? "0"),
    labor: parseFloat(m.laborTotal ?? "0"),
    parts: parseFloat(m.partsTotal ?? "0"),
    fee: parseFloat(m.feeTotal ?? "0"),
    jobs: m.jobCount,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expense Report</h1>
          <p className="text-muted-foreground mt-1">Monthly spend breakdown and per-property cost analysis</p>
        </div>
        <Button onClick={handleExportCSV} variant="outline" className="gap-2" disabled={txns.length === 0}>
          <FileDown className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Bulk Invoice Export */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Archive className="h-4 w-4 text-amber-400" /> Bulk Invoice Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Download a ZIP file containing individual PDF invoices for all paid jobs in a date range.
            Useful for accounting, audits, and record-keeping.
          </p>
          <div className="flex flex-col sm:flex-row items-end gap-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="bulk-from" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="bulk-from"
                type="date"
                value={bulkFrom}
                onChange={(e) => setBulkFrom(e.target.value)}
                className="bg-background border-border text-foreground"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="bulk-to" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="bulk-to"
                type="date"
                value={bulkTo}
                onChange={(e) => setBulkTo(e.target.value)}
                className="bg-background border-border text-foreground"
              />
            </div>
            <Button
              onClick={handleBulkExport}
              disabled={bulkLoading || !bulkFrom || !bulkTo}
              className="gap-2 shrink-0"
            >
              <Archive className="h-4 w-4" />
              {bulkLoading ? "Generating ZIP..." : "Download Invoices ZIP"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-green-400" />
              <span className="text-xs text-muted-foreground font-medium">Total Spent</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totalSpent)}</p>
            <p className="text-xs text-muted-foreground mt-1">{txns.length} paid jobs</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-muted-foreground font-medium">Labor Costs</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totalLabor)}</p>
            <p className="text-xs text-muted-foreground mt-1">{totalSpent > 0 ? ((totalLabor / totalSpent) * 100).toFixed(0) : 0}% of total</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-muted-foreground font-medium">Parts & Materials</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totalParts)}</p>
            <p className="text-xs text-muted-foreground mt-1">{totalSpent > 0 ? ((totalParts / totalSpent) * 100).toFixed(0) : 0}% of total</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-4 w-4 text-purple-400" />
              <span className="text-xs text-muted-foreground font-medium">Platform Fees</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totalFees)}</p>
            <p className="text-xs text-muted-foreground mt-1">{totalSpent > 0 ? ((totalFees / totalSpent) * 100).toFixed(0) : 0}% of total</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly chart */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-green-400" /> Monthly Spend (Last 12 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No transaction data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="total" name="Total Charged" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={`hsl(var(--primary) / ${0.7 + (i % 3) * 0.1})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Per-property breakdown */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-blue-400" /> Spend by Property
          </CardTitle>
        </CardHeader>
        <CardContent>
          {propertyTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No property data yet</p>
          ) : (
            <div className="space-y-3">
              {propertyTotals.map((p, i) => {
                const amount = parseFloat(p.total ?? "0");
                const maxAmount = parseFloat(propertyTotals[0]?.total ?? "1");
                const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{p.propertyName ?? p.propertyAddress ?? "Unknown Property"}</p>
                        <p className="text-xs text-muted-foreground">{p.jobCount} job{p.jobCount !== 1 ? "s" : ""}</p>
                      </div>
                      <span className="font-semibold text-foreground ml-4 shrink-0">{formatCurrency(amount)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction history */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-green-400" /> Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {txns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No transactions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Job</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Property</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Labor</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Parts</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Fee</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Total</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[160px] truncate">
                        {t.jobTitle ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[140px] truncate">
                        {t.propertyName ?? t.propertyAddress ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">{formatCurrency(t.laborCost)}</td>
                      <td className="px-4 py-3 text-right text-foreground">{formatCurrency(t.partsCost)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs">{formatCurrency(t.platformFee)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-400">{formatCurrency(t.totalCharged)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="outline"
                          className={
                            t.status === "paid_out" ? "text-green-400 border-green-500/30 bg-green-500/10" :
                            t.status === "captured" ? "text-blue-400 border-blue-500/30 bg-blue-500/10" :
                            t.status === "failed" ? "text-red-400 border-red-500/30 bg-red-500/10" :
                            "text-muted-foreground"
                          }
                        >
                          {t.status === "paid_out" ? "Paid Out" :
                           t.status === "captured" ? "Processing" :
                           t.status === "failed" ? "Failed" :
                           t.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
