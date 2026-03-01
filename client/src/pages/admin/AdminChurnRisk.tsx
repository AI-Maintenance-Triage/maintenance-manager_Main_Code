import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TrendingDown, AlertCircle, Clock, Mail, Send } from "lucide-react";
import { toast } from "sonner";

function RiskBadge({ score }: { score: number }) {
  if (score >= 70) return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 border text-xs">High Risk</Badge>;
  if (score >= 40) return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 border text-xs">Medium Risk</Badge>;
  return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 border text-xs">Low Risk</Badge>;
}

interface ReEngageDialogProps {
  company: { companyId: number; companyName?: string; companyEmail?: string } | null;
  onClose: () => void;
}

function ReEngageDialog({ company, onClose }: ReEngageDialogProps) {
  const defaultSubject = `We miss you at Maintenance Manager!`;
  const defaultBody = `Hi ${company?.companyName ?? "there"},\n\nWe noticed you haven't been active on Maintenance Manager recently. We'd love to help you get back on track with your property maintenance.\n\nHere are a few things you can do right now:\n• Post a new maintenance request\n• Review your open jobs\n• Check in with your contractors\n\nIf you have any questions or need help, just reply to this email.\n\nBest regards,\nThe Maintenance Manager Team`;

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  const sendBlast = trpc.adminControl.sendEmailBlast.useMutation({
    onSuccess: (data) => {
      toast.success(`Re-engagement email sent to ${data.sent} recipient(s).`);
      onClose();
    },
    onError: (err) => toast.error(err.message || "Failed to send email"),
  });

  const handleSend = () => {
    if (!company?.companyEmail) {
      toast.error("No email address on file for this company.");
      return;
    }
    sendBlast.mutate({
      customEmails: [company.companyEmail],
      subject,
      body,
    });
  };

  return (
    <Dialog open={!!company} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Re-engage {company?.companyName ?? "Company"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="re-subject">Subject</Label>
            <Input id="re-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="re-body">Message</Label>
            <Textarea
              id="re-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
          </div>
          {company?.companyEmail && (
            <p className="text-xs text-muted-foreground">
              Will be sent to: <span className="font-medium text-foreground">{company.companyEmail}</span>
            </p>
          )}
          {!company?.companyEmail && (
            <p className="text-xs text-red-400">No email address on file for this company.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSend}
            disabled={sendBlast.isPending || !company?.companyEmail || !subject.trim() || !body.trim()}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {sendBlast.isPending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminChurnRisk() {
  const { data: companies, isLoading } = trpc.adminControl.churnRisk.useQuery();
  const [reEngageTarget, setReEngageTarget] = useState<{ companyId: number; companyName?: string; companyEmail?: string } | null>(null);

  const highRisk = companies?.filter((c: any) => (c.churnScore ?? 0) >= 70) ?? [];
  const mediumRisk = companies?.filter((c: any) => (c.churnScore ?? 0) >= 40 && (c.churnScore ?? 0) < 70) ?? [];
  const lowRisk = companies?.filter((c: any) => (c.churnScore ?? 0) < 40) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingDown className="h-6 w-6 text-red-500" /> Churn Risk Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Companies at risk of churning based on activity and engagement signals. Click <strong>Re-engage</strong> to send a pre-filled email.
        </p>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-red-500/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div>
                  <p className="text-2xl font-bold text-red-400">{highRisk.length}</p>
                  <p className="text-xs text-muted-foreground">High Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-400" />
                <div>
                  <p className="text-2xl font-bold text-yellow-400">{mediumRisk.length}</p>
                  <p className="text-xs text-muted-foreground">Medium Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold text-blue-400">{lowRisk.length}</p>
                  <p className="text-xs text-muted-foreground">Low Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !companies?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No churn risk data available yet.</CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Risk Score</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Active</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Jobs (30d)</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Risk</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {companies.map((c: any) => (
                <tr key={c.companyId} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.companyName || `Company #${c.companyId}`}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${(c.churnScore ?? 0) >= 70 ? "bg-red-500" : (c.churnScore ?? 0) >= 40 ? "bg-yellow-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min(100, c.churnScore ?? 0)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono">{c.churnScore ?? 0}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.lastActiveAt ? new Date(c.lastActiveAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.recentJobs ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.planName || "—"}</td>
                  <td className="px-4 py-3"><RiskBadge score={c.churnScore ?? 0} /></td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-7"
                      onClick={() => setReEngageTarget({ companyId: c.companyId, companyName: c.companyName, companyEmail: c.companyEmail })}
                    >
                      <Mail className="h-3 w-3" />
                      Re-engage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReEngageDialog
        company={reEngageTarget}
        onClose={() => setReEngageTarget(null)}
      />
    </div>
  );
}
