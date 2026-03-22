ALTER TABLE bot_opportunities ADD COLUMN IF NOT EXISTS suggested_action TEXT;
ALTER TABLE bot_opportunities ADD COLUMN IF NOT EXISTS suggested_entry NUMERIC;
ALTER TABLE bot_opportunities ADD COLUMN IF NOT EXISTS suggested_take_profit NUMERIC;
ALTER TABLE bot_opportunities ADD COLUMN IF NOT EXISTS suggested_stop_loss NUMERIC;