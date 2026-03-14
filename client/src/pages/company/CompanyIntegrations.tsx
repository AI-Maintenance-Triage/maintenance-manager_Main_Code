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
  FlaskConical,
  Save,
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

/** Per-provider setup instructions shown after connecting.
 *  For Buildium: Buildium GENERATES its own signing secret — we don't supply one.
 *  The user must copy Buildium's secret and paste it back into our platform.
 */
const PROVIDER_SETUP_INSTRUCTIONS: Record<string, {
  steps: string[];
  signatureHeader: string;
  /** If true, Buildium generates the secret and we must receive it from the user */
  providerGeneratesSecret?: boolean;
}> = {
  buildium: {
    signatureHeader: "X-Buildium-Signature",
    providerGeneratesSecret: true,
    steps: [
      "Log in to your Buildium account and navigate to Settings → Integrations → Webhooks.",
      "Click 'Add Webhook' and paste the Endpoint URL (copied above) into the URL field.",
      "Select the event types: Task.Created and Task.Updated (found under the Tasks section).",
      "Click Save. Buildium will display a Signing Secret — copy it.",
      "Paste Buildium's signing secret into the field below and click 'Save Secret'.",
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
  providerGeneratesSecret: false,
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

function DebugRawResult({ data }: { data: unknown }) {
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">First Property (RentalMessage)</p>
        <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(d.firstPropertyRaw, null, 2)}
        </pre>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">Units Response (/rentals/units?propertyids=&#123;id&#125;)</p>
        <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(d.unitsResponseRaw, null, 2)}
        </pre>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">First Unit (RentalUnitMessage)</p>
        <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(d.firstUnitRaw, null, 2)}
        </pre>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">First Maintenance Request (ResidentRequestTaskMessage)</p>
        <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(d.firstRequestRaw, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export default function CompanyIntegrations() {
  const utils = trpc.useUtils();
  const { data: providers = [] } = trpc.pms.listProviders.useQuery();
  const { data: integrations = [], isLoading } = trpc.pms.list.useQuery();
  const { data: webhookEvents = [] } = trpc.pms.webhookEvents.useQuery({ limit: 50 });
  const { data: platformSettings } = trpc.stripePayments.getPlatformSettings.useQuery();

  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string | boolean>>({});
  // Stores the newly connected integration info for the post-connect dialog
  const [newIntegration, setNewIntegration] = useState<{
    id: number;
    webhookSecret: string;
    provider: string;
  } | null>(null);
  const [expandedInstructions, setExpandedInstructions] = useState<number | null>(null);
  // For the Buildium-specific "paste their secret" input in the post-connect dialog
  const [buildiumSecretInput, setBuildiumSecretInput] = useState("");
  // For inline "update secret" on existing integration cards
  const [editingSecretId, setEditingSecretId] = useState<number | null>(null);
  const [editingSecretValue, setEditingSecretValue] = useState("");
  const [debugResult, setDebugResult] = useState<unknown>(null);
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);

  const debugRawMutation = trpc.pms.debugRaw.useMutation({
    onSuccess: (data) => {
      setDebugResult(data);
      setDebugDialogOpen(true);
    },
    onError: (err) => {
      toast.error("Debug failed", { description: err.message });
    },
  });

  const connectMutation = trpc.pms.connect.useMutation({
    onSuccess: (data) => {
      utils.pms.list.invalidate();
      setNewIntegration({ id: data.id, webhookSecret: data.webhookSecret, provider: connectingProvider! });
      setConnectingProvider(null);
      setCredentials({});
      setBuildiumSecretInput("");
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

  const updateSecretMutation = trpc.pms.updateWebhookSecret.useMutation({
    onSuccess: () => {
      utils.pms.list.invalidate();
      setEditingSecretId(null);
      setEditingSecretValue("");
      toast.success("Signing secret updated", {
        description: "Buildium's signing secret has been saved. Incoming webhooks will now be verified correctly.",
      });
    },
    onError: (err) => {
      toast.error("Failed to save secret", { description: err.message });
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
    navigator.clipboard.writeText(text)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Could not copy to clipboard. Please copy manually."));
  }

  function handleSaveBuildiumSecret(integrationId: number, secret: string) {
    if (!secret.trim()) {
      toast.error("Please paste Buildium's signing secret first");
      return;
    }
    updateSecretMutation.mutate({ id: integrationId, webhookSecret: secret.trim() });
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
            const isBuildium = integration.provider === "buildium";
            const isEditingSecret = editingSecretId === integration.id;
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
                        <div className="flex items-center gap-2">
                          <p className="font-medium capitalize">{provider?.name ?? integration.provider}</p>
                          {integration.isSandbox && (
                            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs py-0">
                              <FlaskConical className="w-2.5 h-2.5 mr-1" />Sandbox
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {integration.lastSyncAt
                            ? `Last synced ${new Date(integration.lastSyncAt).toLocaleString()}`
                            : "Never synced"}
                        </p>
                        {(() => {
                          const intervalHours = (platformSettings as any)?.pmsSyncIntervalHours ?? 24;
                          if (intervalHours === 0) return <p className="text-xs text-amber-500">Auto-sync disabled</p>;
                          if (!integration.lastSyncAt) return <p className="text-xs text-muted-foreground">Auto-sync: every {intervalHours}h</p>;
                          const nextSync = new Date(integration.lastSyncAt).getTime() + intervalHours * 3600000;
                          const diffMs = nextSync - Date.now();
                          if (diffMs <= 0) return <p className="text-xs text-blue-500">Auto-sync due soon</p>;
                          const diffH = Math.floor(diffMs / 3600000);
                          const diffM = Math.floor((diffMs % 3600000) / 60000);
                          return <p className="text-xs text-muted-foreground">Next auto-sync in {diffH > 0 ? `${diffH}h ` : ""}{diffM}m</p>;
                        })()}
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
                      {integration.provider === "buildium" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => debugRawMutation.mutate({ id: integration.id })}
                          disabled={debugRawMutation.isPending}
                          title="Inspect raw Buildium API response"
                        >
                          <FlaskConical className={`w-3 h-3 ${debugRawMutation.isPending ? "animate-pulse" : ""}`} />
                        </Button>
                      )}
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

                    {/* Signing secret section — different UI for Buildium vs others */}
                    {isBuildium ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                          Buildium Signing Secret
                          <span className="text-muted-foreground/60">(header: {instructions.signatureHeader})</span>
                        </p>
                        {integration.webhookSecret ? (
                          // Secret is saved — show it with an option to update
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {isEditingSecret ? (
                                <>
                                  <Input
                                    className="text-xs font-mono h-8 flex-1"
                                    placeholder="Paste new Buildium signing secret..."
                                    value={editingSecretValue}
                                    onChange={e => setEditingSecretValue(e.target.value)}
                                  />
                                  <Button
                                    size="sm"
                                    className="h-8"
                                    onClick={() => handleSaveBuildiumSecret(integration.id, editingSecretValue)}
                                    disabled={updateSecretMutation.isPending}
                                  >
                                    <Save className="w-3 h-3 mr-1" />
                                    {updateSecretMutation.isPending ? "Saving..." : "Save"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => { setEditingSecretId(null); setEditingSecretValue(""); }}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <code className="text-xs bg-background border rounded px-2 py-1.5 flex-1 truncate font-mono text-green-600 dark:text-green-400">
                                    {integration.webhookSecret.slice(0, 8)}••••••••••••••••
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => { setEditingSecretId(integration.id); setEditingSecretValue(""); }}
                                  >
                                    Update
                                  </Button>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Buildium's signing secret is configured. Webhooks will be verified correctly.
                            </p>
                          </div>
                        ) : (
                          // No secret yet — prompt user to paste Buildium's secret
                          <div className="space-y-2">
                            <Alert className="border-amber-500/30 bg-amber-500/5">
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                              <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                                Buildium generates its own signing secret. After creating the webhook in Buildium, copy their secret and paste it here so we can verify incoming requests.
                              </AlertDescription>
                            </Alert>
                            <div className="flex items-center gap-2">
                              <Input
                                className="text-xs font-mono h-8 flex-1"
                                placeholder="Paste Buildium's signing secret here..."
                                value={isEditingSecret ? editingSecretValue : ""}
                                onFocus={() => setEditingSecretId(integration.id)}
                                onChange={e => setEditingSecretValue(e.target.value)}
                              />
                              <Button
                                size="sm"
                                className="h-8"
                                onClick={() => handleSaveBuildiumSecret(integration.id, editingSecretValue)}
                                disabled={updateSecretMutation.isPending}
                              >
                                <Save className="w-3 h-3 mr-1" />
                                {updateSecretMutation.isPending ? "Saving..." : "Save Secret"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Non-Buildium: we supply the secret, user pastes it into their PMS */
                      integration.webhookSecret && (
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
                      )
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
                : "This integration uses webhooks. We'll generate a secure webhook endpoint for you to configure in your PMS portal."}
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
                {connectingProvider === "buildium"
                  ? "We'll generate a unique webhook endpoint URL. You'll configure it in Buildium, which will then generate its own signing secret for you to paste back here."
                  : "We'll generate a unique webhook endpoint URL and HMAC signing secret. You'll paste both into your PMS portal to complete the setup."}
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

      {/* Post-connect setup dialog */}
      <Dialog open={!!newIntegration} onOpenChange={(open) => { if (!open) { setNewIntegration(null); setBuildiumSecretInput(""); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Integration Connected!
            </DialogTitle>
            <DialogDescription>
              {newIntegration?.provider === "buildium"
                ? "Copy the webhook URL below and configure it in Buildium. Then paste Buildium's signing secret back here to complete verification setup."
                : "Copy the details below and configure them in your PMS portal to complete the setup."}
            </DialogDescription>
          </DialogHeader>

          {newIntegration && (() => {
            const instructions = getSetupInstructions(newIntegration.provider);
            const webhookEndpoint = `${appBaseUrl}/api/webhooks/pms/${newIntegration.provider}`;
            const isBuildium = newIntegration.provider === "buildium";
            return (
              <div className="space-y-4">
                {/* Step 1: Endpoint URL — always shown */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">1</span>
                    <Label className="text-sm font-semibold">Copy this Webhook Endpoint URL</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted border rounded px-2 py-2 flex-1 break-all font-mono">
                      {webhookEndpoint}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookEndpoint)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {isBuildium ? (
                  /* Buildium-specific flow: Buildium generates the secret, user pastes it here */
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">2</span>
                        <Label className="text-sm font-semibold">Configure the webhook in Buildium</Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-7">
                        In Buildium, go to <strong>Settings → Integrations → Webhooks</strong>, click <strong>Add Webhook</strong>, paste the URL above, then under the <strong>Tasks</strong> section select <em>Task.Created</em> and <em>Task.Updated</em> events, then click Save. Buildium will display a <strong>Signing Secret</strong>.
                      </p>
                    </div>

                    <Separator />

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">3</span>
                        <Label className="text-sm font-semibold">Paste Buildium's signing secret here</Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-7 mb-2">
                        Buildium generates its own secret to sign outgoing webhooks. Copy it from Buildium and paste it below so we can verify incoming requests.
                      </p>
                      <div className="flex items-center gap-2 ml-7">
                        <Input
                          className="text-xs font-mono"
                          placeholder="Paste Buildium's signing secret here..."
                          value={buildiumSecretInput}
                          onChange={e => setBuildiumSecretInput(e.target.value)}
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            handleSaveBuildiumSecret(newIntegration.id, buildiumSecretInput);
                            if (buildiumSecretInput.trim()) setNewIntegration(null);
                          }}
                          disabled={updateSecretMutation.isPending || !buildiumSecretInput.trim()}
                        >
                          <Save className="w-3 h-3 mr-1" />
                          {updateSecretMutation.isPending ? "Saving..." : "Save Secret"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground ml-7">
                        You can also paste this later from the integration card on this page.
                      </p>
                    </div>
                  </>
                ) : (
                  /* Non-Buildium: we supply the secret */
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">2</span>
                        <Label className="text-sm font-semibold">
                          Copy this Signing Secret
                          <span className="ml-2 text-xs font-normal text-muted-foreground">(header: {instructions.signatureHeader})</span>
                        </Label>
                      </div>
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
                  </>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewIntegration(null); setBuildiumSecretInput(""); }}>
              {newIntegration?.provider === "buildium" ? "Skip for Now" : "Done"}
            </Button>
            {newIntegration?.provider !== "buildium" && (
              <Button onClick={() => setNewIntegration(null)}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debug Raw API Response Dialog */}
      <Dialog open={debugDialogOpen} onOpenChange={setDebugDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />
              Raw Buildium API Response
            </DialogTitle>
            <DialogDescription>
              This shows the exact JSON returned by Buildium for your first property, its units, and first maintenance request.
              Use this to verify field names are correct.
            </DialogDescription>
          </DialogHeader>
          <DebugRawResult data={debugResult} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDebugDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
