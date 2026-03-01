import { useState } from "react";
import { X, Info, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface AnnouncementBannerProps {
  userType: "company" | "contractor";
}

const TYPE_CONFIG = {
  info: {
    icon: Info,
    bg: "bg-blue-500/10 border-blue-500/30",
    text: "text-blue-300",
    iconColor: "text-blue-400",
    closeColor: "text-blue-400 hover:text-blue-200",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-yellow-500/10 border-yellow-500/30",
    text: "text-yellow-200",
    iconColor: "text-yellow-400",
    closeColor: "text-yellow-400 hover:text-yellow-200",
  },
  success: {
    icon: CheckCircle,
    bg: "bg-green-500/10 border-green-500/30",
    text: "text-green-200",
    iconColor: "text-green-400",
    closeColor: "text-green-400 hover:text-green-200",
  },
  error: {
    icon: AlertCircle,
    bg: "bg-red-500/10 border-red-500/30",
    text: "text-red-200",
    iconColor: "text-red-400",
    closeColor: "text-red-400 hover:text-red-200",
  },
} as const;

export function AnnouncementBanner({ userType }: AnnouncementBannerProps) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const { data: announcements } = trpc.announcements.active.useQuery(
    { userType },
    { staleTime: 60_000 }
  );

  const utils = trpc.useUtils();
  const dismissMutation = trpc.announcements.dismiss.useMutation({
    onSuccess: () => {
      utils.announcements.active.invalidate();
    },
  });

  const handleDismiss = (id: number) => {
    setDismissed((prev) => { const next = new Set(prev); next.add(id); return next; });
    dismissMutation.mutate({ announcementId: id });
  };

  const visible = (announcements ?? []).filter((a) => !dismissed.has(a.id));

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-4 pt-3">
      {visible.map((announcement) => {
        const type = (announcement.type ?? "info") as keyof typeof TYPE_CONFIG;
        const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;
        const Icon = config.icon;

        return (
          <div
            key={announcement.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${config.bg}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${config.text}`}>
                {announcement.title}
              </p>
              <p className={`text-sm mt-0.5 ${config.text} opacity-80`}>
                {announcement.message}
              </p>
            </div>
            <button
              onClick={() => handleDismiss(announcement.id)}
              className={`shrink-0 transition-colors ${config.closeColor}`}
              aria-label="Dismiss announcement"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
