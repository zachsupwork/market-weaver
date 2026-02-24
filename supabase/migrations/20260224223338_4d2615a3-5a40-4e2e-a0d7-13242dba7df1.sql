-- Create table for storing encrypted Polymarket credentials
CREATE TABLE public.polymarket_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  value_encrypted TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.polymarket_secrets ENABLE ROW LEVEL SECURITY;

-- No public access policies - only service role (edge functions) can access

-- Create function to update timestamps if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_polymarket_secrets_updated_at
  BEFORE UPDATE ON public.polymarket_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();