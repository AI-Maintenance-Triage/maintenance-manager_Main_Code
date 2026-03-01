import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Megaphone } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  success: "bg-green-500/10 text-green-400 border-green-500/20",
  error: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function AdminAnnouncements() {
  const utils = trpc.useUtils();
  const { data: announcements, isLoading } = trpc.adminControl.listAnnouncements.useQuery();

  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"info" | "warning" | "success" | "error">("info");
  const [targetAudience, setTargetAudience] = useState<"all" | "companies" | "contractors">("all");
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => { setTitle(""); setMessage(""); setType("info"); setTargetAudience("all"); setIsActive(true); setEditItem(null); };

  const createMutation = trpc.adminControl.createAnnouncement.useMutation({
    onSuccess: () => { toast.success("Announcement created!"); setOpen(false); resetForm(); utils.adminControl.listAnnouncements.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.adminControl.updateAnnouncement.useMutation({
    onSuccess: () => { toast.success("Announcement updated!"); setOpen(false); resetForm(); utils.adminControl.listAnnouncements.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.adminControl.deleteAnnouncement.useMutation({
    onSuccess: () => { toast.success("Announcement deleted!"); utils.adminControl.listAnnouncements.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const openEdit = (a: any) => {
    setEditItem(a); setTitle(a.title); setMessage(a.message); setType(a.type); setTargetAudience(a.targetAudience); setIsActive(a.isActive); setOpen(true);
  };

  const handleSubmit = () => {
    if (!title.trim() || !message.trim()) return toast.error("Title and message are required");
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, title, message, type, targetAudience, isActive });
    } else {
      createMutation.mutate({ title, message, type, targetAudience, isActive });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="h-6 w-6 text-primary" /> Platform Announcements</h1>
          <p className="text-muted-foreground text-sm mt-1">Broadcast messages to companies and/or contractors.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Announcement</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editItem ? "Edit Announcement" : "New Announcement"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Scheduled maintenance tonight..." /></div>
              <div className="space-y-1.5"><Label>Message</Label><Textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Describe the announcement..." /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v: any) => setType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Audience</Label>
                  <Select value={targetAudience} onValueChange={(v: any) => setTargetAudience(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="companies">Companies Only</SelectItem>
                      <SelectItem value="contractors">Contractors Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <Label>Active (visible to users)</Label>
              </div>
              <Button className="w-full" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {editItem ? "Save Changes" : "Create Announcement"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !announcements?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No announcements yet. Create one to broadcast a message to users.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((a: any) => (
            <Card key={a.id} className={`border ${!a.isActive ? "opacity-60" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{a.title}</CardTitle>
                    <Badge className={`text-xs border ${TYPE_COLORS[a.type] ?? ""}`}>{a.type}</Badge>
                    <Badge variant="outline" className="text-xs">{a.targetAudience}</Badge>
                    {!a.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete Announcement?</AlertDialogTitle><AlertDialogDescription>This will permanently remove this announcement.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate({ id: a.id })} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{a.message}</p>
                <p className="text-xs text-muted-foreground/60 mt-2">Created {new Date(a.createdAt).toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
