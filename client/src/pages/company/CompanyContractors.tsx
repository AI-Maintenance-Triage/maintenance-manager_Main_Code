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
import { HardHat, CheckCircle, XCircle, Star, UserPlus, Mail, Clock, Ban, RefreshCw, Copy, AlertTriangle, ShieldCheck, ShieldOff, TrendingUp, Timer, Award, ChevronDown, ChevronUp } from "lucide-react";
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

  // Invites — always enabled (backend uses getEffectiveCompanyId which handles impersonation)
  const { data: invitesData, isLoading: invitesLoading } = trpc.invites.list.useQuery();
  const pendingInvites = (invitesData?.invites ?? []).filter((i) => i.status === "pending");

  // Dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  // Fallback invite link shown when email delivery fails
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);

  // Scorecard data
  const { data: scorecards } = trpc.contractor.scorecards.useQuery(undefined, { enabled: !isViewingAsCompany });
  const { data: viewAsScorecards } = trpc.adminViewAs.companyScorecards.useQuery(
    { companyId: viewAs.companyId! },
    { enabled: !!isViewingAsCompany }
  );
  const allScorecards = isViewingAsCompany ? viewAsScorecards : scorecards;

  // Expanded scorecard state
  const [expandedScorecard, setExpandedScorecard] = useState<number | null>(null);

  // Mutations
  const updateRelationship = trpc.contractor.updateRelationship.useMutation({
    onSuccess: () => { toast.success("Updated!"); utils.contractor.listByCompany.invalidate(); },
  });
  const setTrusted = trpc.contractor.setTrusted.useMutation({
    onSuccess: (_data: any, vars: any) => {
      toast.success(vars.isTrusted ? "Contractor marked as trusted. They can now see your private job board." : "Trust removed. Contractor can no longer see your private jobs.");
      utils.contractor.listByCompany.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createInvite = trpc.invites.create.useMutation({
    onSuccess: (data) => {
      utils.invites.list.invalidate();
      setInviteEmail("");
      setInviteName("");
      if (data.emailSent) {
        toast.success("Invite sent! The contractor will receive an email with a sign-up link.");
        setInviteOpen(false);
        setFallbackLink(null);
      } else {
        // Email delivery failed (domain not verified in Resend) — show copyable link
        setFallbackLink(data.inviteUrl);
        toast.warning("Email could not be delivered. Copy the invite link below to share manually.");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeInvite = trpc.invites.revoke.useMutation({
    onSuccess: () => { toast.success("Invite revoked."); utils.invites.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const resendInvite = trpc.invites.resend.useMutation({
    onSuccess: (data) => {
      utils.invites.list.invalidate();
      if (data.emailSent) {
        toast.success("Invite resent! A new email has been sent with a fresh 7-day link.");
      } else {
        setFallbackLink(data.inviteUrl);
        setInviteOpen(true);
        toast.warning("Email could not be delivered. Copy the invite link below to share manually.");
      }
    },
    onError: (err) => toast.error(err.message),
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

  const handleSendInvite = () => {
    if (!inviteEmail.trim()) { toast.error("Email is required"); return; }
    setFallbackLink(null);
    createInvite.mutate({
      email: inviteEmail.trim(),
      name: inviteName.trim() || undefined,
      origin: window.location.origin,
    });
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link)
      .then(() => toast.success("Invite link copied to clipboard!"))
      .catch(() => toast.error("Could not copy to clipboard. Please copy the link manually."));
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
        <Button onClick={() => { setInviteOpen(true); setFallbackLink(null); }} className="gap-2">
          <UserPlus className="h-4 w-4" /> Invite Contractor
        </Button>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
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
            <Button onClick={() => { setInviteOpen(true); setFallbackLink(null); }} variant="outline" className="gap-2">
              <UserPlus className="h-4 w-4" /> Invite Your First Contractor
            </Button>
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
                      {c.isTrusted && (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
                          <ShieldCheck className="h-3 w-3" /> Trusted
                        </Badge>
                      )}
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
                    {/* Scorecard toggle */}
                    {allScorecards && allScorecards[c.contractorProfileId] && (
                      <button
                        className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary mt-1.5 transition-colors"
                        onClick={() => setExpandedScorecard(expandedScorecard === c.contractorProfileId ? null : c.contractorProfileId)}
                      >
                        <TrendingUp className="h-3 w-3" />
                        Performance scorecard
                        {expandedScorecard === c.contractorProfileId ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}
                    {expandedScorecard === c.contractorProfileId && allScorecards?.[c.contractorProfileId] && (() => {
                      const sc = allScorecards[c.contractorProfileId];
                      return (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-emerald-400 mb-0.5">
                              <Award className="h-3.5 w-3.5" />
                              <span className="text-lg font-bold">{sc.totalCompleted}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">Jobs Completed</p>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-yellow-400 mb-0.5">
                              <Star className="h-3.5 w-3.5 fill-yellow-400" />
                              <span className="text-lg font-bold">
                                {sc.avgRating != null ? sc.avgRating.toFixed(1) : "—"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Avg Rating{sc.ratingCount > 0 ? ` (${sc.ratingCount})` : ""}
                            </p>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-blue-400 mb-0.5">
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span className="text-lg font-bold">
                                {sc.onTimeRate != null ? `${sc.onTimeRate}%` : "—"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">On-Time Rate</p>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-purple-400 mb-0.5">
                              <Timer className="h-3.5 w-3.5" />
                              <span className="text-lg font-bold">
                                {sc.avgResponseHours != null ? `${sc.avgResponseHours}h` : "—"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Avg Response</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
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
                      <>
                        {c.isTrusted ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-orange-400 border-orange-500/30 hover:bg-orange-500/10"
                            onClick={() => setTrusted.mutate({ relationshipId: c.relationshipId, isTrusted: false })}
                            disabled={setTrusted.isPending}
                            title="Remove trust — contractor will no longer see your private jobs"
                          >
                            <ShieldOff className="h-3.5 w-3.5" /> Remove Trust
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            onClick={() => setTrusted.mutate({ relationshipId: c.relationshipId, isTrusted: true })}
                            disabled={setTrusted.isPending}
                            title="Mark as trusted — grants access to your private job board"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" /> Mark Trusted
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="text-muted-foreground"
                          onClick={() => updateRelationship.mutate({ relationshipId: c.relationshipId, status: "suspended" })}>
                          Suspend
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) setFallbackLink(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Invite a Contractor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Fallback link shown when email delivery fails */}
            {fallbackLink ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-300">
                    <p className="font-medium mb-1">Email delivery unavailable</p>
                    <p className="text-amber-400/80 text-xs">
                      The invite was created successfully but the email could not be sent. This is because the platform's email sender domain hasn't been verified yet. Share the link below directly with the contractor.
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Invite Link (valid for 7 days)</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={fallbackLink}
                      className="text-xs font-mono bg-muted/50 text-foreground"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button size="icon" variant="outline" onClick={() => handleCopyLink(fallbackLink)} title="Copy link">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button className="w-full" onClick={() => { setInviteOpen(false); setFallbackLink(null); }}>
                  Done
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Enter the contractor's email address and we'll send them a personalised invitation with a direct sign-up link. They'll be automatically connected to your company upon registration.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email Address <span className="text-red-400">*</span></Label>
                  <Input
                    id="invite-email"
                    name="email"
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
                    name="name"
                    placeholder="John Smith"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendInvite()}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The invite link expires in 7 days. You can resend or revoke it at any time from this page.
                </p>
              </>
            )}
          </div>
          {!fallbackLink && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={handleSendInvite} disabled={createInvite.isPending} className="gap-2">
                <Mail className="h-4 w-4" />
                {createInvite.isPending ? "Sending..." : "Send Invite"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
