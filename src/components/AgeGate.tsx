import { useState, useEffect } from "react";

const STORAGE_KEY = "polyview_age_confirmed";

export function AgeGate({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setConfirmed(true);
    setLoaded(true);
  }, []);

  function handleConfirm() {
    localStorage.setItem(STORAGE_KEY, "true");
    setConfirmed(true);
  }

  if (!loaded) return null;

  if (confirmed) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <h2 className="text-xl font-bold mb-2">Age & Jurisdiction Confirmation</h2>
        <p className="text-sm text-muted-foreground mb-4">
          This is a third-party prediction market client. You must be at least 18 years old
          and located in a jurisdiction where prediction market trading is permitted.
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          By proceeding, you confirm you meet these requirements. This application does not
          provide financial advice. Trade at your own risk.
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
          >
            I Confirm — Enter
          </button>
          <a
            href="https://polymarket.com"
            className="flex-1 rounded-md border border-border py-2.5 text-sm font-semibold text-muted-foreground hover:bg-accent transition-all"
          >
            Leave
          </a>
        </div>
      </div>
    </div>
  );
}
