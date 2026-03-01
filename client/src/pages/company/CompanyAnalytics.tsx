import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  DollarSign, Wrench, Clock, TrendingUp, Building2, FileDown, BarChart2, Layers,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: number | null | undefined) {
  if (val == null) return "$0";
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtFull(val: number | null | undefined) {
  if (val == null) return "$0.00";
  return `$${val.toFixed(2)}`;
}

function formatMonth(ym: string) {
  const [year, month] = ym.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleString("default", { month: "short", year: "2-digit" });
}

const PRESET_RANGES = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last 12 months", days: 365 },
];

const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899"];

// ─── CSV export helper ────────────────────────────────────────────────────────

function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${accent ?? "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted/40">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CompanyAnalytics() {
  const [rangeDays, setRangeDays] = useState(90);

  const { fromMs, toMs } = useMemo(() => {
    const to = Date.now();
    const from = to - rangeDays * 24 * 60 * 60 * 1000;
    return { fromMs: from, toMs: to };
  }, [rangeDays]);

  const summary = trpc.companyReports.summary.useQuery({ fromMs, toMs });
  const byProperty = trpc.companyReports.byProperty.useQuery({ fromMs, toMs });
  const byMonth = trpc.companyReports.byMonth.useQuery({ months: Math.ceil(rangeDays / 30) });
  const bySkillTier = trpc.companyReports.bySkillTier.useQuery({ fromMs, toMs });

  const isLoading = summary.isLoading || byProperty.isLoading || byMonth.isLoading || bySkillTier.isLoading;

  // Monthly trend data for recharts
  const monthlyData = useMemo(() => {
    return (byMonth.data ?? []).map((r) => ({
      month: formatMonth(r.yearMonth),
      spend: r.totalSpend,
      jobs: r.jobCount,
    }));
  }, [byMonth.data]);

  // Property data for bar chart
  const propertyData = useMemo(() => {
    return (byProperty.data ?? []).slice(0, 8).map((r) => ({
      name: r.propertyName.length > 20 ? r.propertyName.slice(0, 18) + "…" : r.propertyName,
      spend: r.totalSpend,
      jobs: r.jobCount,
    }));
  }, [byProperty.data]);

  // Skill tier pie data
  const tierData = useMemo(() => {
    return (bySkillTier.data ?? []).map((r) => ({
      name: r.tierName,
      value: r.totalSpend,
      jobs: r.jobCount,
    }));
  }, [bySkillTier.data]);

  // CSV exports
  const exportSummaryCSV = () => {
    if (!summary.data) return;
    const s = summary.data;
    downloadCSV(`analytics-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Metric", "Value"],
      [
        ["Total Spend", fmtFull(s.totalSpend)],
        ["Total Jobs", s.totalJobs],
        ["Avg Cost per Job", fmtFull(s.avgCostPerJob)],
        ["Total Labor Hours", s.totalLaborHours],
      ]
    );
  };

  const exportPropertyCSV = () => {
    if (!byProperty.data?.length) return;
    downloadCSV(`analytics-by-property-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Property", "Address", "Jobs", "Labor Cost", "Parts Cost", "Total Spend", "Avg per Job"],
      byProperty.data.map((r) => [
        r.propertyName, r.propertyAddress ?? "", r.jobCount,
        fmtFull(r.totalSpend), fmtFull(r.avgCostPerJob),
      ])
    );
  };

  const exportMonthlyCSV = () => {
    if (!byMonth.data?.length) return;
    downloadCSV(`analytics-by-month-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Month", "Jobs", "Total Spend"],
      byMonth.data.map((r) => [
        r.yearMonth, r.jobCount, fmtFull(r.totalSpend),
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-1">Cost and performance overview across all properties</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESET_RANGES.map((r) => (
                <SelectItem key={r.days} value={String(r.days)}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-2 h-9" onClick={exportSummaryCSV} disabled={!summary.data}>
            <FileDown className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={DollarSign}
            label="Total Spend"
            value={fmt(summary.data?.totalSpend)}
            sub="Across all completed jobs"
            accent="text-emerald-400"
          />
          <KpiCard
            icon={Wrench}
            label="Jobs Completed"
            value={String(summary.data?.totalJobs ?? 0)}
            sub={`Avg ${fmtFull(summary.data?.avgCostPerJob)} per job`}
          />
          <KpiCard
            icon={Clock}
            label="Labor Hours"
            value={`${summary.data?.totalLaborHours ?? 0}h`}
            sub="Across all completed jobs"
          />
          <KpiCard
            icon={TrendingUp}
            label="Avg Cost / Job"
            value={fmtFull(summary.data?.avgCostPerJob)}
            sub="Labor + parts combined"
            accent="text-blue-400"
          />
        </div>
      )}

      {/* Monthly Trend + Skill Tier Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly Spend Trend */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Monthly Spend Trend
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={exportMonthlyCSV} disabled={!byMonth.data?.length}>
              <FileDown className="h-3 w-3" /> CSV
            </Button>
          </CardHeader>
          <CardContent>
            {byMonth.isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : monthlyData.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Spend"]}
                  />
                  <Line type="monotone" dataKey="spend" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Skill Tier Distribution */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Spend by Skill Tier
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bySkillTier.isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : tierData.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={tierData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""}
                    labelLine={false}
                  >
                    {tierData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Spend"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-Property Cost Breakdown */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Cost by Property
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={exportPropertyCSV} disabled={!byProperty.data?.length}>
            <FileDown className="h-3 w-3" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          {byProperty.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : propertyData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No completed jobs in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={propertyData} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, "Total Spend"]}
                />
                <Bar dataKey="spend" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Property Table */}
      {byProperty.data && byProperty.data.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              Property Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Property</th>
                           <th className="pb-2 pr-4 font-medium text-right">Jobs</th>
                    <th className="pb-2 pr-4 font-medium text-right">Total Spend</th>
                    <th className="pb-2 font-medium text-right">Avg / Job</th>
                  </tr>
                </thead>
                <tbody>
                  {byProperty.data.map((r, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium text-foreground truncate max-w-[200px]">{r.propertyName}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{r.propertyAddress}</div>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-muted-foreground">{r.jobCount}</td>
                      <td className="py-2.5 pr-4 text-right font-medium text-emerald-400">{fmtFull(r.totalSpend)}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{fmtFull(r.avgCostPerJob)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
