-- Payment codes still carried the former brand prefix (ANKI-): use MSH-.
-- Existing codes are kept, since they may already be written in transfers.
create or replace function public.generate_mvola_payment_code()
returns text
language plpgsql
as $function$
declare
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := 'MSH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    select exists (
      select 1 from public.companies where payment_reference = v_code
    ) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$function$;
