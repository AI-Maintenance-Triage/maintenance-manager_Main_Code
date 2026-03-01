import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface JobCommentsProps {
  maintenanceRequestId: number;
}

function roleBadgeClass(role: string) {
  if (role === "company_admin") return "text-blue-400 border-blue-500/30 bg-blue-500/10";
  if (role === "contractor") return "text-green-400 border-green-500/30 bg-green-500/10";
  return "text-purple-400 border-purple-500/30 bg-purple-500/10";
}

function roleLabel(role: string) {
  if (role === "company_admin") return "Company";
  if (role === "contractor") return "Contractor";
  return "Admin";
}

export function JobComments({ maintenanceRequestId }: JobCommentsProps) {
  const [message, setMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: comments = [], refetch } = trpc.comments.list.useQuery(
    { maintenanceRequestId },
    { refetchInterval: 15000 }
  );

  const addComment = trpc.comments.add.useMutation({
    onSuccess: () => {
      setMessage("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    addComment.mutate({ maintenanceRequestId, message: message.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          Notes &amp; Comments
        </span>
        {comments.length > 0 && (
          <Badge variant="secondary" className="text-xs ml-auto">{comments.length}</Badge>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No notes yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Start a conversation about this job</p>
          </div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                  {(c.authorName ?? "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-foreground truncate">
                    {c.authorName ?? "Unknown"}
                  </span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${roleBadgeClass(c.authorRole)}`}>
                    {roleLabel(c.authorRole)}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-auto">
                    {new Date(c.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="text-sm text-foreground/90 bg-muted/30 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                  {c.message}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-border shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a note... (Ctrl+Enter to send)"
            className="resize-none min-h-[60px] max-h-[120px] text-sm"
            rows={2}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!message.trim() || addComment.isPending}
            className="shrink-0 h-10 w-10"
          >
            {addComment.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
