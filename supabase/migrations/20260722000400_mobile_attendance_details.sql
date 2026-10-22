-- Mobile attendance history: include lateness, missing check-out and source.
CREATE OR REPLACE FUNCTION public.mobile_list_attendance(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_from date;
  v_to date;
  v_today date := (now() AT TIME ZONE 'Indian/Comoro')::date;
BEGIN
  v_emp := public.mobile_require_employee();

  v_from := COALESCE(p_from, date_trunc('month', v_today::timestamp)::date);
  v_to := COALESCE(p_to, v_today);

  IF v_to < v_from THEN
    RAISE EXCEPTION 'Plage de dates invalide';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'work_date', a.work_date,
          'status', a.status,
          'check_in', a.check_in,
          'check_out', a.check_out,
          'worked_minutes', a.worked_minutes,
          'notes', a.notes,
          'late_minutes', a.late_minutes,
          'early_departure_minutes', a.early_departure_minutes,
          'missing_checkout', a.missing_checkout,
          'source', a.source
        )
        ORDER BY a.work_date DESC
      )
      FROM public.attendance_records a
      WHERE a.employee_id = v_emp.id
        AND a.deleted_at IS NULL
        AND a.work_date >= v_from
        AND a.work_date <= v_to
    ),
    '[]'::jsonb
  );
END;
$$;
