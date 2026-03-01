import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, ShieldOff, ShieldCheck } from "lucide-react";

export default function AdminMaintenanceMode() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.adminControl.getMaintenanceMode.useQuery();
  const [isEnabled, setIsEnabled] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (data) {
      setIsEnabled(data.isEnabled ?? false);
      setMessage(data.message ?? "");
    }
  }, [data]);

  const setMutation = trpc.adminControl.setMaintenanceMode.useMutation({
    onSuccess: () => {
      toast.success(`Maintenance mode ${isEnabled ? "enabled" : "disabled"}!`);
      utils.adminControl.getMaintenanceMode.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    setMutation.mutate({ isEnabled, message: message || null });
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-yellow-500" /> Maintenance Mode
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          When enabled, all non-admin users see a maintenance page instead of the app.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Platform Status</CardTitle>
              <Badge className={data?.isEnabled ? "bg-red-500/10 text-red-400 border-red-500/20 border" : "bg-green-500/10 text-green-400 border-green-500/20 border"}>
                {data?.isEnabled ? (
                  <><ShieldOff className="h-3 w-3 mr-1" />Maintenance Active</>
                ) : (
                  <><ShieldCheck className="h-3 w-3 mr-1" />Platform Online</>
                )}
              </Badge>
            </div>
            <CardDescription>
              {data?.isEnabled
                ? `Maintenance mode is currently active. Last updated: ${(data as any).updatedAt ? new Date((data as any).updatedAt).toLocaleString() : "—"}`
                : "Platform is operating normally."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/30">
              <Switch
                checked={isEnabled}
                onCheckedChange={setIsEnabled}
                className="data-[state=checked]:bg-red-500"
              />
              <div>
                <p className="font-medium text-sm">{isEnabled ? "Maintenance mode ON" : "Maintenance mode OFF"}</p>
                <p className="text-xs text-muted-foreground">Toggle to enable or disable maintenance mode</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Custom Message (optional)</Label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                placeholder="We're performing scheduled maintenance. We'll be back shortly..."
              />
              <p className="text-xs text-muted-foreground">Shown to users during maintenance. Leave blank for default message.</p>
            </div>

            <Button
              onClick={handleSave}
              disabled={setMutation.isPending}
              className={isEnabled ? "bg-red-600 hover:bg-red-700 w-full" : "w-full"}
            >
              {setMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
