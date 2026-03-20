import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function fnUrl(name: string) {
  return `https://${PROJECT_ID}.supabase.co/functions/v1/${name}`;
}

export interface BotConfig {
  id: string;
  user_address: string;
  enabled: boolean;
  simulation_mode: boolean;
  min_edge: number;
  max_bet_percent: number;
  enabled_categories: string[];
  max_markets_to_scan: number;
  take_profit_percent: number;
  stop_loss_percent: number;
  exit_before_resolution_hours: number;
  created_at: string;
  updated_at: string;
}

export interface BotOpportunity {
  id: string;
  user_address: string;
  market_id: string;
  condition_id: string;
  question: string;
  outcome: string;
  ai_probability: number;
  market_price: number;
  edge: number;
  ai_reasoning: string | null;
  category: string | null;
  status: string;
  executed: boolean;
  created_at: string;
  expires_at: string;
  token_id: string | null;
  external_data: any;
  event_slug: string | null;
}

export interface BotTrade {
  id: string;
  user_address: string;
  opportunity_id: string | null;
  market_id: string;
  condition_id: string;
  question: string;
  outcome: string;
  side: string;
  size: number;
  entry_price: number;
  current_price: number | null;
  pnl: number | null;
  status: string;
  simulation: boolean;
  order_id: string | null;
  error_message: string | null;
  token_id: string | null;
  exit_price: number | null;
  exit_reason: string | null;
  exited: boolean;
  created_at: string;
  updated_at: string;
}

export function useBotConfig(address?: string) {
  const queryClient = useQueryClient();
  const normalizedAddress = address?.toLowerCase();

  const configQuery = useQuery({
    queryKey: ["bot-config", normalizedAddress],
    queryFn: async (): Promise<BotConfig | null> => {
      if (!normalizedAddress) return null;
      const { data, error } = await supabase
        .from("bot_config" as any)
        .select("*")
        .eq("user_address", normalizedAddress)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!normalizedAddress,
  });

  const upsertConfig = useMutation({
    mutationFn: async (updates: Partial<BotConfig>) => {
      if (!normalizedAddress) throw new Error("No address");
      const { data: existing } = await supabase
        .from("bot_config" as any)
        .select("id")
        .eq("user_address", normalizedAddress)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("bot_config" as any)
          .update(updates as any)
          .eq("user_address", normalizedAddress);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("bot_config" as any)
          .insert({ user_address: normalizedAddress, ...updates } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot-config", normalizedAddress] }),
  });

  return { config: configQuery.data, isLoading: configQuery.isLoading, upsertConfig };
}

export function useBotOpportunities(address?: string) {
  const normalizedAddress = address?.toLowerCase();

  return useQuery({
    queryKey: ["bot-opportunities", normalizedAddress],
    queryFn: async (): Promise<BotOpportunity[]> => {
      if (!normalizedAddress) return [];
      const { data, error } = await supabase
        .from("bot_opportunities" as any)
        .select("*")
        .eq("user_address", normalizedAddress)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!normalizedAddress,
    refetchInterval: 30000,
  });
}

export function useBotTrades(address?: string) {
  const normalizedAddress = address?.toLowerCase();

  return useQuery({
    queryKey: ["bot-trades", normalizedAddress],
    queryFn: async (): Promise<BotTrade[]> => {
      if (!normalizedAddress) return [];
      const { data, error } = await supabase
        .from("bot_trades" as any)
        .select("*")
        .eq("user_address", normalizedAddress)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!normalizedAddress,
    refetchInterval: 15000,
  });
}

export function useBotScanner(address?: string) {
  const queryClient = useQueryClient();
  const [isScanning, setIsScanning] = useState(false);

  const scan = useCallback(async () => {
    if (!address || isScanning) return;
    setIsScanning(true);
    try {
      const res = await fetch(`${fnUrl("bot-scan-markets")}?address=${encodeURIComponent(address)}`, {
        headers: { apikey: ANON_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Scan failed: ${res.status}`);
      queryClient.invalidateQueries({ queryKey: ["bot-opportunities", address.toLowerCase()] });
      return data;
    } finally {
      setIsScanning(false);
    }
  }, [address, isScanning, queryClient]);

  return { scan, isScanning };
}

export function useBotExecutor(address?: string) {
  const queryClient = useQueryClient();
  const [isExecuting, setIsExecuting] = useState(false);

  const execute = useCallback(async () => {
    if (!address || isExecuting) return;
    setIsExecuting(true);
    try {
      const res = await fetch(`${fnUrl("bot-execute-trades")}?address=${encodeURIComponent(address)}`, {
        headers: { apikey: ANON_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Execute failed: ${res.status}`);
      queryClient.invalidateQueries({ queryKey: ["bot-trades", address.toLowerCase()] });
      queryClient.invalidateQueries({ queryKey: ["bot-opportunities", address.toLowerCase()] });
      return data;
    } finally {
      setIsExecuting(false);
    }
  }, [address, isExecuting, queryClient]);

  return { execute, isExecuting };
}

export function useBotMonitor(address?: string) {
  const queryClient = useQueryClient();
  const [isMonitoring, setIsMonitoring] = useState(false);

  const monitor = useCallback(async () => {
    if (isMonitoring) return;
    setIsMonitoring(true);
    try {
      const res = await fetch(fnUrl("bot-monitor-positions"), {
        headers: { apikey: ANON_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Monitor failed: ${res.status}`);
      if (address) {
        queryClient.invalidateQueries({ queryKey: ["bot-trades", address.toLowerCase()] });
      }
      return data;
    } finally {
      setIsMonitoring(false);
    }
  }, [isMonitoring, queryClient, address]);

  return { monitor, isMonitoring };
}
