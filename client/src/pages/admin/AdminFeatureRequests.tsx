import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag, ThumbsUp, MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";

type FeatureRequest = {
  id: number;
  title: string;
  description: string;
  status: "pending" | "reviewing" | "planned" | "completed" | "rejected";
  votes: number;
  submittedBy: string;
  submittedAt: string;
};

const MOCK_REQUESTS: FeatureRequest[] = [
  {
    id: 1,
    title: "Bulk job assignment",
    description: "Allow assigning multiple jobs to a contractor at once from the job board.",
    status: "reviewing",
    votes: 12,
    submittedBy: "company@example.com",
    submittedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 2,
    title: "Mobile app push notifications",
    description: "Send push notifications to contractors when new jobs are available in their area.",
    status: "planned",
    votes: 28,
    submittedBy: "contractor@example.com",
    submittedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 3,
    title: "Custom job categories",
    description: "Allow companies to create their own job categories beyond the default trade types.",
    status: "pending",
    votes: 7,
    submittedBy: "company@example.com",
    submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  reviewing: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  planned: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function AdminFeatureRequests() {
  const [requests, setRequests] = useState<FeatureRequest[]>(MOCK_REQUESTS);
  const [adminNote, setAdminNote] = useState<Record<number, string>>({});

  const updateStatus = (id: number, status: FeatureRequest["status"]) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    toast.success("Status updated");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Flag className="h-6 w-6 text-primary" />
          Feature Requests
        </h2>
        <p className="text-muted-foreground mt-1">Review and manage user-submitted feature requests</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["pending", "reviewing", "planned", "completed"] as const).map(status => (
          <Card key={status} className="bg-card border-border">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide capitalize">{status}</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {requests.filter(r => r.status === status).length}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {requests.map(request => (
          <Card key={request.id} className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base text-foreground">{request.title}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{request.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={`text-xs ${STATUS_COLORS[request.status]}`}>
                    {request.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3" /> {request.votes} votes
                </span>
                <span>Submitted by {request.submittedBy}</span>
                <span>{new Date(request.submittedAt).toLocaleDateString()}</span>
              </div>

              <div className="flex items-center gap-3">
                <Select
                  value={request.status}
                  onValueChange={(val) => updateStatus(request.id, val as FeatureRequest["status"])}
                >
                  <SelectTrigger
                    className="w-40 h-8 text-xs"
                    aria-label="Update status"
                    data-testid={`status-${request.id}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="reviewing">Reviewing</SelectItem>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3" /> Admin note
                </div>
                <Textarea
                  placeholder="Add an internal note..."
                  value={adminNote[request.id] ?? ""}
                  onChange={(e) => setAdminNote(prev => ({ ...prev, [request.id]: e.target.value }))}
                  className="text-xs min-h-[60px] resize-none"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
