
-- Add new columns to bot_config
ALTER TABLE public.bot_config
  ADD COLUMN IF NOT EXISTS max_markets_to_scan integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS take_profit_percent numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS stop_loss_percent numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS exit_before_resolution_hours numeric NOT NULL DEFAULT 0;

-- Add new columns to bot_opportunities
ALTER TABLE public.bot_opportunities
  ADD COLUMN IF NOT EXISTS token_id text,
  ADD COLUMN IF NOT EXISTS external_data jsonb;

-- Add new columns to bot_trades
ALTER TABLE public.bot_trades
  ADD COLUMN IF NOT EXISTS exit_price numeric,
  ADD COLUMN IF NOT EXISTS exit_reason text,
  ADD COLUMN IF NOT EXISTS exited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS token_id text;

-- Create external data cache table
CREATE TABLE IF NOT EXISTS public.bot_external_data_cache (
  market_id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_external_data_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cache" ON public.bot_external_data_cache FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert cache" ON public.bot_external_data_cache FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update cache" ON public.bot_external_data_cache FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete cache" ON public.bot_external_data_cache FOR DELETE TO public USING (true);
