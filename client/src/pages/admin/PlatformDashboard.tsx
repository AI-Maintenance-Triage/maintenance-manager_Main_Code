import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, HardHat, ClipboardList, DollarSign } from "lucide-react";

export default function PlatformDashboard() {
  const { data: stats, isLoading } = trpc.platform.stats.useQuery();
  const { data: companies, isLoading: companiesLoading } = trpc.platform.companies.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Admin</h1>
        <p className="text-muted-foreground mt-1">Overview of the entire platform</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Companies</CardTitle>
              <Building2 className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-card-foreground">{stats?.totalCompanies ?? 0}</div></CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Contractors</CardTitle>
              <HardHat className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-card-foreground">{stats?.totalContractors ?? 0}</div></CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Jobs</CardTitle>
              <ClipboardList className="h-4 w-4 text-yellow-400" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-card-foreground">{stats?.totalJobs ?? 0}</div></CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-card-foreground">${stats?.totalRevenue ?? "0"}</div></CardContent>
          </Card>
        </div>
      )}

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-card-foreground">Registered Companies</CardTitle></CardHeader>
        <CardContent>
          {companiesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !companies || companies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No companies registered yet.</p>
          ) : (
            <div className="space-y-2">
              {companies.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <p className="font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.subscriptionStatus === "active" ? "Active" : c.subscriptionStatus || "No subscription"} •
                      Created {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
