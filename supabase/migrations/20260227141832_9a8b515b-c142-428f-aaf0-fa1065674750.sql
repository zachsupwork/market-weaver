
-- Per-user Polymarket credential storage (encrypted)
CREATE TABLE public.polymarket_user_creds (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS: users can only access their own row
ALTER TABLE public.polymarket_user_creds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own creds"
  ON public.polymarket_user_creds
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own creds"
  ON public.polymarket_user_creds
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own creds"
  ON public.polymarket_user_creds
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_polymarket_user_creds_updated_at
  BEFORE UPDATE ON public.polymarket_user_creds
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
