-- Step 1: schema for hours / overtime in payroll
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS overtime_multiplier numeric(6,3) NOT NULL DEFAULT 1.500
    CHECK (overtime_multiplier >= 0);

COMMENT ON COLUMN public.companies.overtime_multiplier IS
  'Multiplicateur heures supplémentaires (configurable par entreprise, ex. 1.5).';

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS worked_hours numeric(10,2),
  ADD COLUMN IF NOT EXISTS overtime_hours numeric(10,2),
  ADD COLUMN IF NOT EXISTS expected_hours numeric(10,2);

DO $$
BEGIN
  ALTER TYPE public.payroll_calc_method ADD VALUE IF NOT EXISTS 'worked_hours';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE public.payroll_calc_method ADD VALUE IF NOT EXISTS 'overtime_hours';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
