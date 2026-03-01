import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plug,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  ExternalLink,
  AlertTriangle,
  Webhook,
  Key,
} from "lucide-react";

const PROVIDER_LOGOS: Record<string, string> = {
  buildium: "https://logo.clearbit.com/buildium.com",
  appfolio: "https://logo.clearbit.com/appfolio.com",
  rentmanager: "https://logo.clearbit.com/rentmanager.com",
  yardi: "https://logo.clearbit.com/yardi.com",
  resman: "https://logo.clearbit.com/myresman.com",
  doorloop: "https://logo.clearbit.com/doorloop.com",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") return <Badge className="bg-green-500/15 text-green-600 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Connected</Badge>;
  if (status === "error") return <Badge className="bg-red-500/15 text-red-600 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
  return <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
}

export default function CompanyIntegrations() {
  const utils = trpc.useUtils();
  const { data: providers = [] } = trpc.pms.listProviders.useQuery();
  const { data: integrations = [], isLoading } = trpc.pms.list.useQuery();
  const { data: webhookEvents = [] } = trpc.pms.webhookEvents.useQuery({ limit: 20 });

  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);

  const connectMutation = trpc.pms.connect.useMutation({
    onSuccess: (data) => {
      utils.pms.list.invalidate();
      setNewWebhookSecret(data.webhookSecret);
      setCredentials({});
      toast.success("Integration connected", { description: "Your PMS has been connected successfully." });
    },
    onError: (err) => {
      toast.error("Connection failed", { description: err.message });
    },
  });

  const disconnectMutation = trpc.pms.disconnect.useMutation({
    onSuccess: () => {
      utils.pms.list.invalidate();
      toast.success("Integration removed");
    },
  });

  const syncMutation = trpc.pms.sync.useMutation({
    onSuccess: (data) => {
      utils.pms.list.invalidate();
      utils.pms.webhookEvents.invalidate();
      toast.success("Sync complete", { description: `Imported ${data.imported} properties and created ${data.jobs} new jobs.` });
    },
    onError: (err) => {
      toast.error("Sync failed", { description: err.message });
    },
  });

  const providerConfig = providers.find(p => p.id === connectingProvider);
  const connectedProviderIds = new Set(integrations.map(i => i.provider));

  function handleConnect() {
    if (!connectingProvider) return;
    connectMutation.mutate({ provider: connectingProvider, credentials });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  const appBaseUrl = window.location.origin;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">PMS Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect your property management software to automatically import properties and sync maintenance requests.
        </p>
      </div>

      {/* How it works */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-blue-700 dark:text-blue-400">How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. Connect your PMS using the API credentials from your PMS portal.</p>
          <p>2. We automatically import all your properties and sync new maintenance requests every 15 minutes.</p>
          <p>3. Each new request becomes a job on the job board for contractors to accept.</p>
          <p>4. When a job is completed, we update the request status in your PMS automatically.</p>
        </CardContent>
      </Card>

      {/* Active integrations */}
      {integrations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Active Integrations</h2>
          {integrations.map(integration => {
            const provider = providers.find(p => p.id === integration.provider);
            return (
              <Card key={integration.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {PROVIDER_LOGOS[integration.provider] ? (
                        <img
                          src={PROVIDER_LOGOS[integration.provider]}
                          alt={integration.provider}
                          className="w-8 h-8 rounded object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                          <Plug className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium capitalize">{provider?.name ?? integration.provider}</p>
                        <p className="text-xs text-muted-foreground">
                          {integration.lastSyncAt
                            ? `Last synced ${new Date(integration.lastSyncAt).toLocaleString()}`
                            : "Never synced"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={integration.status} />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncMutation.mutate({ id: integration.id })}
                        disabled={syncMutation.isPending}
                      >
                        <RefreshCw className={`w-3 h-3 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                        Sync Now
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => disconnectMutation.mutate({ id: integration.id })}
                        disabled={disconnectMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {integration.lastErrorMessage && (
                    <Alert variant="destructive" className="mt-3">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">{integration.lastErrorMessage}</AlertDescription>
                    </Alert>
                  )}

                  {/* Webhook URL for webhook-only providers */}
                  {integration.authType === "webhook_only" && (
                    <div className="mt-3 p-3 bg-muted/50 rounded-md space-y-2">
                      <p className="text-xs font-medium flex items-center gap-1"><Webhook className="w-3 h-3" />Webhook URL</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-background border rounded px-2 py-1 flex-1 truncate">
                          {appBaseUrl}/api/pms/webhook/{integration.provider}/{integration.webhookSecret}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(`${appBaseUrl}/api/pms/webhook/${integration.provider}/${integration.webhookSecret}`)}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Paste this URL into your PMS portal as the outbound webhook destination.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Available providers */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Available Integrations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {providers.map(provider => {
            const isConnected = connectedProviderIds.has(provider.id);
            return (
              <Card key={provider.id} className={isConnected ? "opacity-60" : ""}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {PROVIDER_LOGOS[provider.id] ? (
                        <img
                          src={PROVIDER_LOGOS[provider.id]}
                          alt={provider.name}
                          className="w-8 h-8 rounded object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                          <Plug className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{provider.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {provider.authType === "api_key" ? (
                            <Badge variant="outline" className="text-xs py-0"><Key className="w-2.5 h-2.5 mr-1" />API Key</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs py-0"><Webhook className="w-2.5 h-2.5 mr-1" />Webhook</Badge>
                          )}
                          {provider.supportsPropertyImport && <Badge variant="outline" className="text-xs py-0 text-green-600">Auto-import</Badge>}
                          {provider.supportsWriteback && <Badge variant="outline" className="text-xs py-0 text-blue-600">Writeback</Badge>}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={isConnected}
                      onClick={() => {
                        setConnectingProvider(provider.id);
                        setCredentials({});
                        setNewWebhookSecret(null);
                      }}
                    >
                      {isConnected ? "Connected" : "Connect"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Webhook event log */}
      {webhookEvents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent Webhook Events</h2>
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {webhookEvents.map((event, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs capitalize">{event.provider}</Badge>
                      <span className="text-muted-foreground">{event.rawPayload ? JSON.stringify(event.rawPayload).slice(0, 60) + "..." : "No payload"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Connect dialog */}
      <Dialog open={!!connectingProvider && !newWebhookSecret} onOpenChange={(open) => { if (!open) { setConnectingProvider(null); setCredentials({}); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect {providerConfig?.name}</DialogTitle>
            <DialogDescription>
              {providerConfig?.authType === "api_key"
                ? "Enter your API credentials from your PMS portal. We'll test the connection before saving."
                : "This integration uses webhooks. We'll generate a webhook URL for you to paste into your PMS portal."}
            </DialogDescription>
          </DialogHeader>

          {providerConfig?.authType === "api_key" && (
            <div className="space-y-3">
              {([...providerConfig.fields] as Array<{ key: string; label: string; type: string; required: boolean }>).map(field => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key}>{field.label}{field.required && <span className="text-destructive ml-1">*</span>}</Label>
                  <Input
                    id={field.key}
                    type={field.type === "password" ? "password" : "text"}
                    value={credentials[field.key] ?? ""}
                    onChange={e => setCredentials(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.type === "password" ? "••••••••••••" : `Enter ${field.label.toLowerCase()}`}
                  />
                </div>
              ))}
              {"webhookNote" in (providerConfig as Record<string, unknown>) && (
                <Alert>
                  <AlertDescription className="text-xs">{(providerConfig as Record<string, unknown>).webhookNote as string}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {providerConfig?.authType === "webhook_only" && (
            <Alert>
              <Webhook className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {"webhookNote" in (providerConfig as Record<string, unknown>) ? (providerConfig as Record<string, unknown>).webhookNote as string : "Click Connect to generate your webhook URL."}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setConnectingProvider(null); setCredentials({}); }}>Cancel</Button>
            <Button onClick={handleConnect} disabled={connectMutation.isPending}>
              {connectMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Webhook secret reveal dialog (shown after connecting webhook-only provider) */}
      <Dialog open={!!newWebhookSecret} onOpenChange={(open) => { if (!open) { setNewWebhookSecret(null); setConnectingProvider(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-500" />Integration Connected!</DialogTitle>
            <DialogDescription>
              Copy the webhook URL below and paste it into your PMS portal as the outbound webhook destination.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Your Webhook URL</Label>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted border rounded px-2 py-2 flex-1 break-all">
                {appBaseUrl}/api/pms/webhook/{connectingProvider}/{newWebhookSecret}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(`${appBaseUrl}/api/pms/webhook/${connectingProvider}/${newWebhookSecret}`)}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Save this URL now. You can always find it again on this page under your active integrations.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button onClick={() => { setNewWebhookSecret(null); setConnectingProvider(null); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
