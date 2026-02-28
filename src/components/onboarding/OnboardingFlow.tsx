import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useOnboarding } from "@/hooks/useOnboarding";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Pen, Mail, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function OnboardingFlow({ children }: { children: React.ReactNode }) {
  const { isConnected, address } = useAccount();
  const onboarding = useOnboarding();
  const [supaUser, setSupaUser] = useState<any>(null);
  const [signingWelcome, setSigningWelcome] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [savingUsername, setSavingUsername] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Ensure Supabase session exists
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupaUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setSupaUser(session.user);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Refresh onboarding when supabase user changes
  useEffect(() => {
    if (supaUser && isConnected) onboarding.refresh();
  }, [supaUser, isConnected]);

  // If not connected or onboarding is complete, show children
  if (!isConnected || onboarding.onboardingCompleted || !supaUser) {
    return <>{children}</>;
  }

  if (onboarding.isLoading) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Step 1: Welcome Signature (EIP-191) ────────────────────────
  if (onboarding.step === "welcome") {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <div className="mx-4 max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center animate-slide-in">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Pen className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Welcome to PolyView</h2>
          <p className="text-sm text-muted-foreground mb-1">
            Sign a message to verify ownership of your wallet.
          </p>
          <p className="text-xs text-muted-foreground mb-6 font-mono">
            {address?.slice(0, 8)}…{address?.slice(-6)}
          </p>

          <Button
            onClick={async () => {
              setSigningWelcome(true);
              const ok = await onboarding.signWelcome();
              setSigningWelcome(false);
              if (!ok) toast.error("Signature cancelled or failed");
            }}
            disabled={signingWelcome}
            className="w-full"
            size="lg"
          >
            {signingWelcome ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {signingWelcome ? "Waiting for signature…" : "Sign to Connect"}
          </Button>

          <p className="text-[10px] text-muted-foreground mt-4">
            This signature is free and does not trigger a transaction.
          </p>
        </div>
      </div>
    );
  }

  // ── Step 2: Username Selection ─────────────────────────────────
  if (onboarding.step === "username") {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <div className="mx-4 max-w-md w-full rounded-2xl border border-border bg-card p-8 animate-slide-in">
          <h2 className="text-xl font-bold mb-2 text-center">Choose a Username</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Pick a unique username for your trading profile.
          </p>

          <div className="space-y-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
              <Input
                value={usernameInput}
                onChange={(e) => {
                  const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
                  setUsernameInput(val);
                  setUsernameError(null);
                }}
                placeholder="username"
                className="pl-8 font-mono"
                maxLength={20}
              />
            </div>
            {usernameError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {usernameError}
              </p>
            )}
            <Button
              onClick={async () => {
                if (!usernameInput || usernameInput.length < 3) {
                  setUsernameError("Username must be at least 3 characters");
                  return;
                }
                setSavingUsername(true);
                const res = await onboarding.setUsername(usernameInput);
                setSavingUsername(false);
                if (!res.ok) {
                  setUsernameError(res.error || "Failed to save");
                }
              }}
              disabled={savingUsername || !usernameInput}
              className="w-full"
              size="lg"
            >
              {savingUsername ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Continue
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground mt-6 text-center leading-relaxed">
            By trading, you agree to the Terms of Use and attest you are not a
            U.S. person or located in a restricted jurisdiction.
          </p>
        </div>
      </div>
    );
  }

  // ── Step 3: Optional Email ─────────────────────────────────────
  if (onboarding.step === "email") {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <div className="mx-4 max-w-md w-full rounded-2xl border border-border bg-card p-8 animate-slide-in">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2 text-center">Get Notifications</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Add your email to receive trade confirmations and market alerts. Optional.
          </p>

          <div className="space-y-4">
            <Input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
            />
            <Button
              onClick={async () => {
                if (!emailInput) return;
                setSavingEmail(true);
                const res = await onboarding.setEmail(emailInput);
                setSavingEmail(false);
                if (!res.ok) toast.error(res.error || "Failed");
              }}
              disabled={savingEmail || !emailInput}
              className="w-full"
              size="lg"
            >
              {savingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Continue
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await onboarding.skipEmail();
              }}
              className="w-full text-muted-foreground"
            >
              Do this later
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
