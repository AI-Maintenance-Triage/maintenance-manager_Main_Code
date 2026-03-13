import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/StarRating";
import { toast } from "sonner";
import { Loader2, Star } from "lucide-react";

interface RateContractorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maintenanceRequestId: number;
  contractorName?: string;
  onRated?: () => void;
}

export function RateContractorDialog({
  open,
  onOpenChange,
  maintenanceRequestId,
  contractorName,
  onRated,
}: RateContractorDialogProps) {
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState("");

  const submitRating = trpc.ratings.submit.useMutation({
    onSuccess: () => {
      toast.success("Rating submitted — thank you!");
      onOpenChange(false);
      setStars(0);
      setReview("");
      onRated?.();
    },
    onError: (e) => {
      if (e.message === "Already rated") {
        toast.info("You've already rated this job");
        onOpenChange(false);
      } else {
        toast.error(e.message);
      }
    },
  });

  const handleSubmit = () => {
    if (stars === 0) {
      toast.error("Please select a star rating before submitting");
      return;
    }
    submitRating.mutate({
      maintenanceRequestId,
      stars,
      review: review.trim() || undefined,
    });
  };

  // Prevent all dismissal — only close after a rating is submitted
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) return; // block all close attempts until rating is submitted
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* [data-state=open] hides the default X close button */}
      <DialogContent
        className="max-w-md [&>button.absolute]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
            <DialogTitle>Rate Your Contractor</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            A rating is required to complete this payment. Your feedback helps maintain quality on the platform.
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {contractorName && (
            <p className="text-sm text-muted-foreground">
              How did <span className="font-medium text-foreground">{contractorName}</span> do on this job?
            </p>
          )}
          <div className="flex flex-col items-center gap-3 py-2">
            <StarRating value={stars} onChange={setStars} size="lg" />
            <p className="text-xs text-muted-foreground">
              {stars === 0 ? "Tap a star to rate" :
               stars === 1 ? "Poor" :
               stars === 2 ? "Fair" :
               stars === 3 ? "Good" :
               stars === 4 ? "Very Good" :
               "Excellent"}
            </p>
          </div>
          <Textarea
            placeholder="Optional: leave a written review for this contractor..."
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={3}
            maxLength={1000}
            className="resize-none text-sm"
          />
          {review.length > 800 && (
            <p className="text-xs text-muted-foreground text-right">{review.length}/1000</p>
          )}
        </div>
        <DialogFooter>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={stars === 0 || submitRating.isPending}
          >
            {submitRating.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {stars === 0 ? "Select a Rating to Continue" : "Submit Rating & Complete Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
