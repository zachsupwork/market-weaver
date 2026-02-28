import { useCallback, useRef } from "react";
import { useWalletClient } from "wagmi";
import { RelayClient } from "@polymarket/builder-relayer-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const RELAYER_URL = "https://relayer-v2.polymarket.com/";
const CHAIN_ID = 137;

/**
 * Creates and caches a RelayClient instance with remote builder signing.
 * The remote signing endpoint is a Supabase Edge Function that uses
 * builder credentials to generate HMAC auth headers.
 */
export function useRelayClient() {
  const { data: walletClient } = useWalletClient();
  const clientRef = useRef<RelayClient | null>(null);
  const lastAddressRef = useRef<string | null>(null);

  const getClient = useCallback(async (): Promise<RelayClient> => {
    if (!walletClient) throw new Error("Wallet not connected");

    const currentAddress = walletClient.account.address;
    if (clientRef.current && lastAddressRef.current === currentAddress) {
      return clientRef.current;
    }

    // Get Supabase JWT for authenticating with the signing endpoint
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Please sign in first");

    const signingUrl = `https://${PROJECT_ID}.supabase.co/functions/v1/polymarket-builder-sign`;

    const builderConfig = new BuilderConfig({
      remoteBuilderConfig: {
        url: signingUrl,
        token: session.access_token,
      },
    });

    const client = new RelayClient(
      RELAYER_URL,
      CHAIN_ID,
      walletClient,
      builderConfig,
    );

    clientRef.current = client;
    lastAddressRef.current = currentAddress;
    return client;
  }, [walletClient]);

  return { getClient, walletClient };
}
