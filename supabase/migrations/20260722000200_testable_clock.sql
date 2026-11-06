-- Local company clock; tests can pin it with set_config('mshahara.fake_now', '<timestamp>', true).
CREATE OR REPLACE FUNCTION public.company_local_now()
RETURNS timestamp
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(nullif(current_setting('mshahara.fake_now', true), '')::timestamp,
                  now() AT TIME ZONE 'Indian/Comoro');
$$;
