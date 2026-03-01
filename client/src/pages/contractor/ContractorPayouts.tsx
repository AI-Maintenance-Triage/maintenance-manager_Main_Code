import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Banknote, ExternalLink, ArrowRight, AlertCircle } from "lucide-react";
import { Link } from "wouter";

type Payout = {
  id: string;
  amount: number;
  currency: string;
  createdAt: number;
  status: string;
  jobId: number | null;
  jobTitle: string | null;
  propertyName: string | null;
  description: string | null;
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ContractorPayouts() {
  const [cursors, setCursors] = useState<string[]>([]); // stack of startingAfter cursors for pagination
  const currentCursor = cursors[cursors.length - 1];

  const { data, isLoading } = trpc.contractor.getPayoutHistory.useQuery(
    currentCursor ? { limit: 25, startingAfter: currentCursor } : { limit: 25 }
  );

  const payouts: Payout[] = data?.payouts ?? [];
  const connected = data?.connected ?? false;
  const hasMore = data?.hasMore ?? false;

  function loadMore() {
    if (payouts.length > 0) {
      setCursors((prev) => [...prev, payouts[payouts.length - 1].id]);
    }
  }

  function loadPrev() {
    setCursors((prev) => prev.slice(0, -1));
  }

  const pageNum = cursors.length + 1;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payout History</h1>
        <p className="text-muted-foreground mt-1">
          All transfers sent to your connected bank account from completed jobs.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : !connected ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-6 flex items-start gap-4">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">No Stripe account connected</p>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your bank account to receive automatic payouts when jobs are completed and paid.
              </p>
              <Link href="/contractor/billing">
                <Button size="sm" className="mt-3 gap-2">
                  Connect Bank Account <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : payouts.length === 0 && pageNum === 1 ? (
        <Card>
          <CardContent className="p-12 flex flex-col items-center justify-center text-center gap-3">
            <Banknote className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-foreground">No payouts yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Payouts will appear here once a company pays for a completed job and the funds are transferred to your account.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Transfer History</CardTitle>
            <CardDescription>
              Page {pageNum} &mdash; {payouts.length} transfer{payouts.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {payouts.map((payout) => (
                <div key={payout.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      payout.status === "reversed"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-green-500/10 text-green-600 dark:text-green-400"
                    }`}>
                      <Banknote className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">
                        {payout.jobTitle ?? payout.description ?? "Payout"}
                      </p>
                      {payout.propertyName && (
                        <p className="text-xs text-muted-foreground truncate">{payout.propertyName}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(payout.createdAt)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <div className="text-right">
                      <p className={`font-semibold text-sm ${
                        payout.status === "reversed"
                          ? "text-destructive"
                          : "text-green-600 dark:text-green-400"
                      }`}>
                        {payout.status === "reversed" ? "-" : "+"}
                        {formatCurrency(payout.amount, payout.currency)}
                      </p>
                      <Badge
                        variant={payout.status === "reversed" ? "destructive" : "outline"}
                        className={`text-[10px] mt-1 ${
                          payout.status === "paid"
                            ? "border-green-500/30 text-green-600 dark:text-green-400 bg-green-500/10"
                            : ""
                        }`}
                      >
                        {payout.status === "reversed" ? "Reversed" : "Paid"}
                      </Badge>
                    </div>
                    {payout.jobId && (
                      <Link href="/contractor/my-jobs">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {(cursors.length > 0 || hasMore) && (
              <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadPrev}
                  disabled={cursors.length === 0}
                >
                  &larr; Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={!hasMore}
                >
                  Next &rarr;
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
