import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle, XCircle, Clock, Image, Loader2, AlertTriangle,
  ClipboardCheck, DollarSign, Timer, Package, CreditCard, Map, Receipt,
  MapPin, ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, Filter, Flag, FlagOff,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { RouteReplayDialog } from "@/components/RouteReplayDialog";
import { RateContractorDialog } from "@/components/RateContractorDialog";
import PaymentMethodManager from "@/components/PaymentMethodManager";

export default function CompanyVerification() {
  const utils = trpc.useUtils();
  const { data: pendingJobs, isLoading } = trpc.jobs.pendingVerification.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const { data: platformFeeData } = trpc.platform.getFee.useQuery();
  const platformFeePercent = platformFeeData?.platformFeePercent ?? 5;
  const perListingFeeEnabled = platformFeeData?.perListingFeeEnabled ?? false;
  const perListingFeeAmount = platformFeeData?.perListingFeeAmount ?? 0;

  const [selected, setSelected] = useState<any | null>(null);
  const [action, setAction] = useState<"approve" | "dispute" | null>(null);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<"notes" | "confirm">("notes");
  const [viewingPhotos, setViewingPhotos] = useState<string[] | null>(null);
  const [replayJobId, setReplayJobId] = useState<number | null>(null);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [pendingRatingJob, setPendingRatingJob] = useState<{ id: number; contractorName?: string } | null>(null);

  // Check if contractorRatings feature is enabled for this company
  const { data: planData } = trpc.company.getMyPlan.useQuery();
  const hasRatingsFeature = !!(planData?.plan?.features as any)?.contractorRatings;

  const verifyJob = trpc.jobs.verifyJob.useMutation({
    onSuccess: (data, vars) => {
      if (vars.action === "approve") {
        if (data.paymentSkipped) {
          toast.success("Job approved and verified!", {
            description: data.reason === "no_payment_method"
              ? "No payment method on file — payment skipped."
              : data.reason === "contractor_no_stripe"
              ? "Contractor has no Stripe account — payment skipped."
              : data.reason === "zero_cost"
              ? "Job has no recorded cost — payment skipped."
              : `Payment skipped: ${data.reason}`,
          });
        } else {
          toast.success("Job approved & payment processed!", {
            description: `$${data.totalCharged?.toFixed(2)} charged to company. Contractor payout: $${data.contractorPayout?.toFixed(2)}.`,
          });
        }
      } else {
        toast.success("Dispute submitted to contractor.");
      }
      utils.jobs.pendingVerification.invalidate();
      utils.jobs.list.invalidate();
      // After a successful payment approval, prompt the company to rate the contractor (if feature is enabled)
      if (vars.action === "approve" && hasRatingsFeature) {
        const jobForRating = selected;
        setSelected(null);
        setAction(null);
        setStep("notes");
        // Slight delay so the payment toast is visible before the rating dialog opens
        setTimeout(() => {
          setPendingRatingJob({
            id: jobForRating?.job?.id,
            contractorName: jobForRating?.job?.contractorName ?? jobForRating?.job?.assignedContractorName ?? undefined,
          });
        }, 800);
      } else {
        setSelected(null);
        setAction(null);
        setStep("notes");
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openDialog = (job: any, act: "approve" | "dispute") => {
    setSelected(job);
    setAction(act);
    setNotes("");
    setStep("notes");
    setSelectedPaymentMethodId(null);
  };

  const handleNext = () => {
    if (!notes.trim()) return;
    if (action === "approve") {
      setStep("confirm");
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!selected || !action) return;
    verifyJob.mutate({
      jobId: selected.job.id,
      action,
      notes,
      paymentMethodId: selectedPaymentMethodId ?? undefined,
    });
  };

  const job = selected?.job;
  const laborCost = parseFloat(job?.totalLaborCost ?? "0");
  const partsCost = parseFloat(job?.totalPartsCost ?? "0");
  const subtotal = laborCost + partsCost;
  const platformFeeAmount = subtotal > 0 ? subtotal * (platformFeePercent / 100) : 0;
  const listingFeeAmount = perListingFeeEnabled ? perListingFeeAmount : 0;
  const totalCost = subtotal + platformFeeAmount + listingFeeAmount;
  const laborMinutes = job?.totalLaborMinutes ?? 0;
  const hourlyRate = parseFloat(job?.hourlyRate ?? "0");
  const sessionCount = selected?.job?.sessionCount ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Job Verification</h1>
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Job Verification</h1>
        <p className="text-muted-foreground mt-1">Review completed jobs submitted by contractors and approve or dispute them</p>
      </div>

      {(!pendingJobs || pendingJobs.length === 0) ? (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <ClipboardCheck className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground mb-1">All caught up</p>
            <p className="text-muted-foreground">No jobs are currently awaiting verification.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {pendingJobs.length} job{pendingJobs.length !== 1 ? "s" : ""} awaiting review
          </p>
          {pendingJobs.map((row: any) => (
            <VerificationCard
              key={row.job.id}
              row={row}
              onApprove={() => openDialog(row, "approve")}
              onDispute={() => openDialog(row, "dispute")}
              onViewPhotos={(urls) => setViewingPhotos(urls)}
              onViewRoute={(jobId) => setReplayJobId(jobId)}
            />
          ))}
        </div>
      )}

      {/* Approve / Dispute Dialog */}
      <Dialog open={!!selected && !!action} onOpenChange={(open) => {
        if (!open) { setSelected(null); setAction(null); setStep("notes"); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {action === "approve"
                ? <><CheckCircle className="h-5 w-5 text-green-400" /> {step === "confirm" ? "Confirm Payment" : "Approve Job"}</>
                : <><XCircle className="h-5 w-5 text-red-400" /> Dispute Job</>
              }
            </DialogTitle>
          </DialogHeader>

          {/* ── STEP 1: Notes ── */}
          {step === "notes" && (
            <div className="space-y-4 py-2">
              {selected && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  <p className="font-medium text-foreground">{selected.job.title}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{selected.property?.name || selected.property?.address}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="verify-notes">
                  {action === "approve" ? "Approval Notes" : "Dispute Reason"} <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="verify-notes"
                  placeholder={action === "approve"
                    ? "Confirm the work was completed satisfactorily..."
                    : "Describe what was not completed correctly or what needs to be redone..."
                  }
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>
              {action === "approve" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <DollarSign className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-300">Next you'll review the final cost breakdown before authorizing payment.</p>
                </div>
              )}
              {action === "dispute" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-300">The contractor will be notified and can resubmit after addressing the issues.</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Payment Confirmation (approve only) ── */}
          {step === "confirm" && action === "approve" && job && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium text-foreground">{job.title}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{selected.property?.name || selected.property?.address}</p>
              </div>

              {/* Cost breakdown */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Cost Breakdown
                </div>
                <div className="p-4 space-y-3">
                  {/* Labor */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Timer className="h-4 w-4 text-blue-400" />
                      <div>
                        <span>Labor</span>
                        {laborMinutes > 0 && (
                          <span className="text-xs text-muted-foreground/60 ml-1.5">
                            {Math.floor(laborMinutes / 60)}h {laborMinutes % 60}m
                            {hourlyRate > 0 && ` @ $${hourlyRate}/hr`}
                            {sessionCount > 0 && ` (${sessionCount} session${sessionCount !== 1 ? 's' : ''})`}
                          </span>
                        )}
                        {laborMinutes === 0 && (
                          <span className="text-xs text-yellow-400/70 ml-1.5">(no time sessions recorded)</span>
                        )}
                      </div>
                    </div>
                    <span className="font-medium text-foreground">
                      {laborCost > 0 ? `$${laborCost.toFixed(2)}` : <span className="text-muted-foreground text-xs">$0.00</span>}
                    </span>
                  </div>

                  {/* Parts */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Package className="h-4 w-4 text-amber-400" />
                      <span>Parts & Materials</span>
                    </div>
                    <span className="font-medium text-foreground">
                      {partsCost > 0 ? `$${partsCost.toFixed(2)}` : <span className="text-muted-foreground text-xs">$0.00</span>}
                    </span>
                  </div>

                  {/* Platform Fee */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CreditCard className="h-4 w-4 text-purple-400" />
                      <span>Platform Service Fee ({platformFeePercent}%)</span>
                    </div>
                    <span className="font-medium text-foreground">
                      {platformFeeAmount > 0 ? `$${platformFeeAmount.toFixed(2)}` : <span className="text-muted-foreground text-xs">$0.00</span>}
                    </span>
                  </div>

                  {/* Per-Listing Fee */}
                  {perListingFeeEnabled && (
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Receipt className="h-4 w-4 text-orange-400" />
                        <span>Per-Listing Fee</span>
                      </div>
                      <span className="font-medium text-foreground">
                        {listingFeeAmount > 0 ? `$${listingFeeAmount.toFixed(2)}` : <span className="text-muted-foreground text-xs">$0.00</span>}
                      </span>
                    </div>
                  )}

                  <Separator />

                  {/* Total */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                      <DollarSign className="h-4 w-4 text-green-400" />
                      <span>Total to be Charged</span>
                    </div>
                    <span className="text-xl font-bold text-green-400">
                      {totalCost > 0 ? `$${totalCost.toFixed(2)}` : <span className="text-sm text-muted-foreground">$0.00</span>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment method selector */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <CreditCard className="h-3.5 w-3.5" />
                  Pay From Account
                </div>
                <div className="p-3">
                  <PaymentMethodManager
                    selectorMode
                    selectedId={selectedPaymentMethodId}
                    onSelect={setSelectedPaymentMethodId}
                  />
                </div>
              </div>

              {/* Payment authorization notice */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <CreditCard className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                <div className="text-xs text-green-300 space-y-0.5">
                  <p className="font-medium">By clicking "Approve & Pay" you authorize this charge.</p>
                  <p className="text-green-300/70">
                    The contractor receives the full job cost (labor + parts). The {platformFeePercent}% platform service fee{perListingFeeEnabled ? ` + $${perListingFeeAmount.toFixed(2)} listing fee` : ""} is added on top and charged to you. This action cannot be undone.
                  </p>
                </div>
              </div>

              {totalCost <= 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-300">No cost has been recorded for this job. The job will be marked verified but no payment will be processed.</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {step === "notes" ? (
              <>
                <Button variant="outline" onClick={() => { setSelected(null); setAction(null); }}>Cancel</Button>
                <Button
                  onClick={handleNext}
                  disabled={!notes.trim()}
                  className={action === "approve"
                    ? "gap-2 bg-green-600 hover:bg-green-700 text-white"
                    : "gap-2 bg-red-600 hover:bg-red-700 text-white"
                  }
                >
                  {action === "approve"
                    ? <><DollarSign className="h-4 w-4" /> Review Payment</>
                    : <><XCircle className="h-4 w-4" /> Submit Dispute</>
                  }
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep("notes")}>← Back</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={verifyJob.isPending}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  {verifyJob.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <CheckCircle className="h-4 w-4" />
                  }
                  {verifyJob.isPending ? "Processing..." : "Approve & Pay"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mandatory Contractor Rating Dialog (shown after payment approval, gated by contractorRatings plan feature) */}
      {pendingRatingJob && (
        <RateContractorDialog
          open={!!pendingRatingJob}
          onOpenChange={(open) => { if (!open) setPendingRatingJob(null); }}
          maintenanceRequestId={pendingRatingJob.id}
          contractorName={pendingRatingJob.contractorName}
          onRated={() => {
            setPendingRatingJob(null);
            utils.jobs.list.invalidate();
          }}
        />
      )}

      {/* Route Replay Dialog */}
      <RouteReplayDialog
        jobId={replayJobId ?? 0}
        jobTitle="Job Route Replay"
        open={!!replayJobId}
        onOpenChange={(open) => { if (!open) setReplayJobId(null); }}
      />

      {/* Photo Lightbox */}
      <Dialog open={!!viewingPhotos} onOpenChange={(open) => { if (!open) setViewingPhotos(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Image className="h-5 w-5" /> Completion Photos</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {viewingPhotos?.map((url, i) => (
              <img key={i} src={url} alt={`Photo ${i + 1}`} className="w-full rounded-lg object-cover max-h-64" />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── FlagSessionButton ────────────────────────────────────────────────────────
function FlagSessionButton({ sessionId, isFlagged, jobId }: { sessionId: number; isFlagged: boolean; jobId: number }) {
  const utils = trpc.useUtils();
  const flagSession = trpc.timeTracking.flagSession.useMutation({
    onSuccess: () => {
      toast.success("Session flagged for review");
      utils.jobs.timeSessions.invalidate({ jobId });
    },
    onError: (err: any) => toast.error(err.message),
  });
  const unflagSession = trpc.timeTracking.unflagSession.useMutation({
    onSuccess: () => {
      toast.success("Session unflagged");
      utils.jobs.timeSessions.invalidate({ jobId });
    },
    onError: (err: any) => toast.error(err.message),
  });
  const isPending = flagSession.isPending || unflagSession.isPending;
  if (isFlagged) {
    return (
      <button
        onClick={() => unflagSession.mutate({ sessionId })}
        disabled={isPending}
        title="Remove flag"
        className="text-yellow-400 hover:text-yellow-300 transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlagOff className="h-3 w-3" />}
      </button>
    );
  }
  return (
    <button
      onClick={() => flagSession.mutate({ sessionId })}
      disabled={isPending}
      title="Flag for review"
      className="text-muted-foreground hover:text-yellow-400 transition-colors disabled:opacity-50"
    >
      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flag className="h-3 w-3" />}
    </button>
  );
}

function VerificationCard({ row, onApprove, onDispute, onViewPhotos, onViewRoute }: {
  row: any;
  onApprove: () => void;
  onDispute: () => void;
  onViewPhotos: (urls: string[]) => void;
  onViewRoute: (jobId: number) => void;
}) {
  const { job, property } = row;
  const photoUrls: string[] = job.completionPhotoUrls ?? [];
  const isDisputed = job.status === "disputed";
  const laborCost = parseFloat(job.totalLaborCost ?? "0");
  const partsCost = parseFloat(job.totalPartsCost ?? "0");
  const totalCost = laborCost + partsCost;
  const [showSessions, setShowSessions] = useState(false);
  const [billableOnly, setBillableOnly] = useState(false);

  // Fetch time sessions when expanded
  const { data: sessions, isLoading: sessionsLoading } = trpc.jobs.timeSessions.useQuery(
    { jobId: job.id },
    { enabled: showSessions }
  );

  const displayedSessions = billableOnly
    ? (sessions ?? []).filter((s: any) => s.clockInVerified)
    : (sessions ?? []);

  const outOfGeofenceCount = (sessions ?? []).filter((s: any) => s.clockInVerified === false).length;

  return (
    <Card className={`bg-card border-border ${isDisputed ? "border-red-500/30" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{job.title}</CardTitle>
              {job.isEmergency && <Badge variant="destructive" className="text-xs">Emergency</Badge>}
              {isDisputed && <Badge variant="destructive" className="text-xs">Disputed</Badge>}
              {!isDisputed && <Badge className="text-xs bg-orange-500/20 text-orange-400 border-orange-500/30">Awaiting Review</Badge>}
            </div>
            {property && (
              <p className="text-sm text-muted-foreground mt-1">
                {property.name || property.address} — {property.city}, {property.state}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            {job.completedAt && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Submitted {new Date(job.completedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Contractor work summary */}
        {job.completionNotes && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Contractor's Work Summary</p>
            <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3">{job.completionNotes}</p>
          </div>
        )}

        {/* Cost summary */}
        {totalCost > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5 text-green-400" />
              <span>Est. Job Cost: <span className="text-foreground font-medium">${totalCost.toFixed(2)}</span></span>
            </div>
            {job.totalLaborMinutes > 0 && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Timer className="h-3.5 w-3.5 text-blue-400" />
                <span>{Math.floor(job.totalLaborMinutes / 60)}h {job.totalLaborMinutes % 60}m on site</span>
              </div>
            )}
          </div>
        )}

        {/* Completion photos */}
        {photoUrls.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Image className="h-3 w-3" /> {photoUrls.length} Completion Photo{photoUrls.length !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2 flex-wrap">
              {photoUrls.slice(0, 3).map((url, i) => (
                <button
                  key={i}
                  onClick={() => onViewPhotos(photoUrls)}
                  className="w-16 h-16 rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
                >
                  <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
              {photoUrls.length > 3 && (
                <button
                  onClick={() => onViewPhotos(photoUrls)}
                  className="w-16 h-16 rounded-lg border border-border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground hover:border-primary/50 transition-colors"
                >
                  +{photoUrls.length - 3}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Materials / Parts receipts submitted by contractor */}
        {job.receipts && job.receipts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              Materials Submitted for Reimbursement
            </p>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 divide-y divide-amber-500/10">
              {job.receipts.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                  <p className="text-sm text-foreground flex-1 truncate">{r.description ?? "Materials"}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    {r.receiptImageUrl && (
                      <button
                        onClick={() => onViewPhotos([r.receiptImageUrl])}
                        className="w-9 h-9 rounded border border-amber-500/30 overflow-hidden hover:border-amber-400 transition-colors"
                        title="View receipt"
                      >
                        <img src={r.receiptImageUrl} alt="Receipt" className="w-full h-full object-cover" />
                      </button>
                    )}
                    <span className="text-sm font-medium text-amber-300 min-w-[4rem] text-right">
                      ${parseFloat(r.amount ?? "0").toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {/* View all receipt photos button */}
            {job.receipts.some((r: any) => r.receiptImageUrl) && (
              <button
                onClick={() => onViewPhotos(job.receipts.filter((r: any) => r.receiptImageUrl).map((r: any) => r.receiptImageUrl))}
                className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2"
              >
                <Image className="h-3 w-3" />
                View Receipt Photo{job.receipts.filter((r: any) => r.receiptImageUrl).length > 1 ? "s" : ""}
                {job.receipts.filter((r: any) => r.receiptImageUrl).length > 1
                  ? ` (${job.receipts.filter((r: any) => r.receiptImageUrl).length})`
                  : ""}
              </button>
            )}
          </div>
        )}

        {/* Disputed notes */}
        {isDisputed && job.disputeNotes && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs font-medium text-red-400 mb-1">Dispute Reason</p>
            <p className="text-sm text-red-300">{job.disputeNotes}</p>
          </div>
        )}

        {/* Time Sessions Breakdown */}
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowSessions((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors text-sm"
          >
            <div className="flex items-center gap-2">
              <Timer className="h-3.5 w-3.5 text-blue-400" />
              <span className="font-medium text-foreground">Time Sessions</span>
              {outOfGeofenceCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded px-1.5 py-0.5">
                  <ShieldAlert className="h-3 w-3" />
                  {outOfGeofenceCount} outside geofence
                </span>
              )}
            </div>
            {showSessions ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {showSessions && (
            <div className="p-3 space-y-2">
              {/* Billable Only toggle */}
              {outOfGeofenceCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Showing {displayedSessions.length} of {sessions?.length ?? 0} sessions</span>
                  <button
                    onClick={() => setBillableOnly((v) => !v)}
                    className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${
                      billableOnly
                        ? "bg-green-500/20 border-green-500/30 text-green-400"
                        : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Filter className="h-3 w-3" />
                    Billable Only
                  </button>
                </div>
              )}

              {sessionsLoading && (
                <div className="flex items-center gap-2 py-3 justify-center text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading sessions...
                </div>
              )}

              {!sessionsLoading && displayedSessions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  {billableOnly ? "No on-site verified sessions found." : "No time sessions recorded for this job."}
                </p>
              )}

              {!sessionsLoading && displayedSessions.map((s: any, i: number) => {
                const clockIn = s.clockInTime ? new Date(s.clockInTime) : null;
                const clockOut = s.clockOutTime ? new Date(s.clockOutTime) : null;
                const mins = s.totalMinutes ?? (clockIn && clockOut ? Math.round((clockOut.getTime() - clockIn.getTime()) / 60000) : null);
                const billableMins = s.billableMinutes ?? mins;
                const isVerified = s.clockInVerified === true;
                const isUnverified = s.clockInVerified === false;
                const isFlagged = s.status === "flagged";

                return (
                  <div key={s.id ?? i} className={`rounded-lg border p-2.5 text-xs space-y-1 ${
                    isFlagged ? "border-yellow-500/30 bg-yellow-500/5" :
                    isUnverified ? "border-orange-500/30 bg-orange-500/5" : "border-border bg-muted/10"
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {isVerified && <ShieldCheck className="h-3.5 w-3.5 text-green-400 shrink-0" />}
                        {isUnverified && <ShieldAlert className="h-3.5 w-3.5 text-orange-400 shrink-0" />}
                        {s.clockInVerified === null && <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        <span className="text-foreground font-medium">Session {i + 1}</span>
                        {isUnverified && (
                          <span className="text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded px-1 py-0.5">Outside geofence</span>
                        )}
                        {isFlagged && (
                          <span className="text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-1 py-0.5 flex items-center gap-0.5"><Flag className="h-2.5 w-2.5" /> Flagged</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${
                          isFlagged ? "text-yellow-400" :
                          isUnverified ? "text-orange-400" : "text-blue-400"
                        }`}>
                          {mins != null ? `${Math.floor(mins / 60)}h ${mins % 60}m` : "Active"}
                        </span>
                        {s.id && (
                          <FlagSessionButton sessionId={s.id} isFlagged={isFlagged} jobId={job.id} />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>In: {clockIn ? clockIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                      <span>Out: {clockOut ? clockOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : <span className="text-yellow-400">Still active</span>}</span>
                      {billableMins != null && billableMins !== mins && (
                        <span className="text-green-400">Billable: {Math.floor(billableMins / 60)}h {billableMins % 60}m</span>
                      )}
                    </div>
                    {clockIn && (
                      <div className="text-muted-foreground/60">
                        {clockIn.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => onViewRoute(job.id)}
          >
            <Map className="h-3.5 w-3.5" /> View Route
          </Button>
          {!isDisputed && (
            <>
              <Button
                size="sm"
                onClick={onApprove}
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white flex-1"
              >
                <CheckCircle className="h-4 w-4" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onDispute}
                className="gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10"
              >
                <XCircle className="h-4 w-4" /> Dispute
              </Button>
            </>
          )}
          {isDisputed && (
            <Button
              size="sm"
              onClick={onApprove}
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="h-4 w-4" /> Approve Anyway
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
