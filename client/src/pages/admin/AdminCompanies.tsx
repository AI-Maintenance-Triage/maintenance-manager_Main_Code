import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, ClipboardList, Calendar } from "lucide-react";

export default function AdminCompanies() {
  const { data: companies, isLoading } = trpc.platform.companies.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Companies</h1>
        <p className="text-muted-foreground mt-1">Manage all registered property management companies</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !companies || companies.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-card-foreground mb-2">No Companies Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              When property management companies sign up and register on the platform, they'll appear here.
              You'll be able to view their details, subscription status, and activity.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((company: any) => (
            <Card key={company.id} className="bg-card border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-card-foreground truncate">{company.name}</h3>
                        {company.contactEmail && (
                          <p className="text-xs text-muted-foreground truncate">{company.contactEmail}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Joined {new Date(company.createdAt).toLocaleDateString()}
                      </span>
                      {company.contactPhone && (
                        <span>{company.contactPhone}</span>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant={company.subscriptionStatus === "active" ? "default" : "secondary"}
                    className={company.subscriptionStatus === "active" ? "bg-green-600/20 text-green-400 border-green-600/30" : ""}
                  >
                    {company.subscriptionStatus || "No subscription"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
