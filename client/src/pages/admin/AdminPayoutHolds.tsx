import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { PauseCircle, PlayCircle, Plus } from "lucide-react";

export default function AdminPayoutHolds() {
  const utils = trpc.useUtils();
  const { data: holds, isLoading } = trpc.adminControl.listPayoutHolds.useQuery();

  const [open, setOpen] = useState(false);
  const [contractorId, setContractorId] = useState("");
  const [reason, setReason] = useState("");

  const resetForm = () => { setContractorId(""); setReason(""); };

  const placeMutation = trpc.adminControl.placePayoutHold.useMutation({
    onSuccess: () => { toast.success("Payout hold placed!"); setOpen(false); resetForm(); utils.adminControl.listPayoutHolds.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const releaseMutation = trpc.adminControl.releasePayoutHold.useMutation({
    onSuccess: () => { toast.success("Payout hold released!"); utils.adminControl.listPayoutHolds.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const activeHolds = holds?.filter((h: any) => h.isActive) ?? [];
  const releasedHolds = holds?.filter((h: any) => !h.isActive) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><PauseCircle className="h-6 w-6 text-orange-500" /> Payout Holds</h1>
          <p className="text-muted-foreground text-sm mt-1">Place or release payout holds on contractor accounts.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10">
              <Plus className="h-4 w-4 mr-2" />Place Hold
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Place Payout Hold</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5"><Label>Contractor ID</Label><Input value={contractorId} onChange={e => setContractorId(e.target.value)} placeholder="Enter contractor profile ID" type="number" /></div>
              <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason for holding payouts..." /></div>
              <Button
                className="w-full bg-orange-600 hover:bg-orange-700"
                onClick={() => placeMutation.mutate({ contractorId: parseInt(contractorId), reason })}
                disabled={placeMutation.isPending || !contractorId || !reason}
              >
                Place Hold
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active Holds ({activeHolds.length})</h2>
            {!activeHolds.length ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No active payout holds.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {activeHolds.map((h: any) => (
                  <Card key={h.id} className="border-orange-500/20">
                    <CardContent className="py-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 border text-xs">Hold Active</Badge>
                          <span className="font-semibold text-sm">Contractor #{h.contractorId}</span>
                          {h.contractorName && <span className="text-sm text-muted-foreground">— {h.contractorName}</span>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{h.reason}</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">Placed {new Date(h.placedAt).toLocaleString()}</p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="text-green-500 border-green-500/30 hover:bg-green-500/10">
                            <PlayCircle className="h-3.5 w-3.5 mr-1" />Release
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Release Payout Hold?</AlertDialogTitle><AlertDialogDescription>Contractor #{h.contractorId} will be able to receive payouts again.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => releaseMutation.mutate({ contractorId: h.contractorId })}>Release</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {releasedHolds.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Released ({releasedHolds.length})</h2>
              <div className="space-y-2">
                {releasedHolds.map((h: any) => (
                  <Card key={h.id} className="opacity-60">
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">Released</Badge>
                        <span className="text-sm">Contractor #{h.contractorId}</span>
                        <span className="text-xs text-muted-foreground">— {h.reason}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">Released {h.releasedAt ? new Date(h.releasedAt).toLocaleString() : "—"}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
