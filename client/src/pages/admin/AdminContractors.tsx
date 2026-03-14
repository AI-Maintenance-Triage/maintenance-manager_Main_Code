import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { HardHat, Calendar, Plus, Star, MapPin, Settings } from "lucide-react";
import { useState } from "react";
import { ManageContractorDialog, CreateContractorDialog } from "@/components/admin/AdminContractorDialogs";

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminContractors() {
  const { data: rawContractors, isLoading, refetch } = trpc.adminViewAs.allContractors.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [managingContractor, setManagingContractor] = useState<any | null>(null);

  // Normalize nested {profile, user} shape to flat object for shared dialog
  const contractors = (rawContractors ?? []).map((c: any) => ({
    id: c.profile.id,
    userId: c.user.id,
    userName: c.user.name,
    userEmail: c.user.email,
    email: c.user.email,
    businessName: c.profile.businessName,
    phone: c.profile.phone,
    licenseNumber: c.profile.licenseNumber,
    trades: c.profile.trades,
    serviceAreaZips: c.profile.serviceAreaZips,
    averageRating: c.profile.averageRating,
    isAvailable: c.profile.isAvailable,
    completedJobs: c.profile.completedJobs,
    planId: c.profile.planId,
    planPriceOverride: c.profile.planPriceOverride,
    planNotes: c.profile.planNotes,
    planStatus: c.profile.planStatus,
    planExpiresAt: c.profile.planExpiresAt,
    createdAt: c.profile.createdAt,
    address: c.profile.address,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contractors</h1>
          <p className="text-muted-foreground mt-1">Manage all registered contractors on the platform</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Create Contractor
        </Button>
      </div>

      <CreateContractorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { setCreateOpen(false); refetch(); }}
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !contractors || contractors.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <HardHat className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-card-foreground mb-2">No Contractors Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              When contractors sign up and create profiles, they'll appear here. Use the "Create Contractor" button above to add one directly.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contractors.map((contractor: any) => (
            <Card key={contractor.id} className="bg-card border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <HardHat className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-card-foreground truncate">
                          {contractor.businessName || contractor.userName || `Contractor #${contractor.id}`}
                        </h3>
                        {contractor.userEmail && (
                          <p className="text-xs text-muted-foreground truncate">{contractor.userEmail}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Joined {new Date(contractor.createdAt).toLocaleDateString()}
                      </span>
                      {contractor.averageRating && (
                        <span className="flex items-center gap-1 text-yellow-400">
                          <Star className="h-3 w-3 fill-current" />
                          {parseFloat(contractor.averageRating).toFixed(1)}
                        </span>
                      )}
                      {contractor.serviceAreaZips && contractor.serviceAreaZips.length > 0 && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {contractor.serviceAreaZips.slice(0, 3).join(", ")}{contractor.serviceAreaZips.length > 3 ? ` +${contractor.serviceAreaZips.length - 3}` : ""}
                        </span>
                      )}
                    </div>
                    {contractor.trades && contractor.trades.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {contractor.trades.slice(0, 5).map((trade: string) => (
                          <Badge key={trade} variant="secondary" className="text-xs px-2 py-0">{trade}</Badge>
                        ))}
                        {contractor.trades.length > 5 && (
                          <Badge variant="secondary" className="text-xs px-2 py-0">+{contractor.trades.length - 5} more</Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge
                      variant={contractor.isAvailable ? "default" : "secondary"}
                      className={contractor.isAvailable ? "bg-green-600/20 text-green-400 border-green-600/30" : ""}
                    >
                      {contractor.isAvailable ? "Available" : "Unavailable"}
                    </Badge>
                    {contractor.completedJobs != null && (
                      <span className="text-xs text-muted-foreground">{contractor.completedJobs} jobs</span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1 h-7"
                      onClick={() => setManagingContractor(contractor)}
                    >
                      <Settings className="h-3 w-3" /> Manage
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {managingContractor && (
        <ManageContractorDialog
          contractor={managingContractor}
          open={!!managingContractor}
          onOpenChange={(v) => { if (!v) setManagingContractor(null); }}
          onSaved={() => { setManagingContractor(null); refetch(); }}
        />
      )}
    </div>
  );
}
