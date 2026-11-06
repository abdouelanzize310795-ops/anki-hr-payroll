-- Prix et limites des formules, modifiables par l'administrateur plateforme.
-- Les codes de paiement déjà générés gardent le montant figé à leur création.
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  price_per_employee numeric(14,2) CHECK (price_per_employee IS NULL OR price_per_employee >= 0),
  seat_limit int NOT NULL CHECK (seat_limit >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.subscription_plans (code, name, price_per_employee, seat_limit) VALUES
  ('starter', 'Starter', 2500, 25),
  ('pro', 'Pro', 4500, 500),
  ('enterprise', 'Entreprise', NULL, 1000000)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
-- Prices are public (landing page); changes go through admin_update_subscription_plan.
DROP POLICY IF EXISTS subscription_plans_select ON public.subscription_plans;
CREATE POLICY subscription_plans_select ON public.subscription_plans FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.subscription_plans TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.company_plan_price(p_plan text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT price_per_employee FROM public.subscription_plans WHERE code = lower(coalesce(p_plan, ''));
$$;

CREATE OR REPLACE FUNCTION public.company_plan_seat_limit(p_plan text)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    (SELECT seat_limit FROM public.subscription_plans WHERE code = lower(coalesce(p_plan, 'pro'))),
    100
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_update_subscription_plan(
  p_code text,
  p_price numeric,
  p_seat_limit int
)
RETURNS public.subscription_plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan public.subscription_plans;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Réservé à l’administrateur plateforme';
  END IF;
  IF p_price IS NOT NULL AND p_price < 0 THEN
    RAISE EXCEPTION 'Le prix ne peut pas être négatif';
  END IF;
  IF p_seat_limit IS NULL OR p_seat_limit < 1 THEN
    RAISE EXCEPTION 'La limite doit être d’au moins 1 employé';
  END IF;
  UPDATE public.subscription_plans
  SET price_per_employee = p_price, seat_limit = p_seat_limit, updated_at = now(), updated_by = auth.uid()
  WHERE code = p_code
  RETURNING * INTO v_plan;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Formule introuvable';
  END IF;
  RETURN v_plan;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_update_subscription_plan(text, numeric, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_subscription_plan(text, numeric, int) TO authenticated;
