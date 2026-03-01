import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { DollarSign, Timer, Package, CreditCard, Receipt, TrendingUp } from "lucide-react";

interface JobCostBreakdownProps {
  jobId: number;
}

export function JobCostBreakdown({ jobId }: JobCostBreakdownProps) {
  const { data: txn, isLoading } = trpc.transactions.getByJob.useQuery({ jobId });

  if (isLoading) {
    return (
      <div className="mt-3 pt-3 border-t border-border space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  if (!txn) {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground italic">No transaction record found for this job.</p>
      </div>
    );
  }

  const laborCost = parseFloat(String(txn.laborCost ?? "0"));
  const partsCost = parseFloat(String(txn.partsCost ?? "0"));
  const platformFee = parseFloat(String(txn.platformFee ?? "0"));
  const totalCharged = parseFloat(String(txn.totalCharged ?? "0"));
  const contractorPayout = parseFloat(String(txn.contractorPayout ?? "0"));

  const row = (icon: React.ReactNode, label: string, amount: number, colorClass = "text-foreground") => (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className={`font-medium ${colorClass}`}>${amount.toFixed(2)}</span>
    </div>
  );

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cost Breakdown</p>
      {row(<Timer className="h-3 w-3 text-blue-400" />, "Labor", laborCost)}
      {partsCost > 0 && row(<Package className="h-3 w-3 text-amber-400" />, "Parts & Materials", partsCost)}
      {row(<CreditCard className="h-3 w-3 text-purple-400" />, "Platform Fee", platformFee)}
      <Separator className="my-1" />
      {row(<DollarSign className="h-3 w-3 text-green-400" />, "Total Charged", totalCharged, "text-green-400 font-bold")}
      <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-border/40">
        <div className="flex items-center gap-1.5 text-muted-foreground/70">
          <TrendingUp className="h-3 w-3 text-teal-400" />
          <span>Contractor Payout</span>
        </div>
        <span className="text-teal-400 font-medium">${contractorPayout.toFixed(2)}</span>
      </div>
      {txn.paidAt && (
        <p className="text-xs text-muted-foreground/50 mt-1">
          Paid {new Date(txn.paidAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
