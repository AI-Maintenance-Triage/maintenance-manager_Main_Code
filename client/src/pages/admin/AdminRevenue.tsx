import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Briefcase, Building2, BarChart3,
  Calendar, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function fmt(val: string | number | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtShort(val: string | number | undefined) {
  const n = parseFloat(String(val ?? "0"));
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function MonthLabel(month: string) {
  const [year, m] = month.split("-");
  const date = new Date(parseInt(year), parseInt(m) - 1, 1);
  return date.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

const DATE_RANGES = [
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
  { label: "Last 6 Months", days: 180 },
  { label: "Last 12 Months", days: 365 },
  { label: "All Time", days: 0 },
] as const;

const COMPANY_COLORS = [
  "hsl(var(--primary))",
  "hsl(189 94% 43%)",
  "hsl(38 92% 50%)",
  "hsl(160 84% 39%)",
  "hsl(var(--destructive))",
  "hsl(258 90% 66%)",
  "hsl(217 91% 60%)",
  "hsl(330 81% 60%)",
  "hsl(174 72% 40%)",
  "hsl(84 81% 44%)",
];

export default function AdminRevenue() {
  const [selectedRange, setSelectedRange] = useState<typeof DATE_RANGES[number]>(DATE_RANGES[3]);

  const dateFilter = useMemo(() => {
    if (selectedRange.days === 0) return {};
    const endDate = Date.now();
    const startDate = endDate - selectedRange.days * 24 * 60 * 60 * 1000;
    return { startDate, endDate };
  }, [selectedRange]);

  const { data: stats, isLoading } = trpc.platform.stats.useQuery();
  const { data: companyRevenue, isLoading: companyLoading } = trpc.platform.revenueByCompany.useQuery(dateFilter);

  const monthly = (stats?.monthlyRevenue ?? [])
    .slice()
    .sort((a: any, b: any) => a.month.localeCompare(b.month))
    .map((m: any) => ({
      label: MonthLabel(m.month),
      revenue: parseFloat(m.revenue),
      gross: parseFloat(m.gross),
      jobs: m.jobCount ?? 0,
    }));

  const momGrowth = stats?.momGrowth ? parseFloat(stats.momGrowth) : null;
  const isPositive = momGrowth !== null && momGrowth >= 0;

  const companyChartData = (companyRevenue ?? []).slice(0, 10).map((c: any) => ({
    name: c.companyName ?? "Unknown",
    fees: parseFloat(c.platformFees),
    spend: parseFloat(c.totalSpend),
    jobs: c.jobCount,
  }));

  const kpis = [
    {
      label: "Total Platform Revenue",
      value: fmt(stats?.totalRevenue),
      icon: DollarSign,
      color: "text-green-400",
      bg: "bg-green-500/10",
    },
    {
      label: "Total Gross Processed",
      value: fmt(stats?.totalGross),
      icon: BarChart3,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Avg Fee per Paid Job",
      value: fmt(stats?.avgFeePerJob),
      icon: Briefcase,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
    },
    {
      label: "MoM Revenue Growth",
      value: momGrowth !== null ? `${isPositive ? "+" : ""}${momGrowth}%` : "N/A",
      icon: isPositive ? TrendingUp : TrendingDown,
      color: isPositive ? "text-green-400" : "text-red-400",
      bg: isPositive ? "bg-green-500/10" : "bg-red-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revenue Dashboard</h1>
          <p className="text-muted-foreground mt-1">Platform fee analytics and company spending breakdown</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
              <Calendar className="h-3.5 w-3.5" />
              {selectedRange.label}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {DATE_RANGES.map((r) => (
              <DropdownMenuItem
                key={r.label}
                onClick={() => setSelectedRange(r)}
                className={selectedRange.label === r.label ? "bg-primary/10 text-primary" : ""}
              >
                {r.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
                    <p className="text-xl font-bold text-foreground">{kpi.value}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${kpi.bg}`}>
                    <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Revenue by Company Bar Chart */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-amber-400" />
            Platform Fees by Company
            <Badge variant="outline" className="text-xs ml-1">{selectedRange.label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {companyLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : companyChartData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              No transaction data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={companyChartData}
                layout="vertical"
                margin={{ top: 4, right: 60, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={fmtShort}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 13) + "…" : v}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [
                    fmt(value),
                    name === "fees" ? "Platform Fees" : "Total Spend",
                  ]}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                />
                <Bar dataKey="fees" radius={[0, 4, 4, 0]} name="fees">
                  {companyChartData.map((_: any, index: number) => (
                    <Cell key={index} fill={COMPANY_COLORS[index % COMPANY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Monthly Revenue Bar Chart */}
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Monthly Platform Fees (Last 12 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthly.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No transaction data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtShort}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [
                      fmt(value),
                      name === "revenue" ? "Platform Fee" : "Gross Volume",
                    ]}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="revenue" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gross Volume Line Chart */}
      {!isLoading && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              Monthly Gross Volume Processed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthly.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                No transaction data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtShort}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [fmt(value), "Gross Volume"]}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="gross"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top Companies Detailed Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-amber-400" />
            Company Revenue Breakdown
            <Badge variant="outline" className="text-xs ml-1">{selectedRange.label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {companyLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !companyRevenue || companyRevenue.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
              No transaction data for this period
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">#</th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Company</th>
                    <th className="text-right py-2 pr-4 text-xs font-medium text-muted-foreground">Total Spend</th>
                    <th className="text-right py-2 pr-4 text-xs font-medium text-muted-foreground">Platform Fees</th>
                    <th className="text-right py-2 pr-4 text-xs font-medium text-muted-foreground">Labor</th>
                    <th className="text-right py-2 pr-4 text-xs font-medium text-muted-foreground">Parts</th>
                    <th className="text-right py-2 text-xs font-medium text-muted-foreground">Jobs Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {(companyRevenue as any[]).map((c, i) => (
                    <tr key={c.companyId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 pr-4 text-muted-foreground font-mono text-xs">{i + 1}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ backgroundColor: COMPANY_COLORS[i % COMPANY_COLORS.length] }}
                          >
                            {(c.companyName ?? "?")[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground">{c.companyName ?? "Unknown"}</span>
                          {i === 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400">Top</Badge>}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-medium text-foreground">{fmt(c.totalSpend)}</td>
                      <td className="py-2.5 pr-4 text-right text-green-400 font-medium">{fmt(c.platformFees)}</td>
                      <td className="py-2.5 pr-4 text-right text-muted-foreground">{fmt(c.laborCost)}</td>
                      <td className="py-2.5 pr-4 text-right text-muted-foreground">{fmt(c.partsCost)}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{c.jobCount}</td>
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
