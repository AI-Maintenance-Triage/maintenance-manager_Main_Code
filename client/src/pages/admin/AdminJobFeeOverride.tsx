import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { DollarSign, Search, AlertTriangle, CheckCircle2, FileText } from "lucide-react";

interface TransactionLookup {
  jobId: number;
  transactionId: number;
  currentPlatformFee: string;
  laborCost: string;
  partsCost: string;
  totalCharged: string;
  status: string;
}

export default function AdminJobFeeOverride() {
  const [jobIdInput, setJobIdInput] = useState("");
  const [reason, setReason] = useState("");
  const [newFeeInput, setNewFeeInput] = useState("");
  const [lookupResult, setLookupResult] = useState<TransactionLookup | null>(null);
  const [overrideResult, setOverrideResult] = useState<{ jobId: number; oldFee: string; newFeeCents: number } | null>(null);

  // We use the overrideJobFee mutation which does the lookup internally,
  // but we want to show a preview first. We'll use a separate lookup query.
  const utils = trpc.useUtils();

  const overrideMutation = trpc.adminControl.overrideJobFee.useMutation({
    onSuccess: (data) => {
      toast.success(`Platform fee updated for Job #${data.jobId}`);
      setOverrideResult(data);
      setLookupResult(null);
      setJobIdInput("");
      setNewFeeInput("");
      setReason("");
    },
    onError: (err) => toast.error(err.message || "Failed to override fee"),
  });

  const jobId = parseInt(jobIdInput, 10);
  const newFeeDollars = parseFloat(newFeeInput);
  const newFeeCents = isNaN(newFeeDollars) ? 0 : Math.round(newFeeDollars * 100);
  const isValidJobId = !isNaN(jobId) && jobId > 0;
  const isValidFee = !isNaN(newFeeDollars) && newFeeDollars >= 0;
  const isValidReason = reason.trim().length >= 5;

  const handleLookup = async () => {
    if (!isValidJobId) {
      toast.error("Enter a valid Job ID");
      return;
    }
    // We'll attempt the override with a "dry run" by just calling the lookup.
    // Since we don't have a separate lookup endpoint, we'll show a confirmation
    // dialog that includes the entered values. The actual transaction details
    // will be verified server-side.
    setLookupResult({
      jobId,
      transactionId: 0,
      currentPlatformFee: "—",
      laborCost: "—",
      partsCost: "—",
      totalCharged: "—",
      status: "—",
    });
  };

  const handleOverride = () => {
    overrideMutation.mutate({
      jobId,
      newPlatformFeeCents: newFeeCents,
      reason: reason.trim(),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-primary" />
          Job Fee Override
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Retroactively adjust the platform fee on a completed job. All changes are logged in the Audit Log.
        </p>
      </div>

      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-sm text-yellow-300">
            This directly modifies the <code className="font-mono text-xs bg-yellow-500/10 px-1 rounded">platformFee</code> column on the transaction record.
            The contractor payout and total charged are <strong>not</strong> automatically recalculated — use this only for accounting corrections.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Override Details</CardTitle>
          <CardDescription>Enter the job ID, new platform fee amount, and a mandatory reason for the change.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="job-id">Job ID *</Label>
              <div className="flex gap-2">
                <Input
                  id="job-id"
                  type="number"
                  min={1}
                  placeholder="e.g. 42"
                  value={jobIdInput}
                  onChange={(e) => {
                    setJobIdInput(e.target.value);
                    setLookupResult(null);
                    setOverrideResult(null);
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleLookup}
                  disabled={!isValidJobId}
                  title="Look up job"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-fee">New Platform Fee ($) *</Label>
              <Input
                id="new-fee"
                type="number"
                min={0}
                step={0.01}
                placeholder="e.g. 12.50"
                value={newFeeInput}
                onChange={(e) => setNewFeeInput(e.target.value)}
              />
            </div>
          </div>

          {lookupResult && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
              <p className="font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Job #{lookupResult.jobId} — Transaction Preview
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
                <span>Current Platform Fee:</span>
                <span className="font-mono text-foreground">{lookupResult.currentPlatformFee}</span>
                <span>New Platform Fee:</span>
                <span className={`font-mono font-semibold ${isValidFee ? "text-primary" : "text-muted-foreground"}`}>
                  {isValidFee ? `$${newFeeDollars.toFixed(2)}` : "—"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Note: Actual current values will be shown in the Audit Log after the override is applied.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason for Override * <span className="text-muted-foreground font-normal">(min 5 characters)</span></Label>
            <Textarea
              id="reason"
              placeholder="e.g. Billing error — contractor was overcharged due to incorrect rate applied. Correcting to agreed rate."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="w-full"
                disabled={
                  overrideMutation.isPending ||
                  !isValidJobId ||
                  !isValidFee ||
                  !isValidReason ||
                  !lookupResult
                }
              >
                <DollarSign className="h-4 w-4 mr-2" />
                {overrideMutation.isPending ? "Applying Override..." : "Apply Fee Override"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Fee Override</AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to set the platform fee for <strong>Job #{jobId}</strong> to{" "}
                  <strong>${newFeeDollars.toFixed(2)}</strong>. This change will be logged in the Audit Log.
                  Reason: <em>"{reason}"</em>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleOverride}>Apply Override</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {overrideResult && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="py-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-400">Override Applied</p>
              <p className="text-sm text-muted-foreground">
                Job #{overrideResult.jobId}: platform fee changed from{" "}
                <span className="font-mono">${overrideResult.oldFee}</span> to{" "}
                <span className="font-mono">${(overrideResult.newFeeCents / 100).toFixed(2)}</span>.
                This change has been recorded in the Audit Log.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground">Usage Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>• Enter the Job ID (visible in the Jobs table or URL) and look it up before applying the override.</p>
          <p>• The new fee is entered in dollars (e.g. <code className="font-mono bg-muted px-1 rounded">12.50</code> = $12.50).</p>
          <p>• Only the <code className="font-mono bg-muted px-1 rounded">platformFee</code> column is modified. <code className="font-mono bg-muted px-1 rounded">contractorPayout</code> and <code className="font-mono bg-muted px-1 rounded">totalCharged</code> are unchanged.</p>
          <p>• Every override is written to the Audit Log with your name, timestamp, old value, new value, and reason.</p>
          <p>• To view past overrides, go to <strong>Audit Log</strong> and filter by action <code className="font-mono bg-muted px-1 rounded">override_job_fee</code>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
