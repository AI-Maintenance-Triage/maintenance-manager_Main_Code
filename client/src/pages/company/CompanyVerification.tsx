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
  ClipboardCheck, DollarSign, Timer, Wrench, Package, CreditCard,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function CompanyVerification() {
  const utils = trpc.useUtils();
  const { data: pendingJobs, isLoading } = trpc.jobs.pendingVerification.useQuery(undefined, {
    refetchInterval: 30000,
  });

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
            description: `$${data.totalCharged?.toFixed(2)} charged. Contractor payout: $${data.contractorPayout?.toFixed(2)}.`,
          });
        }
      } else {
        toast.success("Dispute submitted to contractor.");
      }
      utils.jobs.pendingVerification.invalidate();
      utils.jobs.list.invalidate();
      setSelected(null);
      setAction(null);
      setStep("notes");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const [selected, setSelected] = useState<any | null>(null);
  const [action, setAction] = useState<"approve" | "dispute" | null>(null);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<"notes" | "confirm">("notes");
  const [viewingPhotos, setViewingPhotos] = useState<string[] | null>(null);

  const openDialog = (job: any, act: "approve" | "dispute") => {
    setSelected(job);
    setAction(act);
    setNotes("");
    setStep("notes");
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
    verifyJob.mutate({ jobId: selected.job.id, action, notes });
  };

  const job = selected?.job;
  const laborCost = parseFloat(job?.totalLaborCost ?? "0");
  const partsCost = parseFloat(job?.totalPartsCost ?? "0");
  const totalCost = laborCost + partsCost;
  const laborMinutes = job?.totalLaborMinutes ?? 0;
  const hourlyRate = parseFloat(job?.hourlyRate ?? "0");

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
                      <span>Labor</span>
                      {laborMinutes > 0 && hourlyRate > 0 && (
                        <span className="text-xs text-muted-foreground/60">
                          ({Math.floor(laborMinutes / 60)}h {laborMinutes % 60}m @ ${hourlyRate}/hr)
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-foreground">
                      {laborCost > 0 ? `$${laborCost.toFixed(2)}` : <span className="text-muted-foreground text-xs">Not recorded</span>}
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

              {/* Payment method notice */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <CreditCard className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                <div className="text-xs text-green-300 space-y-0.5">
                  <p className="font-medium">By clicking "Approve & Pay" you authorize this charge.</p>
                  <p className="text-green-300/70">The contractor will receive their payout minus the platform fee. This action cannot be undone.</p>
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

function VerificationCard({ row, onApprove, onDispute, onViewPhotos }: {
  row: any;
  onApprove: () => void;
  onDispute: () => void;
  onViewPhotos: (urls: string[]) => void;
}) {
  const { job, property } = row;
  const photoUrls: string[] = job.completionPhotoUrls ?? [];
  const isDisputed = job.status === "disputed";
  const laborCost = parseFloat(job.totalLaborCost ?? "0");
  const partsCost = parseFloat(job.totalPartsCost ?? "0");
  const totalCost = laborCost + partsCost;

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
          <div className="text-right shrink-0 space-y-1">
            {job.completedAt && (
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                  <Clock className="h-3 w-3" /> Submitted
                </p>
                <p className="text-xs text-foreground">{new Date(job.completedAt).toLocaleDateString()}</p>
              </div>
            )}
            {/* Show cost summary on card */}
            {totalCost > 0 && (
              <div className="flex items-center gap-1 justify-end text-green-400 font-semibold text-sm">
                <DollarSign className="h-3.5 w-3.5" />
                <span>${totalCost.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cost breakdown summary */}
        {(laborCost > 0 || partsCost > 0) && (
          <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/30 border border-border">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                <Timer className="h-3 w-3 text-blue-400" /> Labor
              </div>
              <p className="text-sm font-semibold text-foreground">${laborCost.toFixed(2)}</p>
              {job.totalLaborMinutes > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {Math.floor(job.totalLaborMinutes / 60)}h {job.totalLaborMinutes % 60}m
                </p>
              )}
            </div>
            <div className="text-center border-x border-border">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                <Package className="h-3 w-3 text-amber-400" /> Parts
              </div>
              <p className="text-sm font-semibold text-foreground">${partsCost.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                <Wrench className="h-3 w-3 text-green-400" /> Total
              </div>
              <p className="text-sm font-bold text-green-400">${totalCost.toFixed(2)}</p>
            </div>
          </div>
        )}

        {job.completionNotes && (
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">Contractor's Work Summary</p>
            <p className="text-sm text-foreground">{job.completionNotes}</p>
          </div>
        )}

        {photoUrls.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Image className="h-3 w-3" /> {photoUrls.length} Completion Photo{photoUrls.length !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2 flex-wrap">
              {photoUrls.slice(0, 3).map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Photo ${i + 1}`}
                  className="h-16 w-16 object-cover rounded-lg border border-border cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => onViewPhotos(photoUrls)}
                />
              ))}
              {photoUrls.length > 3 && (
                <button
                  onClick={() => onViewPhotos(photoUrls)}
                  className="h-16 w-16 rounded-lg border border-border bg-muted flex items-center justify-center text-xs text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  +{photoUrls.length - 3} more
                </button>
              )}
            </div>
          </div>
        )}

        {isDisputed && job.disputeNotes && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs font-medium text-red-400 mb-1">Previous Dispute Reason</p>
            <p className="text-sm text-red-300">{job.disputeNotes}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button onClick={onApprove} className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white">
            <CheckCircle className="h-4 w-4" /> Approve
          </Button>
          <Button onClick={onDispute} variant="outline" className="flex-1 gap-2 border-red-500/50 text-red-400 hover:bg-red-500/10">
            <XCircle className="h-4 w-4" /> Dispute
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
