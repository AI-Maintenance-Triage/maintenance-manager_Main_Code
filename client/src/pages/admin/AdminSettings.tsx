import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings, Loader2 } from "lucide-react";

export default function AdminSettings() {
  const utils = trpc.useUtils();
  const { data: platformSettings, isLoading } = trpc.stripePayments.getPlatformSettings.useQuery();
  const [feePercent, setFeePercent] = useState("");
  const [perListingEnabled, setPerListingEnabled] = useState(false);
  const [perListingAmount, setPerListingAmount] = useState("");
  const [autoClockOutMinutes, setAutoClockOutMinutes] = useState("");
  const [autoClockOutRadius, setAutoClockOutRadius] = useState("");
  const [pmsSyncIntervalHours, setPmsSyncIntervalHours] = useState("24");

  useEffect(() => {
    if (platformSettings) {
      setFeePercent(platformSettings.platformFeePercent ?? "5.00");
      setPerListingEnabled(platformSettings.perListingFeeEnabled ?? false);
      setPerListingAmount(platformSettings.perListingFeeAmount ?? "0.00");
      setAutoClockOutMinutes(String(platformSettings.autoClockOutMinutes ?? 15));
      setAutoClockOutRadius(String(platformSettings.autoClockOutRadiusMeters ?? 200));
      setPmsSyncIntervalHours(String((platformSettings as any).pmsSyncIntervalHours ?? 24));
    }
  }, [platformSettings]);

  const updateSettings = trpc.stripePayments.updatePlatformSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved!");
      utils.stripePayments.getPlatformSettings.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    updateSettings.mutate({
      platformFeePercent: parseFloat(feePercent) || 5,
      perListingFeeEnabled: perListingEnabled,
      perListingFeeAmount: parseFloat(perListingAmount) || 0,
      autoClockOutMinutes: parseInt(autoClockOutMinutes) || 15,
      autoClockOutRadiusMeters: parseInt(autoClockOutRadius) || 200,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Platform Settings
        </h2>
        <p className="text-muted-foreground mt-1">Configure global platform settings and defaults</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Fee Configuration</CardTitle>
          <CardDescription>Set the platform fee percentage applied to all jobs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading settings...
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="feePercent">Platform Fee (%)</Label>
                <Input
                  id="feePercent"
                  name="feePercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={feePercent}
                  onChange={(e) => setFeePercent(e.target.value)}
                  className="max-w-xs"
                />
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="perListingEnabled"
                  checked={perListingEnabled}
                  onCheckedChange={setPerListingEnabled}
                />
                <Label htmlFor="perListingEnabled">Enable per-listing fee</Label>
              </div>

              {perListingEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="perListingAmount">Per-Listing Fee ($)</Label>
                  <Input
                    id="perListingAmount"
                    name="perListingAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={perListingAmount}
                    onChange={(e) => setPerListingAmount(e.target.value)}
                    className="max-w-xs"
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Sync Settings</CardTitle>
          <CardDescription>Configure PMS sync and auto clock-out behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="syncInterval">PMS Sync Interval (hours)</Label>
            <Input
              id="syncInterval"
              name="syncInterval"
              type="number"
              min="1"
              max="168"
              value={pmsSyncIntervalHours}
              onChange={(e) => setPmsSyncIntervalHours(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="autoClockOutMinutes">Auto Clock-Out (minutes after leaving geofence)</Label>
            <Input
              id="autoClockOutMinutes"
              name="autoClockOutMinutes"
              type="number"
              min="1"
              max="120"
              value={autoClockOutMinutes}
              onChange={(e) => setAutoClockOutMinutes(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="autoClockOutRadius">Geofence Radius (meters)</Label>
            <Input
              id="autoClockOutRadius"
              name="autoClockOutRadius"
              type="number"
              min="50"
              max="5000"
              value={autoClockOutRadius}
              onChange={(e) => setAutoClockOutRadius(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateSettings.isPending}
          className="gap-2"
        >
          {updateSettings.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
          ) : (
            "Save Settings"
          )}
        </Button>
      </div>
    </div>
  );
}
