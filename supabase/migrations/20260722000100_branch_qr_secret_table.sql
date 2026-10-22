-- Keep QR signing secrets out of the readable branches table.
CREATE TABLE IF NOT EXISTS public.branch_qr_secrets (
  branch_id uuid PRIMARY KEY REFERENCES public.branches (id) ON DELETE CASCADE,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  rotated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.branch_qr_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.branch_qr_secrets FROM PUBLIC, anon, authenticated;

INSERT INTO public.branch_qr_secrets (branch_id, secret)
SELECT id, qr_secret FROM public.branches
ON CONFLICT (branch_id) DO NOTHING;

ALTER TABLE public.branches DROP COLUMN IF EXISTS qr_secret;

CREATE OR REPLACE FUNCTION public.ensure_branch_qr_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.branch_qr_secrets (branch_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS branches_qr_secret ON public.branches;
CREATE TRIGGER branches_qr_secret AFTER INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.ensure_branch_qr_secret();

CREATE OR REPLACE FUNCTION public.branch_qr_signature(p_branch_id uuid, p_window bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT substr(encode(hmac(s.branch_id::text || '.' || p_window::text, s.secret, 'sha256'), 'hex'), 1, 32)
  FROM public.branch_qr_secrets s WHERE s.branch_id = p_branch_id;
$$;
REVOKE ALL ON FUNCTION public.branch_qr_signature(uuid, bigint) FROM PUBLIC, anon, authenticated;

-- HR can regenerate a site's secret (invalidates every code already shown).
CREATE OR REPLACE FUNCTION public.rotate_branch_qr_secret(p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = p_branch_id AND public.can_manage_company(b.company_id)) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  INSERT INTO public.branch_qr_secrets (branch_id) VALUES (p_branch_id)
  ON CONFLICT (branch_id) DO UPDATE SET secret = encode(gen_random_bytes(32), 'hex'), rotated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.rotate_branch_qr_secret(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_branch_qr_secret(uuid) TO authenticated;
