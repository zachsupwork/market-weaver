CREATE TABLE public.market_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id text NOT NULL,
  user_address text NOT NULL,
  display_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_market_comments_condition ON public.market_comments (condition_id, created_at DESC);

ALTER TABLE public.market_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comments"
  ON public.market_comments FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert comments"
  ON public.market_comments FOR INSERT
  WITH CHECK (true);