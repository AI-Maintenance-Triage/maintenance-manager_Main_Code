import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Webhook, ChevronLeft, ChevronRight, RefreshCw, Eye, Calendar, X } from "lucide-react";

const PROVIDERS = ["all", "buildium", "appfolio", "yardi", "realpage", "propertyware", "doorloop", "rentmanager"] as const;
type QuickRange = "all" | "24h" | "7d" | "30d" | "custom";
function toDateInputValue(d: Date): string { return d.toISOString().slice(0, 10); }
const STATUSES = ["all", "received", "processed", "failed", "ignored"] as const;

type WebhookEvent = {
  id: number;
  provider: string;
  companyId: number | null;
  status: "received" | "processed" | "failed" | "ignored";
  errorMessage: string | null;
  createdJobId: number | null;
  rawPayload: unknown;
  createdAt: Date;
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    received: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    processed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    ignored: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return map[status] ?? "bg-gray-100 text-gray-700";
}

function providerBadge(provider: string) {
  const colors: Record<string, string> = {
    buildium: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    appfolio: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    yardi: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
    realpage: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    propertyware: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    doorloop: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  };
  return colors[provider.toLowerCase()] ?? "bg-gray-100 text-gray-700";
}

export default function AdminWebhookEvents() {
  const [page, setPage] = useState(0);
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchCompany, setSearchCompany] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);
  const [quickRange, setQuickRange] = useState<QuickRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const PAGE_SIZE = 25;

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    if (quickRange === "24h") return { dateFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000), dateTo: undefined };
    if (quickRange === "7d") return { dateFrom: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), dateTo: undefined };
    if (quickRange === "30d") return { dateFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), dateTo: undefined };
    if (quickRange === "custom") return {
      dateFrom: customFrom ? new Date(customFrom + "T00:00:00") : undefined,
      dateTo: customTo ? new Date(customTo + "T23:59:59") : undefined,
    };
    return { dateFrom: undefined, dateTo: undefined };
  }, [quickRange, customFrom, customTo]);

  const { data: events = [], isLoading, refetch, isFetching } = trpc.platform.webhookEvents.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    dateFrom,
    dateTo,
  });

  const hasDateFilter = quickRange !== "all";
  function clearDateFilter() { setQuickRange("all"); setCustomFrom(""); setCustomTo(""); setPage(0); }

  // Client-side filter by provider, status, and company search
  const filtered = events.filter((e) => {
    if (filterProvider !== "all" && e.provider.toLowerCase() !== filterProvider) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (searchCompany && !String(e.companyId ?? "").includes(searchCompany)) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Webhook className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">PMS Webhook Events</h1>
            <p className="text-sm text-muted-foreground">
              Inbound events from property management software integrations
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[160px]">
              <Select value={filterProvider} onValueChange={setFilterProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p === "all" ? "All Providers" : p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Filter by company ID..."
                value={searchCompany}
                onChange={(e) => { setSearchCompany(e.target.value); setPage(0); }}
              />
            </div>
          </div>
          {/* Date range row */}
          <div className="flex flex-wrap gap-2 items-center pt-1">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">Date range:</span>
            {(["all", "24h", "7d", "30d", "custom"] as QuickRange[]).map((r) => (
              <Button key={r} variant={quickRange === r ? "default" : "outline"} size="sm" className="h-7 text-xs"
                onClick={() => { setQuickRange(r); setPage(0); }}>
                {r === "all" ? "All Time" : r === "24h" ? "Last 24h" : r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : "Custom"}
              </Button>
            ))}
            {quickRange === "custom" && (
              <div className="flex items-center gap-2 ml-1">
                <Input type="date" className="h-7 text-xs w-36" value={customFrom}
                  max={customTo || toDateInputValue(new Date())}
                  onChange={(e) => { setCustomFrom(e.target.value); setPage(0); }} />
                <span className="text-muted-foreground text-xs">to</span>
                <Input type="date" className="h-7 text-xs w-36" value={customTo}
                  min={customFrom} max={toDateInputValue(new Date())}
                  onChange={(e) => { setCustomTo(e.target.value); setPage(0); }} />
              </div>
            )}
            {hasDateFilter && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={clearDateFilter}>
                <X className="h-3 w-3 mr-1" />Clear
              </Button>
            )}
            <div className="text-sm text-muted-foreground whitespace-nowrap ml-auto">
              {filtered.length} of {events.length} events
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Event Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading events...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Webhook className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No webhook events found</p>
              <p className="text-sm mt-1">
                Events will appear here once property management software sends maintenance requests.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">ID</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Timestamp</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Provider</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company ID</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Job Created</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Error</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((event, idx) => (
                    <tr
                      key={event.id}
                      className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{event.id}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {new Date(event.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${providerBadge(event.provider)}`}>
                          {event.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {event.companyId ?? <span className="text-muted-foreground italic">unknown</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(event.status)}`}>
                          {event.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {event.createdJobId ? (
                          <span className="text-green-600 dark:text-green-400 font-semibold">Job #{event.createdJobId}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        {event.errorMessage ? (
                          <span className="text-red-600 dark:text-red-400 text-xs truncate block" title={event.errorMessage}>
                            {event.errorMessage}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setSelectedEvent(event as WebhookEvent)}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {page + 1} · Showing {PAGE_SIZE} per page
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={events.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Payload Preview Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Payload — Event #{selectedEvent?.id}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Provider</span>
                  <p className="font-medium capitalize">{selectedEvent.provider}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(selectedEvent.status)}`}>
                      {selectedEvent.status}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Company ID</span>
                  <p className="font-mono">{selectedEvent.companyId ?? "unknown"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Received At</span>
                  <p>{new Date(selectedEvent.createdAt).toLocaleString()}</p>
                </div>
                {selectedEvent.createdJobId && (
                  <div>
                    <span className="text-muted-foreground">Job Created</span>
                    <p className="text-green-600 dark:text-green-400 font-semibold">Job #{selectedEvent.createdJobId}</p>
                  </div>
                )}
                {selectedEvent.errorMessage && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Error</span>
                    <p className="text-red-600 dark:text-red-400 text-sm mt-1">{selectedEvent.errorMessage}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Raw Payload</p>
                <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(selectedEvent.rawPayload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
