import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useViewAs } from "@/contexts/ViewAsContext";
import { HardHat, CheckCircle, XCircle, Star, UserPlus, Mail, Clock, Ban, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function CompanyContractors() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const isAdmin = user?.role === "admin";
  const isViewingAsCompany = isAdmin && viewAs.mode === "company" && viewAs.companyId;

  const utils = trpc.useUtils();

  // Existing contractors
  const regularContractors = trpc.contractor.listByCompany.useQuery(undefined, { enabled: !isViewingAsCompany });
  const viewAsContractors = trpc.adminViewAs.companyContractors.useQuery(
    { companyId: viewAs.companyId! },
    { enabled: !!isViewingAsCompany }
  );
  const contractors = isViewingAsCompany ? viewAsContractors.data : regularContractors.data;
  const isLoading = isViewingAsCompany ? viewAsContractors.isLoading : regularContractors.isLoading;

  // Invites
  const { data: invitesData, isLoading: invitesLoading } = trpc.invites.list.useQuery(undefined, {
    enabled: !isViewingAsCompany,
  });
  const pendingInvites = (invitesData?.invites ?? []).filter((i) => i.status === "pending");

  // Mutations
  const updateRelationship = trpc.contractor.updateRelationship.useMutation({
    onSuccess: () => { toast.success("Updated!"); utils.contractor.listByCompany.invalidate(); },
  });

  const createInvite = trpc.invites.create.useMutation({
    onSuccess: () => {
      toast.success("Invite sent! The contractor will receive an email with a sign-up link.");
      utils.invites.list.invalidate();
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeInvite = trpc.invites.revoke.useMutation({
    onSuccess: () => { toast.success("Invite revoked."); utils.invites.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const resendInvite = trpc.invites.resend.useMutation({
    onSuccess: () => { toast.success("Invite resent! A new email has been sent with a fresh 7-day link."); utils.invites.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  // Dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Approved</Badge>;
      case "pending": return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case "rejected": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Rejected</Badge>;
      case "suspended": return <Badge className="bg-muted text-muted-foreground">Suspended</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleSendInvite = () => {
    if (!inviteEmail.trim()) { toast.error("Email is required"); return; }
    createInvite.mutate({
      email: inviteEmail.trim(),
      name: inviteName.trim() || undefined,
      origin: window.location.origin,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contractors</h1>
          <p className="text-muted-foreground mt-1">
            {isViewingAsCompany ? `Viewing contractors for ${viewAs.companyName}` : "Manage your contractor relationships"}
          </p>
        </div>
        {!isViewingAsCompany && (
          <Button onClick={() => setInviteOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" /> Invite Contractor
          </Button>
        )}
      </div>

      {/* Pending Invites */}
      {!isViewingAsCompany && pendingInvites.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-400" />
              Pending Invites
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 ml-1">{pendingInvites.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-card-foreground truncate">{inv.email}</span>
                    {inv.name && <span className="text-xs text-muted-foreground">({inv.name})</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-5.5">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-primary gap-1"
                    onClick={() => resendInvite.mutate({ inviteId: inv.id, origin: window.location.origin })}
                    disabled={resendInvite.isPending}
                    title="Resend invite with a fresh 7-day link"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Resend
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-red-400 gap-1"
                    onClick={() => revokeInvite.mutate({ inviteId: inv.id })}
                    disabled={revokeInvite.isPending}
                  >
                    <Ban className="h-3.5 w-3.5" /> Revoke
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Contractors List */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !contractors || contractors.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <HardHat className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              {isViewingAsCompany
                ? "No contractors connected to this company yet."
                : "No contractors connected yet. Invite contractors directly or they can request to join through the platform."}
            </p>
            {!isViewingAsCompany && (
              <Button onClick={() => setInviteOpen(true)} variant="outline" className="gap-2">
                <UserPlus className="h-4 w-4" /> Invite Your First Contractor
              </Button>
            )}
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
                      {c.rating && parseFloat(c.rating) > 0 && (
                        <span className="flex items-center gap-1 text-yellow-400">
                          <Star className="h-3.5 w-3.5 fill-yellow-400" />
                          {parseFloat(c.rating).toFixed(1)}
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

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Invite a Contractor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Enter the contractor's email address and we'll send them a personalised invitation with a direct sign-up link. They'll be automatically connected to your company upon registration.
            </p>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address <span className="text-red-400">*</span></Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="contractor@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendInvite()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-name">Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="invite-name"
                placeholder="John Smith"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendInvite()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The invite link expires in 7 days. You can resend or revoke it at any time from this page.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleSendInvite} disabled={createInvite.isPending} className="gap-2">
              <Mail className="h-4 w-4" />
              {createInvite.isPending ? "Sending..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
