-- Helpdesk ticket photo attachments

ALTER TABLE public.helpdesk_tickets
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS photo_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'helpdesk-photos',
  'helpdesk-photos',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

DROP POLICY IF EXISTS helpdesk_photos_select ON storage.objects;
CREATE POLICY helpdesk_photos_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'helpdesk-photos');

DROP POLICY IF EXISTS helpdesk_photos_insert ON storage.objects;
CREATE POLICY helpdesk_photos_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'helpdesk-photos'
    AND (
      public.is_platform_admin()
      OR public.belongs_to_company(((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS helpdesk_photos_update ON storage.objects;
CREATE POLICY helpdesk_photos_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'helpdesk-photos'
    AND (
      public.is_platform_admin()
      OR public.belongs_to_company(((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS helpdesk_photos_delete ON storage.objects;
CREATE POLICY helpdesk_photos_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'helpdesk-photos'
    AND (
      public.is_platform_admin()
      OR public.can_manage_company(((storage.foldername(name))[1])::uuid)
    )
  );

CREATE OR REPLACE FUNCTION public.attach_helpdesk_ticket_photo(
  p_ticket_id uuid,
  p_photo_path text,
  p_photo_url text
)
RETURNS public.helpdesk_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t public.helpdesk_tickets;
BEGIN
  SELECT * INTO v_t
  FROM public.helpdesk_tickets
  WHERE id = p_ticket_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket introuvable';
  END IF;

  IF NOT (
    public.can_manage_company(v_t.company_id)
    OR public.is_platform_admin()
    OR v_t.created_by = auth.uid()
    OR v_t.requester_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_photo_path IS NULL OR trim(p_photo_path) = '' OR p_photo_url IS NULL OR trim(p_photo_url) = '' THEN
    RAISE EXCEPTION 'Photo invalide';
  END IF;

  UPDATE public.helpdesk_tickets SET
    photo_path = trim(p_photo_path),
    photo_url = trim(p_photo_url),
    updated_at = now()
  WHERE id = v_t.id
  RETURNING * INTO v_t;

  RETURN v_t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.attach_helpdesk_ticket_photo(uuid, text, text) TO authenticated;
