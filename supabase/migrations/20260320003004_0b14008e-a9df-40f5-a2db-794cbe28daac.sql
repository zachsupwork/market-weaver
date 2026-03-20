
-- Bot configuration table (per-user settings)
CREATE TABLE public.bot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  simulation_mode boolean NOT NULL DEFAULT true,
  min_edge numeric NOT NULL DEFAULT 0.05,
  max_bet_percent numeric NOT NULL DEFAULT 0.05,
  enabled_categories text[] NOT NULL DEFAULT ARRAY['Sports','Politics','Crypto','Finance','Pop Culture']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read own bot config" ON public.bot_config FOR SELECT USING (true);
CREATE POLICY "Anyone can insert bot config" ON public.bot_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update bot config" ON public.bot_config FOR UPDATE USING (true) WITH CHECK (true);

-- Bot opportunities table
CREATE TABLE public.bot_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address text NOT NULL,
  market_id text NOT NULL,
  condition_id text NOT NULL,
  question text NOT NULL,
  outcome text NOT NULL DEFAULT 'Yes',
  ai_probability numeric NOT NULL,
  market_price numeric NOT NULL,
  edge numeric NOT NULL,
  ai_reasoning text,
  category text,
  status text NOT NULL DEFAULT 'pending',
  executed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);

ALTER TABLE public.bot_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read opportunities" ON public.bot_opportunities FOR SELECT USING (true);
CREATE POLICY "Anyone can insert opportunities" ON public.bot_opportunities FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update opportunities" ON public.bot_opportunities FOR UPDATE USING (true) WITH CHECK (true);

-- Bot trades table
CREATE TABLE public.bot_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address text NOT NULL,
  opportunity_id uuid REFERENCES public.bot_opportunities(id),
  market_id text NOT NULL,
  condition_id text NOT NULL,
  question text NOT NULL,
  outcome text NOT NULL DEFAULT 'Yes',
  side text NOT NULL DEFAULT 'BUY',
  size numeric NOT NULL,
  entry_price numeric NOT NULL,
  current_price numeric,
  pnl numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  simulation boolean NOT NULL DEFAULT true,
  order_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read bot trades" ON public.bot_trades FOR SELECT USING (true);
CREATE POLICY "Anyone can insert bot trades" ON public.bot_trades FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update bot trades" ON public.bot_trades FOR UPDATE USING (true) WITH CHECK (true);

-- Add updated_at triggers
CREATE TRIGGER update_bot_config_updated_at BEFORE UPDATE ON public.bot_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bot_trades_updated_at BEFORE UPDATE ON public.bot_trades FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
