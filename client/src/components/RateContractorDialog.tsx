import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/StarRating";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
      toast.success("Rating submitted");
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
      toast.error("Please select a star rating");
      return;
    }
    submitRating.mutate({
      maintenanceRequestId,
      stars,
      review: review.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate Contractor</DialogTitle>
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
              {stars === 0 ? "Tap to rate" :
               stars === 1 ? "Poor" :
               stars === 2 ? "Fair" :
               stars === 3 ? "Good" :
               stars === 4 ? "Very Good" :
               "Excellent"}
            </p>
          </div>
          <Textarea
            placeholder="Optional: leave a review for this contractor..."
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={stars === 0 || submitRating.isPending}
          >
            {submitRating.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Rating
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
