import { useState, useEffect, useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { supabase } from "@/integrations/supabase/client";

export type OnboardingStep = "welcome" | "username" | "email" | "complete";

export interface OnboardingState {
  step: OnboardingStep;
  isLoading: boolean;
  welcomeSigned: boolean;
  username: string | null;
  email: string | null;
  onboardingCompleted: boolean;
  signWelcome: () => Promise<boolean>;
  setUsername: (username: string) => Promise<{ ok: boolean; error?: string }>;
  setEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  skipEmail: () => Promise<void>;
  refresh: () => Promise<void>;
}

const WELCOME_MESSAGE = "Welcome to Polymarket! Sign to connect.";

export function useOnboarding(): OnboardingState {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [welcomeSigned, setWelcomeSigned] = useState(false);
  const [username, setUsernameState] = useState<string | null>(null);
  const [email, setEmailState] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profile) {
        setWelcomeSigned(profile.welcome_signed);
        setUsernameState(profile.username);
        setEmailState(profile.email);
        setOnboardingCompleted(profile.onboarding_completed);
      }
    } catch (err) {
      console.warn("[Onboarding] refresh error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected) refresh();
    else setIsLoading(false);
  }, [isConnected, refresh]);

  const signWelcome = useCallback(async (): Promise<boolean> => {
    if (!address) return false;
    try {
      await signMessageAsync({ message: WELCOME_MESSAGE, account: address });
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      await supabase.from("user_profiles").upsert({
        user_id: session.user.id,
        wallet_address: address.toLowerCase(),
        welcome_signed: true,
      }, { onConflict: "user_id" });

      setWelcomeSigned(true);
      return true;
    } catch {
      return false;
    }
  }, [address, signMessageAsync]);

  const setUsername = useCallback(async (name: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { ok: false, error: "Not authenticated" };

      const { error } = await supabase.from("user_profiles").update({
        username: name.toLowerCase().replace(/[^a-z0-9_]/g, ""),
      }).eq("user_id", session.user.id);

      if (error) {
        if (error.message.includes("unique") || error.message.includes("duplicate")) {
          return { ok: false, error: "Username already taken" };
        }
        return { ok: false, error: error.message };
      }
      setUsernameState(name);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }, []);

  const setEmail = useCallback(async (emailVal: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { ok: false, error: "Not authenticated" };

      const { error } = await supabase.from("user_profiles").update({
        email: emailVal,
        onboarding_completed: true,
      }).eq("user_id", session.user.id);

      if (error) return { ok: false, error: error.message };
      setEmailState(emailVal);
      setOnboardingCompleted(true);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }, []);

  const skipEmail = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.from("user_profiles").update({
        onboarding_completed: true,
      }).eq("user_id", session.user.id);

      setOnboardingCompleted(true);
    } catch {}
  }, []);

  let step: OnboardingStep = "welcome";
  if (welcomeSigned) step = "username";
  if (welcomeSigned && username) step = "email";
  if (onboardingCompleted) step = "complete";

  return {
    step,
    isLoading,
    welcomeSigned,
    username,
    email,
    onboardingCompleted,
    signWelcome,
    setUsername,
    setEmail,
    skipEmail,
    refresh,
  };
}
