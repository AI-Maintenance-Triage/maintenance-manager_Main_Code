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
import { toast } from "sonner";
import { Gift, Plus } from "lucide-react";

export default function AdminCredits() {
  const utils = trpc.useUtils();
  const { data: credits, isLoading } = trpc.adminControl.listAllCredits.useQuery();

  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [description, setDescription] = useState("");

  const resetForm = () => { setCompanyId(""); setAmountDollars(""); setDescription(""); };

  const issueMutation = trpc.adminControl.issueCredit.useMutation({
    onSuccess: () => { toast.success("Credit issued!"); setOpen(false); resetForm(); utils.adminControl.listAllCredits.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const handleIssue = () => {
    const amountCents = Math.round(parseFloat(amountDollars) * 100);
    if (!companyId || isNaN(amountCents) || amountCents <= 0 || !description) {
      return toast.error("Please fill all fields with valid values");
    }
    issueMutation.mutate({ companyId: parseInt(companyId), amountCents, description });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Gift className="h-6 w-6 text-emerald-500" /> Manual Credits</h1>
          <p className="text-muted-foreground text-sm mt-1">Issue account credits to companies as adjustments or goodwill.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Issue Credit</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Issue Account Credit</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5"><Label>Company ID</Label><Input value={companyId} onChange={e => setCompanyId(e.target.value)} placeholder="Enter company ID" type="number" /></div>
              <div className="space-y-1.5">
                <Label>Amount (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input value={amountDollars} onChange={e => setAmountDollars(e.target.value)} placeholder="0.00" className="pl-7" type="number" step="0.01" min="0.01" />
                </div>
              </div>
              <div className="space-y-1.5"><Label>Description / Reason</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Goodwill credit for service outage..." /></div>
              <Button className="w-full" onClick={handleIssue} disabled={issueMutation.isPending}>Issue Credit</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !credits?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No credits issued yet.</CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Issued By</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {credits.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium">{c.companyName || `Company #${c.companyId}`}</td>
                  <td className="px-4 py-3">
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border">
                      +${(c.amountCents / 100).toFixed(2)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{c.reason || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.issuedByName || `#${c.issuedBy}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
