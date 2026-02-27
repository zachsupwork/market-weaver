import { useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, UserCircle, CheckCircle } from "lucide-react";

interface AuthGateProps {
  children: ReactNode;
  /** If true, silently attempt anonymous sign-in on mount */
  autoAnonymous?: boolean;
}

export function AuthGate({ children, autoAnonymous = false }: AuthGateProps) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [mode, setMode] = useState<"choice" | "email">("choice");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      if (existing) {
        setSession(existing);
        setLoading(false);
      } else if (autoAnonymous) {
        // Silently attempt anonymous sign-in
        try {
          const { error: anonErr } = await supabase.auth.signInAnonymously();
          if (anonErr) {
            console.warn("Anonymous sign-in failed:", anonErr.message);
            setError(anonErr.message.includes("not enabled")
              ? "Anonymous sign-in is not enabled. Please sign in with email."
              : anonErr.message);
          }
        } catch {
          // fall through to manual auth
        }
        setLoading(false);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [autoAnonymous]);

  async function handleAnonymous() {
    setSigningIn(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInAnonymously();
      if (err) {
        setError(err.message.includes("not enabled")
          ? "Anonymous sign-in is not enabled on this project. Use email sign-in instead."
          : err.message);
      }
    } catch (e: any) {
      setError(e.message || "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleEmailOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSigningIn(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({ email });
      if (err) {
        setError(err.message);
      } else {
        setOtpSent(true);
      }
    } catch (e: any) {
      setError(e.message || "Failed to send login link");
    } finally {
      setSigningIn(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (session) {
    return <>{children}</>;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserCircle className="h-4 w-4" /> Sign In Required
        </CardTitle>
        <CardDescription>
          A session is needed to securely store your encrypted trading credentials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {mode === "choice" && !otpSent && (
          <div className="space-y-2">
            <Button
              onClick={handleAnonymous}
              disabled={signingIn}
              variant="default"
              className="w-full"
            >
              {signingIn ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserCircle className="h-4 w-4 mr-2" />}
              Continue as Guest
            </Button>
            <Button
              onClick={() => setMode("email")}
              variant="outline"
              className="w-full"
            >
              <Mail className="h-4 w-4 mr-2" />
              Sign in with Email
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              Guest sessions are anonymous — no email needed. Your credentials are still encrypted per-session.
            </p>
          </div>
        )}

        {mode === "email" && !otpSent && (
          <form onSubmit={handleEmailOtp} className="space-y-3">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={signingIn || !email} className="flex-1">
                {signingIn ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                Send Login Link
              </Button>
              <Button type="button" variant="ghost" onClick={() => setMode("choice")}>
                Back
              </Button>
            </div>
          </form>
        )}

        {otpSent && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <CheckCircle className="h-4 w-4" />
            <span>Check your email for a login link.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
