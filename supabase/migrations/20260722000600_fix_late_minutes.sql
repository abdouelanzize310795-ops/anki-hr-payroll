-- Lateness computed in minutes (a long grace added to a time used to wrap around midnight).
CREATE OR REPLACE FUNCTION public.mobile_secure_clock(p_device_id text, p_platform text DEFAULT NULL::text, p_model text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy_m double precision DEFAULT NULL::double precision, p_is_mock boolean DEFAULT false, p_qr_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp public.employees;
  v_policy public.work_policies;
  v_device public.employee_devices;
  v_branch public.branches;
  v_qr_branch uuid;
  v_local timestamp := public.company_local_now();
  v_day date := v_local::date;
  v_time time := date_trunc('minute', v_local)::time;
  v_row public.attendance_records;
  v_action text;
  v_distance double precision;
  v_late integer := 0;
  v_early integer := 0;
  v_msg text;
  v_any_site boolean;
BEGIN
  v_emp := public.mobile_require_employee();
  PERFORM set_config('ankibapay.bypass_role_guard', '1', true);

  SELECT * INTO v_row FROM public.attendance_records
  WHERE employee_id = v_emp.id AND work_date = v_day AND deleted_at IS NULL;
  v_action := CASE WHEN v_row.id IS NOT NULL AND v_row.check_in IS NOT NULL THEN 'out' ELSE 'in' END;

  -- 1. QR code (when scanned)
  IF p_qr_token IS NOT NULL AND btrim(p_qr_token) <> '' THEN
    v_qr_branch := public.branch_qr_verify(p_qr_token);
    IF v_qr_branch IS NULL THEN
      v_msg := 'QR code expiré ou invalide. Scannez le code affiché à l’écran.';
      PERFORM public.log_attendance_rejection(v_emp, NULL, v_action, p_lat, p_lng, p_accuracy_m, NULL, p_is_mock, p_device_id, 'qr_invalid', v_msg);
      RETURN jsonb_build_object('ok', false, 'code', 'qr_invalid', 'message', v_msg);
    END IF;
    SELECT * INTO v_branch FROM public.branches WHERE id = v_qr_branch;
    -- 2. Same company
    IF v_branch.company_id <> v_emp.company_id THEN
      v_msg := 'Ce QR code n’appartient pas à votre entreprise.';
      PERFORM public.log_attendance_rejection(v_emp, NULL, v_action, p_lat, p_lng, p_accuracy_m, NULL, p_is_mock, p_device_id, 'qr_other_company', v_msg);
      RETURN jsonb_build_object('ok', false, 'code', 'qr_other_company', 'message', v_msg);
    END IF;
  END IF;

  -- 3. Approved device (first device is approved automatically)
  IF coalesce(btrim(p_device_id), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'device_missing', 'message', 'Appareil non identifié. Mettez l’application à jour.');
  END IF;
  INSERT INTO public.employee_devices (company_id, employee_id, device_id, platform, model, status, reviewed_at)
  VALUES (
    v_emp.company_id, v_emp.id, p_device_id, p_platform, p_model,
    CASE WHEN EXISTS (SELECT 1 FROM public.employee_devices WHERE employee_id = v_emp.id AND status = 'approved')
         THEN 'pending' ELSE 'approved' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.employee_devices WHERE employee_id = v_emp.id AND status = 'approved')
         THEN NULL ELSE now() END
  )
  ON CONFLICT (employee_id, device_id) DO UPDATE SET last_seen_at = now(), model = coalesce(EXCLUDED.model, employee_devices.model)
  RETURNING * INTO v_device;
  IF v_device.status <> 'approved' THEN
    v_msg := CASE WHEN v_device.status = 'revoked'
      THEN 'Ce téléphone a été retiré par les RH. Utilisez votre téléphone autorisé.'
      ELSE 'Nouveau téléphone détecté : il doit être approuvé par les RH avant de pointer.' END;
    PERFORM public.log_attendance_rejection(v_emp, v_branch.id, v_action, p_lat, p_lng, p_accuracy_m, NULL, p_is_mock, p_device_id, 'device_' || v_device.status, v_msg);
    RETURN jsonb_build_object('ok', false, 'code', 'device_' || v_device.status, 'message', v_msg);
  END IF;

  -- 4. Working day and time window
  v_policy := public.effective_work_policy(v_emp.id);
  IF v_policy.id IS NULL THEN
    SELECT * INTO v_policy FROM public.work_policies WHERE company_id = v_emp.company_id ORDER BY is_default DESC LIMIT 1;
  END IF;
  IF NOT (extract(isodow FROM v_day)::int = ANY (v_policy.work_days))
     OR EXISTS (SELECT 1 FROM public.public_holidays h
                WHERE h.holiday_date = v_day AND (h.company_id IS NULL OR h.company_id = v_emp.company_id)) THEN
    v_msg := 'Aujourd’hui n’est pas un jour travaillé.';
    PERFORM public.log_attendance_rejection(v_emp, v_branch.id, v_action, p_lat, p_lng, p_accuracy_m, NULL, p_is_mock, p_device_id, 'not_working_day', v_msg);
    RETURN jsonb_build_object('ok', false, 'code', 'not_working_day', 'message', v_msg);
  END IF;
  IF v_action = 'in' AND (v_time < v_policy.start_time - make_interval(mins => v_policy.early_checkin_minutes)
                          OR v_time > v_policy.end_time) THEN
    v_msg := format('Pointage d’entrée possible de %s à %s.',
      to_char(v_policy.start_time - make_interval(mins => v_policy.early_checkin_minutes), 'HH24:MI'),
      to_char(v_policy.end_time, 'HH24:MI'));
    PERFORM public.log_attendance_rejection(v_emp, v_branch.id, v_action, p_lat, p_lng, p_accuracy_m, NULL, p_is_mock, p_device_id, 'outside_window', v_msg);
    RETURN jsonb_build_object('ok', false, 'code', 'outside_window', 'message', v_msg);
  END IF;
  IF v_action = 'out' AND v_time > v_policy.end_time + make_interval(mins => v_policy.checkout_extension_minutes) THEN
    v_msg := format('Pointage de sortie fermé depuis %s. Demandez une correction.',
      to_char(v_policy.end_time + make_interval(mins => v_policy.checkout_extension_minutes), 'HH24:MI'));
    PERFORM public.log_attendance_rejection(v_emp, v_branch.id, v_action, p_lat, p_lng, p_accuracy_m, NULL, p_is_mock, p_device_id, 'outside_window', v_msg);
    RETURN jsonb_build_object('ok', false, 'code', 'outside_window', 'message', v_msg);
  END IF;

  -- 5. Mock location
  IF coalesce(p_is_mock, false) THEN
    v_msg := 'Fausse position détectée. Désactivez l’application de localisation simulée.';
    PERFORM public.log_attendance_rejection(v_emp, v_branch.id, v_action, p_lat, p_lng, p_accuracy_m, NULL, true, p_device_id, 'mock_location', v_msg);
    RETURN jsonb_build_object('ok', false, 'code', 'mock_location', 'message', v_msg);
  END IF;

  -- Site to check against: the scanned one, else the nearest pinned site of the company.
  SELECT EXISTS (SELECT 1 FROM public.branches WHERE company_id = v_emp.company_id AND deleted_at IS NULL
                 AND is_active AND latitude IS NOT NULL) INTO v_any_site;
  IF v_branch.id IS NULL AND v_any_site THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      v_msg := 'Position introuvable. Activez la localisation pour pointer.';
      PERFORM public.log_attendance_rejection(v_emp, NULL, v_action, p_lat, p_lng, p_accuracy_m, NULL, p_is_mock, p_device_id, 'no_location', v_msg);
      RETURN jsonb_build_object('ok', false, 'code', 'no_location', 'message', v_msg);
    END IF;
    SELECT * INTO v_branch FROM public.branches
    WHERE company_id = v_emp.company_id AND deleted_at IS NULL AND is_active AND latitude IS NOT NULL
    ORDER BY public.haversine_m(p_lat, p_lng, latitude, longitude)
    LIMIT 1;
    IF v_branch.require_qr THEN
      v_msg := format('Le site « %s » exige de scanner le QR code affiché à l’écran.', v_branch.name);
      PERFORM public.log_attendance_rejection(v_emp, v_branch.id, v_action, p_lat, p_lng, p_accuracy_m, NULL, p_is_mock, p_device_id, 'qr_required', v_msg);
      RETURN jsonb_build_object('ok', false, 'code', 'qr_required', 'message', v_msg);
    END IF;
  END IF;

  IF v_branch.id IS NOT NULL AND v_branch.latitude IS NOT NULL THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      v_msg := 'Position introuvable. Activez la localisation pour pointer.';
      PERFORM public.log_attendance_rejection(v_emp, v_branch.id, v_action, p_lat, p_lng, p_accuracy_m, NULL, p_is_mock, p_device_id, 'no_location', v_msg);
      RETURN jsonb_build_object('ok', false, 'code', 'no_location', 'message', v_msg);
    END IF;
    -- 6. GPS accuracy
    IF p_accuracy_m IS NULL OR p_accuracy_m > v_branch.max_accuracy_m THEN
      v_msg := format('Signal GPS trop imprécis (±%s m, maximum %s m). Rapprochez-vous d’une fenêtre et réessayez.',
        coalesce(round(p_accuracy_m)::text, '?'), v_branch.max_accuracy_m);
      PERFORM public.log_attendance_rejection(v_emp, v_branch.id, v_action, p_lat, p_lng, p_accuracy_m, NULL, p_is_mock, p_device_id, 'low_accuracy', v_msg);
      RETURN jsonb_build_object('ok', false, 'code', 'low_accuracy', 'message', v_msg);
    END IF;
    -- 7. Distance
    v_distance := public.haversine_m(p_lat, p_lng, v_branch.latitude, v_branch.longitude);
    IF v_distance > v_branch.radius_m THEN
      v_msg := format('Vous êtes à %s m de « %s » (maximum %s m). Rapprochez-vous pour pointer.',
        round(v_distance), v_branch.name, v_branch.radius_m);
      PERFORM public.log_attendance_rejection(v_emp, v_branch.id, v_action, p_lat, p_lng, p_accuracy_m, v_distance, p_is_mock, p_device_id, 'too_far', v_msg);
      RETURN jsonb_build_object('ok', false, 'code', 'too_far', 'message', v_msg, 'distance_m', round(v_distance));
    END IF;
  END IF;

  -- All checks passed: record check-in or check-out.
  IF v_action = 'in' THEN
    v_late := (extract(epoch FROM v_time) / 60)::int - (extract(epoch FROM v_policy.start_time) / 60)::int;
    IF v_late <= v_policy.grace_minutes THEN
      v_late := 0;
    END IF;
    IF v_row.id IS NULL THEN
      INSERT INTO public.attendance_records
        (company_id, employee_id, work_date, status, check_in, created_by, branch_id, expected_start, expected_end,
         late_minutes, source, check_in_lat, check_in_lng, check_in_accuracy_m, check_in_distance_m)
      VALUES
        (v_emp.company_id, v_emp.id, v_day, CASE WHEN v_late > 0 THEN 'late' ELSE 'present' END, v_time, auth.uid(),
         v_branch.id, v_policy.start_time, v_policy.end_time, v_late,
         CASE WHEN v_qr_branch IS NOT NULL THEN 'qr' ELSE 'mobile' END,
         p_lat, p_lng, p_accuracy_m, round(v_distance::numeric, 1))
      RETURNING * INTO v_row;
    ELSE
      UPDATE public.attendance_records
      SET status = CASE WHEN v_late > 0 THEN 'late' ELSE 'present' END, check_in = v_time, branch_id = v_branch.id,
          expected_start = v_policy.start_time, expected_end = v_policy.end_time, late_minutes = v_late,
          source = CASE WHEN v_qr_branch IS NOT NULL THEN 'qr' ELSE 'mobile' END,
          check_in_lat = p_lat, check_in_lng = p_lng, check_in_accuracy_m = p_accuracy_m,
          check_in_distance_m = round(v_distance::numeric, 1), updated_at = now()
      WHERE id = v_row.id
      RETURNING * INTO v_row;
    END IF;
  ELSE
    v_early := greatest(0, (extract(epoch FROM (v_policy.end_time - v_time)) / 60)::int);
    UPDATE public.attendance_records
    SET check_out = v_time,
        worked_minutes = greatest(0, (extract(epoch FROM (v_time - check_in)) / 60)::int),
        early_departure_minutes = v_early,
        missing_checkout = false,
        check_out_lat = p_lat, check_out_lng = p_lng, check_out_accuracy_m = p_accuracy_m,
        check_out_distance_m = round(v_distance::numeric, 1), updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'action', v_action,
    'time', to_char(v_time, 'HH24:MI'),
    'status', v_row.status,
    'late_minutes', v_row.late_minutes,
    'early_departure_minutes', v_row.early_departure_minutes,
    'worked_minutes', v_row.worked_minutes,
    'branch_name', v_branch.name,
    'distance_m', round(v_distance),
    'message', CASE
      WHEN v_action = 'in' AND v_late > 0 THEN format('Entrée %s — %s min de retard', to_char(v_time, 'HH24:MI'), v_late)
      WHEN v_action = 'in' THEN format('Entrée %s — à l’heure', to_char(v_time, 'HH24:MI'))
      WHEN v_early > 0 THEN format('Sortie %s — départ anticipé de %s min', to_char(v_time, 'HH24:MI'), v_early)
      ELSE format('Sortie %s — bonne fin de journée', to_char(v_time, 'HH24:MI'))
    END
  );
END;
$function$;
