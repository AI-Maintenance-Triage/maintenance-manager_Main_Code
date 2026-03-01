import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Clock, Image, Loader2, AlertTriangle, ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function CompanyVerification() {
  const utils = trpc.useUtils();
  const { data: pendingJobs, isLoading } = trpc.jobs.pendingVerification.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const verifyJob = trpc.jobs.verifyJob.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.action === "approve" ? "Job approved and marked verified!" : "Dispute submitted to contractor.");
      utils.jobs.pendingVerification.invalidate();
      utils.jobs.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const [selected, setSelected] = useState<any | null>(null);
  const [action, setAction] = useState<"approve" | "dispute" | null>(null);
  const [notes, setNotes] = useState("");
  const [viewingPhotos, setViewingPhotos] = useState<string[] | null>(null);

  const openDialog = (job: any, act: "approve" | "dispute") => {
    setSelected(job);
    setAction(act);
    setNotes("");
  };

  const handleSubmit = () => {
    if (!selected || !action) return;
    verifyJob.mutate({ jobId: selected.job.id, action, notes });
  };

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
      <Dialog open={!!selected && !!action} onOpenChange={(open) => { if (!open) { setSelected(null); setAction(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {action === "approve"
                ? <><CheckCircle className="h-5 w-5 text-green-400" /> Approve Job</>
                : <><XCircle className="h-5 w-5 text-red-400" /> Dispute Job</>
              }
            </DialogTitle>
          </DialogHeader>
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
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                <p className="text-xs text-green-300">Approving will mark this job as verified and trigger the payment process.</p>
              </div>
            )}
            {action === "dispute" && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-300">The contractor will be notified and can resubmit after addressing the issues.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelected(null); setAction(null); }}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={verifyJob.isPending || !notes.trim()}
              className={action === "approve"
                ? "gap-2 bg-green-600 hover:bg-green-700 text-white"
                : "gap-2 bg-red-600 hover:bg-red-700 text-white"
              }
            >
              {verifyJob.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : action === "approve" ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />
              }
              {action === "approve" ? "Approve & Verify" : "Submit Dispute"}
            </Button>
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
          {job.completedAt && (
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                <Clock className="h-3 w-3" /> Submitted
              </p>
              <p className="text-xs text-foreground">{new Date(job.completedAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
