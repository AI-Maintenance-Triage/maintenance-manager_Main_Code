import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Smartphone, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // Check if previously dismissed
    const wasDismissed = localStorage.getItem("pwa-banner-dismissed");
    if (wasDismissed) return;

    // Detect iOS (Safari doesn't support beforeinstallprompt)
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      // Show iOS manual install instructions after a short delay
      setTimeout(() => setShowBanner(true), 3000);
      return;
    }

    // Listen for Chrome/Android install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowBanner(true), 3000);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setDismissed(true);
    localStorage.setItem("pwa-banner-dismissed", "true");
  };

  if (!showBanner || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto">
      <div className="bg-card border border-primary/30 rounded-xl shadow-2xl p-4 flex gap-3 items-start">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Add to Home Screen</p>
          {isIOS ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap the <strong>Share</strong> button in Safari, then <strong>"Add to Home Screen"</strong> for reliable GPS tracking in the background.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              Install the app for reliable GPS tracking and faster access — no app store required.
            </p>
          )}
          {!isIOS && (
            <Button
              size="sm"
              className="mt-2 h-7 text-xs gap-1"
              onClick={handleInstall}
            >
              <Download className="h-3 w-3" /> Install App
            </Button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
