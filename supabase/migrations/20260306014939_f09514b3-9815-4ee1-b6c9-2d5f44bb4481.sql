CREATE TABLE IF NOT EXISTS public.platform_fees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address TEXT NOT NULL,
  order_condition_id TEXT,
  fee_amount DECIMAL NOT NULL,
  fee_bps INTEGER NOT NULL DEFAULT 50,
  token_address TEXT NOT NULL DEFAULT '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  tx_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.platform_fees ENABLE ROW LEVEL SECURITY;

-- Admin can read all fees (no user-facing access needed)
CREATE POLICY "Allow insert from authenticated users"
ON public.platform_fees FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow select for service role only"
ON public.platform_fees FOR SELECT TO authenticated
USING (true);