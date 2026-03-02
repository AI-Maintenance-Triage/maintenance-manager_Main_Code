import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  AlertTriangle,
  Webhook,
  Key,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const PROVIDER_LOGOS: Record<string, string> = {
  buildium: "https://logo.clearbit.com/buildium.com",
  appfolio: "https://logo.clearbit.com/appfolio.com",
  rentmanager: "https://logo.clearbit.com/rentmanager.com",
  yardi: "https://logo.clearbit.com/yardi.com",
  doorloop: "https://logo.clearbit.com/doorloop.com",
  realpage: "https://logo.clearbit.com/realpage.com",
  propertyware: "https://logo.clearbit.com/propertyware.com",
};

/** Per-provider setup instructions shown after connecting */
const PROVIDER_SETUP_INSTRUCTIONS: Record<string, { steps: string[]; signatureHeader: string }> = {
  buildium: {
    signatureHeader: "X-Buildium-Signature",
    steps: [
      "Log in to your Buildium account and go to Settings → Integrations → Webhooks.",
      "Click 'Add Webhook' and paste the Endpoint URL above.",
      "Under 'Signing Secret', paste the Webhook Signing Secret shown above.",
      "Select the event types: Maintenance Request Created, Maintenance Request Updated.",
      "Click Save. Buildium will now send signed requests to your platform.",
    ],
  },
  appfolio: {
    signatureHeader: "X-AppFolio-Signature",
    steps: [
      "In AppFolio, go to Settings → Integrations → Outbound Webhooks.",
      "Click 'New Webhook' and paste the Endpoint URL above.",
      "Enter the Webhook Signing Secret in the 'Secret' field.",
      "Select 'Maintenance Request' events.",
      "Save and test the connection.",
    ],
  },
  rentmanager: {
    signatureHeader: "X-RentManager-Signature",
    steps: [
      "In Rent Manager, go to Admin → Integrations → Webhooks.",
      "Add a new webhook with the Endpoint URL above.",
      "Enter the Webhook Signing Secret in the signing secret field.",
      "Select 'Service Request' events to subscribe to.",
      "Save the configuration.",
    ],
  },
  doorloop: {
    signatureHeader: "X-DoorLoop-Signature",
    steps: [
      "In DoorLoop, go to Settings → Integrations → Webhooks.",
      "Create a new webhook and paste the Endpoint URL.",
      "Add the Webhook Signing Secret to the secret field.",
      "Subscribe to Maintenance Request events.",
      "Save and activate the webhook.",
    ],
  },
};

const DEFAULT_SETUP_INSTRUCTIONS = {
  signatureHeader: "X-Webhook-Signature",
  steps: [
    "In your PMS portal, go to Settings → Integrations or Webhooks.",
    "Create a new outbound webhook and paste the Endpoint URL above.",
    "Enter the Webhook Signing Secret in the signing secret / HMAC secret field.",
    "Subscribe to maintenance request or work order events.",
    "Save the configuration.",
  ],
};

function getSetupInstructions(provider: string) {
  return PROVIDER_SETUP_INSTRUCTIONS[provider] ?? DEFAULT_SETUP_INSTRUCTIONS;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") return <Badge className="bg-green-500/15 text-green-600 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Connected</Badge>;
  if (status === "error") return <Badge className="bg-red-500/15 text-red-600 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
  return <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
}

function EventStatusBadge({ status }: { status: string }) {
  if (status === "processed") return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">Processed</Badge>;
  if (status === "failed") return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-xs">Failed</Badge>;
  if (status === "ignored") return <Badge className="bg-gray-500/15 text-gray-600 border-gray-500/30 text-xs">Ignored</Badge>;
  return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs">Received</Badge>;
}

export default function CompanyIntegrations() {
  const utils = trpc.useUtils();
  const { data: providers = [] } = trpc.pms.listProviders.useQuery();
  const { data: integrations = [], isLoading } = trpc.pms.list.useQuery();
  const { data: webhookEvents = [] } = trpc.pms.webhookEvents.useQuery({ limit: 50 });

  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string | boolean>>({});
  const [newIntegration, setNewIntegration] = useState<{ webhookSecret: string; provider: string } | null>(null);
  const [expandedInstructions, setExpandedInstructions] = useState<number | null>(null);

  const connectMutation = trpc.pms.connect.useMutation({
    onSuccess: (data) => {
      utils.pms.list.invalidate();
      setNewIntegration({ webhookSecret: data.webhookSecret, provider: connectingProvider! });
      setConnectingProvider(null);
      setCredentials({});
      toast.success("Integration connected", { description: "Your PMS has been connected. Follow the setup instructions to complete configuration." });
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
      toast.success("Sync complete", {
        description: `Imported ${(data as any).imported ?? 0} properties and created ${(data as any).jobs ?? 0} new jobs.`,
      });
    },
    onError: (err) => {
      toast.error("Sync failed", { description: err.message });
    },
  });

  const providerConfig = providers.find((p: any) => p.id === connectingProvider);
  const connectedProviderIds = new Set(integrations.map((i: any) => i.provider));

  function handleConnect() {
    if (!connectingProvider) return;
    const sanitized: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(credentials)) {
      sanitized[k] = k === "isSandbox" ? Boolean(v) : v;
    }
    connectMutation.mutate({ provider: connectingProvider, credentials: sanitized as any });
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
          <CardTitle className="text-base text-blue-700 dark:text-blue-400 flex items-center gap-2">
            <Info className="w-4 h-4" />How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. Connect your PMS using the API credentials or webhook setup from your PMS portal.</p>
          <p>2. We automatically import all your properties and sync new maintenance requests every 15 minutes.</p>
          <p>3. Each new request becomes a job on the job board for contractors to accept.</p>
          <p>4. When a job is completed, we update the request status in your PMS automatically.</p>
          <p className="flex items-center gap-1 mt-2 text-green-700 dark:text-green-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            All inbound webhooks are verified using HMAC-SHA256 signatures for security.
          </p>
        </CardContent>
      </Card>

      {/* Active integrations */}
      {integrations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Active Integrations</h2>
          {(integrations as any[]).map((integration: any) => {
            const provider = (providers as any[]).find((p: any) => p.id === integration.provider);
            const instructions = getSetupInstructions(integration.provider);
            const webhookEndpoint = `${appBaseUrl}/api/webhooks/pms/${integration.provider}`;
            const isExpanded = expandedInstructions === integration.id;
            return (
              <Card key={integration.id}>
                <CardContent className="pt-4 space-y-3">
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
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">{integration.lastErrorMessage}</AlertDescription>
                    </Alert>
                  )}

                  {/* Webhook configuration — always shown for all integrations */}
                  <div className="p-3 bg-muted/50 rounded-md space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
                        Webhook Configuration
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setExpandedInstructions(isExpanded ? null : integration.id)}
                      >
                        {isExpanded ? <><ChevronUp className="w-3 h-3 mr-1" />Hide Setup</>
                          : <><ChevronDown className="w-3 h-3 mr-1" />Setup Instructions</>}
                      </Button>
                    </div>

                    {/* Endpoint URL */}
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Endpoint URL</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-background border rounded px-2 py-1.5 flex-1 truncate font-mono">
                          {webhookEndpoint}
                        </code>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyToClipboard(webhookEndpoint)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Signing secret */}
                    {integration.webhookSecret && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">
                          Webhook Signing Secret
                          <span className="ml-1 text-muted-foreground/60">(header: {instructions.signatureHeader})</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-background border rounded px-2 py-1.5 flex-1 truncate font-mono text-amber-600 dark:text-amber-400">
                            {integration.webhookSecret}
                          </code>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyToClipboard(integration.webhookSecret)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Paste this into your PMS portal as the webhook signing secret. Keep it private.
                        </p>
                      </div>
                    )}

                    {/* Step-by-step instructions (collapsible) */}
                    {isExpanded && (
                      <div className="mt-2 space-y-2">
                        <Separator />
                        <p className="text-xs font-semibold capitalize">
                          {provider?.name ?? integration.provider} Setup Steps
                        </p>
                        <ol className="space-y-1.5">
                          {instructions.steps.map((step, idx) => (
                            <li key={idx} className="flex gap-2 text-xs text-muted-foreground">
                              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">
                                {idx + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Available providers */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Available Integrations</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading providers...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(providers as any[]).map((provider: any) => {
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
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {provider.authType === "api_key" ? (
                              <Badge variant="outline" className="text-xs py-0"><Key className="w-2.5 h-2.5 mr-1" />API Key</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs py-0"><Webhook className="w-2.5 h-2.5 mr-1" />Webhook</Badge>
                            )}
                            {provider.supportsPropertyImport && (
                              <Badge variant="outline" className="text-xs py-0 text-green-600">Auto-import</Badge>
                            )}
                            {provider.supportsWriteback && (
                              <Badge variant="outline" className="text-xs py-0 text-blue-600">Writeback</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={isConnected}
                        onClick={() => {
                          setConnectingProvider(provider.id);
                          setCredentials({});
                          setNewIntegration(null);
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
        )}
      </div>

      {/* Webhook event log */}
      {webhookEvents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent Webhook Events</h2>
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {(webhookEvents as any[]).map((event: any, i: number) => (
                  <div key={i} className="flex items-start justify-between text-sm py-2 border-b last:border-0 gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <Badge variant="outline" className="text-xs capitalize flex-shrink-0">{event.provider}</Badge>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground truncate">
                          {event.rawPayload ? JSON.stringify(event.rawPayload).slice(0, 80) + "..." : "No payload"}
                        </p>
                        {event.errorMessage && (
                          <p className="text-xs text-destructive mt-0.5">{event.errorMessage}</p>
                        )}
                        {event.createdJobId && (
                          <p className="text-xs text-green-600 mt-0.5">Created Job #{event.createdJobId}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <EventStatusBadge status={event.status} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Connect dialog */}
      <Dialog open={!!connectingProvider} onOpenChange={(open) => { if (!open) { setConnectingProvider(null); setCredentials({}); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect {(providers as any[]).find((p: any) => p.id === connectingProvider)?.name ?? connectingProvider}</DialogTitle>
            <DialogDescription>
              {(providerConfig as any)?.authType === "api_key"
                ? "Enter your API credentials from your PMS portal. We'll test the connection before saving."
                : "This integration uses webhooks. We'll generate a secure webhook endpoint and signing secret for you."}
            </DialogDescription>
          </DialogHeader>

          {(providerConfig as any)?.authType === "api_key" && (
            <div className="space-y-3">
              {([...((providerConfig as any).fields ?? [])] as Array<{ key: string; label: string; type: string; required: boolean }>).map(field => (
                <div key={field.key} className={field.type === "checkbox" ? "flex items-center gap-2 pt-1" : "space-y-1.5"}>
                  {field.type === "checkbox" ? (
                    <>
                      <Checkbox
                        id={field.key}
                        checked={Boolean(credentials[field.key])}
                        onCheckedChange={checked => setCredentials(prev => ({ ...prev, [field.key]: Boolean(checked) }))}
                      />
                      <Label htmlFor={field.key} className="cursor-pointer font-normal">{field.label}</Label>
                    </>
                  ) : (
                    <>
                      <Label htmlFor={field.key}>{field.label}{field.required && <span className="text-destructive ml-1">*</span>}</Label>
                      <Input
                        id={field.key}
                        type={field.type === "password" ? "password" : "text"}
                        value={String(credentials[field.key] ?? "")}
                        onChange={e => setCredentials(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.type === "password" ? "••••••••••••" : `Enter ${field.label.toLowerCase()}`}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {(providerConfig as any)?.authType === "webhook_only" && (
            <Alert>
              <ShieldCheck className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm">
                We'll generate a unique webhook endpoint URL and HMAC signing secret. You'll paste both into your PMS portal to complete the setup.
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

      {/* Post-connect setup dialog — shows endpoint URL and signing secret */}
      <Dialog open={!!newIntegration} onOpenChange={(open) => { if (!open) setNewIntegration(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Integration Connected!
            </DialogTitle>
            <DialogDescription>
              Copy the details below and configure them in your PMS portal to complete the setup.
            </DialogDescription>
          </DialogHeader>

          {newIntegration && (() => {
            const instructions = getSetupInstructions(newIntegration.provider);
            const webhookEndpoint = `${appBaseUrl}/api/webhooks/pms/${newIntegration.provider}`;
            return (
              <div className="space-y-4">
                {/* Endpoint URL */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Webhook Endpoint URL</Label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted border rounded px-2 py-2 flex-1 break-all font-mono">
                      {webhookEndpoint}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookEndpoint)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Signing secret */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">
                    Webhook Signing Secret
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(header: {instructions.signatureHeader})</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted border rounded px-2 py-2 flex-1 break-all font-mono text-amber-600 dark:text-amber-400">
                      {newIntegration.webhookSecret}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(newIntegration.webhookSecret)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Save the signing secret now — it is also visible on this page under your active integrations.
                  </AlertDescription>
                </Alert>

                <Separator />

                {/* Setup steps */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold capitalize">
                    {(providers as any[]).find((p: any) => p.id === newIntegration.provider)?.name ?? newIntegration.provider} Setup Steps
                  </p>
                  <ol className="space-y-2">
                    {instructions.steps.map((step, idx) => (
                      <li key={idx} className="flex gap-2 text-xs text-muted-foreground">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button onClick={() => setNewIntegration(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
