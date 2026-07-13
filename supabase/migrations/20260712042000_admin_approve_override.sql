-- Allow platform admin to approve from pending_payment / rejected as well
CREATE OR REPLACE FUNCTION public.admin_review_company(
  p_company_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company public.companies;
  v_action text := lower(trim(p_action));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Réservé à l’administrateur plateforme';
  END IF;

  SELECT * INTO v_company
  FROM public.companies
  WHERE id = p_company_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entreprise introuvable';
  END IF;

  IF v_action = 'approve' THEN
    IF v_company.approval_status NOT IN ('pending_approval', 'pending_payment', 'rejected') THEN
      RAISE EXCEPTION 'Cette entreprise n’est pas en attente de validation';
    END IF;

    UPDATE public.companies
    SET
      approval_status = 'approved',
      is_active = true,
      subscription_status = 'active',
      subscription_paid_at = coalesce(subscription_paid_at, now()),
      approved_at = now(),
      approved_by = auth.uid(),
      rejection_reason = NULL,
      updated_at = now()
    WHERE id = p_company_id
    RETURNING * INTO v_company;

  ELSIF v_action = 'reject' THEN
    UPDATE public.companies
    SET
      approval_status = 'rejected',
      is_active = false,
      subscription_status = CASE
        WHEN subscription_status = 'none' THEN 'none'
        ELSE 'cancelled'
      END,
      approved_at = NULL,
      approved_by = auth.uid(),
      rejection_reason = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    WHERE id = p_company_id
    RETURNING * INTO v_company;

  ELSE
    RAISE EXCEPTION 'Action invalide: %', p_action;
  END IF;

  RETURN v_company;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_company(uuid, text, text) TO authenticated;
