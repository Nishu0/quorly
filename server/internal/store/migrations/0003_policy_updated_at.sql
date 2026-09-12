-- The dashboard shows when a tier last changed, which is the first thing
-- anyone asks when a payment routes somewhere unexpected.
ALTER TABLE policies ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE policies ADD COLUMN IF NOT EXISTS updated_by text;

-- Invitations that haven't been claimed yet still need a row, so the roster can
-- show them as pending rather than pretending they don't exist.
ALTER TABLE members ADD COLUMN IF NOT EXISTS invited_by text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS invited_at timestamptz;
