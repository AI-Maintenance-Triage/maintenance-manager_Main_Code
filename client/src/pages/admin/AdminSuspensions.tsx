import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Ban, CheckCircle, Plus } from "lucide-react";

export default function AdminSuspensions() {
  const utils = trpc.useUtils();
  const { data: suspensions, isLoading } = trpc.adminControl.listSuspensions.useQuery();

  const [open, setOpen] = useState(false);
  const [targetType, setTargetType] = useState<"company" | "contractor">("company");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");

  const resetForm = () => { setTargetType("company"); setTargetId(""); setReason(""); };

  const suspendMutation = trpc.adminControl.suspendAccount.useMutation({
    onSuccess: () => { toast.success("Account suspended!"); setOpen(false); resetForm(); utils.adminControl.listSuspensions.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const reinstateMutation = trpc.adminControl.reinstateAccount.useMutation({
    onSuccess: () => { toast.success("Account reinstated!"); utils.adminControl.listSuspensions.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const activeSuspensions = suspensions?.filter((s: any) => s.isActive) ?? [];
  const historicalSuspensions = suspensions?.filter((s: any) => !s.isActive) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Ban className="h-6 w-6 text-red-500" /> Account Suspensions</h1>
          <p className="text-muted-foreground text-sm mt-1">Suspend or reinstate company and contractor accounts.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button variant="destructive"><Plus className="h-4 w-4 mr-2" />Suspend Account</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Suspend Account</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Account Type</Label>
                <Select value={targetType} onValueChange={(v: any) => setTargetType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Account ID</Label><Input value={targetId} onChange={e => setTargetId(e.target.value)} placeholder="Enter the numeric ID" type="number" /></div>
              <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason for suspension..." /></div>
              <Button
                className="w-full bg-red-600 hover:bg-red-700"
                onClick={() => suspendMutation.mutate({ targetType, targetId: parseInt(targetId), reason })}
                disabled={suspendMutation.isPending || !targetId || !reason}
              >
                Confirm Suspension
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active Suspensions ({activeSuspensions.length})</h2>
            {!activeSuspensions.length ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No active suspensions.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {activeSuspensions.map((s: any) => (
                  <Card key={s.id} className="border-red-500/20">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive" className="text-xs">{s.targetType}</Badge>
                            <span className="font-semibold text-sm">ID #{s.targetId}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{s.reason}</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">Suspended {new Date(s.suspendedAt).toLocaleString()}</p>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-green-500 border-green-500/30 hover:bg-green-500/10">
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />Reinstate
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Reinstate Account?</AlertDialogTitle><AlertDialogDescription>This will restore access for {s.targetType} #{s.targetId}.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => reinstateMutation.mutate({ targetType: s.targetType, targetId: s.targetId })}>Reinstate</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {historicalSuspensions.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">History ({historicalSuspensions.length})</h2>
              <div className="space-y-2">
                {historicalSuspensions.map((s: any) => (
                  <Card key={s.id} className="opacity-60">
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{s.targetType}</Badge>
                        <span className="text-sm">ID #{s.targetId}</span>
                        <span className="text-xs text-muted-foreground">— {s.reason}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">Reinstated {s.reinstatedAt ? new Date(s.reinstatedAt).toLocaleString() : "—"}</span>
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
