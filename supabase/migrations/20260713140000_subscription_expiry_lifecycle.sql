-- Part 1: enum value (must commit before use in some PG versions — applied separately remotely)
DO $$ BEGIN
  ALTER TYPE public.company_subscription_status ADD VALUE IF NOT EXISTS 'expired';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
