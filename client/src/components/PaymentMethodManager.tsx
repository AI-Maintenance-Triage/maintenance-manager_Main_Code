/**
 * PaymentMethodManager
 *
 * Reusable component for managing company payment methods (cards + bank accounts).
 * Used in:
 *   - Company Settings → Payment Methods tab
 *   - Job verification dialog (payment method selector)
 *
 * Features:
 *   - List all saved payment methods (cards + US bank accounts)
 *   - Add a card (via Stripe Checkout setup mode)
 *   - Add a US bank account (via Stripe Financial Connections)
 *   - Set default payment method
 *   - Remove a payment method
 *   - Optional: selector mode for picking a payment method before submitting a job payment
 */
import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  Building2,
  Plus,
  Trash2,
  Star,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// Lazy-load Stripe.js once
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "");

interface PaymentMethod {
  id: string;
  type: string;
  brand?: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
  bankName?: string;
  accountType?: string;
  isDefault?: boolean;
}

interface Props {
  /** When true, renders as a selector (radio-style) instead of a manager */
  selectorMode?: boolean;
  /** Currently selected payment method ID (selector mode) */
  selectedId?: string | null;
  /** Callback when user selects a payment method (selector mode) */
  onSelect?: (pmId: string) => void;
  /** Hide add/remove controls (selector mode) */
  readOnly?: boolean;
}

function CardBrandIcon({ brand, type }: { brand?: string; type: string }) {
  if (type === "us_bank_account") {
    return <Building2 className="h-5 w-5 text-blue-400" />;
  }
  return <CreditCard className="h-5 w-5 text-muted-foreground" />;
}

export default function PaymentMethodManager({
  selectorMode = false,
  selectedId,
  onSelect,
  readOnly = false,
}: Props) {
  const utils = trpc.useUtils();
  const [addingBank, setAddingBank] = useState(false);

  const { data: pmData, isLoading: pmLoading } = trpc.stripePayments.listAllPaymentMethods.useQuery();

  const createSetupIntent = trpc.stripePayments.createSetupIntent.useMutation({
    onSuccess: (data) => {
      if ((data as any).checkoutUrl) {
        window.open((data as any).checkoutUrl, "_blank");
        toast.info("Opening card setup in a new tab…");
      }
    },
    onError: (err) => toast.error("Could not open card setup", { description: err.message }),
  });

  const createBankSetupIntent = trpc.stripePayments.createBankAccountSetupIntent.useMutation({
    onSuccess: async (data) => {
      setAddingBank(true);
      try {
        const stripe = await stripePromise;
        if (!stripe) throw new Error("Stripe.js not loaded");
        const { error } = await (stripe as any).collectBankAccountForSetup({
          clientSecret: data.clientSecret,
          params: {
            payment_method_type: "us_bank_account",
            payment_method_data: {
              billing_details: { name: "Company Account" },
            },
          },
          expand: ["payment_method"],
        });
        if (error) {
          toast.error("Bank account setup failed", { description: error.message });
        } else {
          // Confirm the SetupIntent to save the bank account
          const { error: confirmError } = await stripe.confirmUsBankAccountSetup(data.clientSecret);
          if (confirmError) {
            toast.error("Could not confirm bank account", { description: confirmError.message });
          } else {
            toast.success("Bank account linked! It will appear in your payment methods shortly.");
            setTimeout(() => utils.stripePayments.listAllPaymentMethods.invalidate(), 2000);
          }
        }
      } catch (err: any) {
        toast.error("Bank account setup error", { description: err.message });
      } finally {
        setAddingBank(false);
      }
    },
    onError: (err) => toast.error("Could not start bank setup", { description: err.message }),
  });

  const setDefault = trpc.stripePayments.setDefaultPaymentMethod.useMutation({
    onSuccess: () => {
      toast.success("Default payment method updated");
      utils.stripePayments.listAllPaymentMethods.invalidate();
      utils.stripePayments.listPaymentMethods.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const detach = trpc.stripePayments.detachPaymentMethod.useMutation({
    onSuccess: () => {
      toast.success("Payment method removed");
      utils.stripePayments.listAllPaymentMethods.invalidate();
      utils.stripePayments.listPaymentMethods.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const pms: PaymentMethod[] = pmData?.paymentMethods ?? [];

  // Auto-select default when in selector mode and nothing is selected yet
  useEffect(() => {
    if (selectorMode && onSelect && pms.length > 0 && !selectedId) {
      onSelect(pms[0].id);
    }
  }, [pms.length]);

  if (pmLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Payment method list */}
      {pms.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border rounded-lg">
          <CreditCard className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No payment methods saved.</p>
          {selectorMode && (
            <p className="text-xs text-amber-400 mt-1 flex items-center justify-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Add a payment method before submitting payment.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {pms.map((pm) => {
            const isSelected = selectorMode && selectedId === pm.id;
            const isBankAccount = pm.type === "us_bank_account";
            return (
              <div
                key={pm.id}
                onClick={() => selectorMode && onSelect?.(pm.id)}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  selectorMode ? "cursor-pointer" : ""
                } ${
                  isSelected
                    ? "border-primary bg-primary/8 ring-1 ring-primary/30"
                    : "border-border bg-secondary/20 hover:border-border/70"
                }`}
              >
                <div className="flex items-center gap-3">
                  {selectorMode && (
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? "border-primary" : "border-muted-foreground/40"
                    }`}>
                      {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                  )}
                  <CardBrandIcon brand={pm.brand ?? ""} type={pm.type} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {isBankAccount
                          ? `${pm.bankName || "Bank"} ••••${pm.last4}`
                          : `${pm.brand ? (pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1)) : "Card"} ••••${pm.last4}`}
                      </span>
                    </div>
                    {!isBankAccount && pm.expMonth && pm.expMonth > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Expires {String(pm.expMonth).padStart(2, "0")}/{pm.expYear}
                      </p>
                    )}
                    {isBankAccount && (
                      <p className="text-xs text-blue-400">US Bank Account (ACH)</p>
                    )}
                  </div>
                </div>

                {!readOnly && !selectorMode && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setDefault.mutate({ paymentMethodId: pm.id })}
                      disabled={setDefault.isPending}
                      title="Set as default"
                    >
                      <Star className="h-3 w-3 mr-1" /> Default
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => detach.mutate({ paymentMethodId: pm.id })}
                      disabled={detach.isPending}
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {selectorMode && isSelected && (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add buttons */}
      {!readOnly && (
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => createSetupIntent.mutate({ origin: window.location.origin })}
            disabled={createSetupIntent.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
            {createSetupIntent.isPending ? "Opening…" : "Add Card"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            onClick={() => createBankSetupIntent.mutate()}
            disabled={createBankSetupIntent.isPending || addingBank}
          >
            <Building2 className="h-3.5 w-3.5" />
            {addingBank || createBankSetupIntent.isPending ? "Connecting…" : "Add Bank Account"}
          </Button>
        </div>
      )}
    </div>
  );
}
