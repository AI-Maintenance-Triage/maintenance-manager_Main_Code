import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Mail, Send, AlertTriangle } from "lucide-react";

export default function AdminEmailBlast() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [targetAudience, setTargetAudience] = useState<"all" | "companies" | "contractors">("all");
  const [result, setResult] = useState<{ sent: number; total: number } | null>(null);

  const sendMutation = trpc.adminControl.sendEmailBlast.useMutation({
    onSuccess: (data) => {
      toast.success(`Email blast sent to ${data.sent}/${data.total} recipients!`);
      setResult(data);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSend = () => {
    sendMutation.mutate({ subject, body, audience: targetAudience });
  };

  const audienceLabel = targetAudience === "all" ? "all users" : targetAudience;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="h-6 w-6 text-primary" /> Email Blast</h1>
        <p className="text-muted-foreground text-sm mt-1">Send a broadcast email to companies and/or contractors.</p>
      </div>

      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-sm text-yellow-300">This will send real emails to all matching users. Use with caution. All sends are logged in the Audit Log.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose Email</CardTitle>
          <CardDescription>Emails are sent via Resend. Ensure your domain is verified.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Target Audience</Label>
            <Select value={targetAudience} onValueChange={(v: any) => setTargetAudience(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users (Companies + Contractors)</SelectItem>
                <SelectItem value="companies">Companies Only</SelectItem>
                <SelectItem value="contractors">Contractors Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Important update from Maintenance Manager" />
          </div>

          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={8}
              placeholder="Write your message here. Plain text — line breaks are preserved."
            />
            <p className="text-xs text-muted-foreground">Plain text only. Line breaks will be converted to &lt;br&gt; tags in the email.</p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="w-full"
                disabled={sendMutation.isPending || !subject.trim() || !body.trim()}
              >
                <Send className="h-4 w-4 mr-2" />
                {sendMutation.isPending ? "Sending..." : `Send to ${audienceLabel}`}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Email Blast</AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to send an email to <strong>{audienceLabel}</strong>. Subject: <em>"{subject}"</em>. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSend}>Send Now</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <Send className="h-5 w-5 text-green-400" />
            <div>
              <p className="font-semibold text-green-400">Blast sent!</p>
              <p className="text-sm text-muted-foreground">Successfully delivered to {result.sent} of {result.total} recipients.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
