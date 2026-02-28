import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewAs } from "@/contexts/ViewAsContext";
import { HardHat, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function CompanyContractors() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const isAdmin = user?.role === "admin";
  const isViewingAsCompany = isAdmin && viewAs.mode === "company" && viewAs.companyId;

  const utils = trpc.useUtils();

  const regularContractors = trpc.contractor.listByCompany.useQuery(undefined, { enabled: !isViewingAsCompany });
  const viewAsContractors = trpc.adminViewAs.companyContractors.useQuery(
    { companyId: viewAs.companyId! },
    { enabled: !!isViewingAsCompany }
  );

  const contractors = isViewingAsCompany ? viewAsContractors.data : regularContractors.data;
  const isLoading = isViewingAsCompany ? viewAsContractors.isLoading : regularContractors.isLoading;

  const updateRelationship = trpc.contractor.updateRelationship.useMutation({
    onSuccess: () => { toast.success("Updated!"); utils.contractor.listByCompany.invalidate(); },
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Approved</Badge>;
      case "pending": return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case "rejected": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Rejected</Badge>;
      case "suspended": return <Badge className="bg-muted text-muted-foreground">Suspended</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Contractors</h1>
        <p className="text-muted-foreground mt-1">
          {isViewingAsCompany ? `Viewing contractors for ${viewAs.companyName}` : "Manage your contractor relationships"}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !contractors || contractors.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <HardHat className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {isViewingAsCompany ? "No contractors connected to this company yet." : "No contractors connected yet. Contractors can request to join your company through the platform."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contractors.map((c: any) => (
            <Card key={c.relationshipId} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-card-foreground">{c.businessName || c.userName || "Unnamed Contractor"}</h3>
                      {statusBadge(c.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      {c.trades && c.trades.length > 0 && <span>Trades: {c.trades.join(", ")}</span>}
                      {c.phone && <span>Phone: {c.phone}</span>}
                      {c.isAvailable !== undefined && (
                        <span className={c.isAvailable ? "text-green-400" : "text-muted-foreground"}>
                          {c.isAvailable ? "Available" : "Unavailable"}
                        </span>
                      )}
                    </div>
                  </div>
                  {!isViewingAsCompany && (
                    <div className="flex gap-2 shrink-0">
                      {c.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1 text-green-400 border-green-500/30 hover:bg-green-500/10"
                            onClick={() => updateRelationship.mutate({ relationshipId: c.relationshipId, status: "approved" })}>
                            <CheckCircle className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                            onClick={() => updateRelationship.mutate({ relationshipId: c.relationshipId, status: "rejected" })}>
                            <XCircle className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </>
                      )}
                      {c.status === "approved" && (
                        <Button size="sm" variant="outline" className="text-muted-foreground"
                          onClick={() => updateRelationship.mutate({ relationshipId: c.relationshipId, status: "suspended" })}>
                          Suspend
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
