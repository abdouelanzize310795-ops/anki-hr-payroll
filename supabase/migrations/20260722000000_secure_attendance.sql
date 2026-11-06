-- Mshahara: secure attendance — geofenced sites, rotating QR codes, work policies,
-- late/absence processing, approved devices, corrections, live board.

-- ---------------------------------------------------------------------------
-- Sites (branches) : geofence + QR
-- ---------------------------------------------------------------------------
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS radius_m integer NOT NULL DEFAULT 50 CHECK (radius_m BETWEEN 5 AND 2000),
  ADD COLUMN IF NOT EXISTS max_accuracy_m integer NOT NULL DEFAULT 50 CHECK (max_accuracy_m BETWEEN 5 AND 500),
  ADD COLUMN IF NOT EXISTS require_qr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  ADD COLUMN IF NOT EXISTS qr_rotation_seconds integer NOT NULL DEFAULT 15 CHECK (qr_rotation_seconds BETWEEN 10 AND 60),
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

-- The QR secret must never be readable by clients.
REVOKE SELECT (qr_secret) ON public.branches FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- Work policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  work_days integer[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5], -- ISO: 1 = lundi … 7 = dimanche
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '17:00',
  grace_minutes integer NOT NULL DEFAULT 15 CHECK (grace_minutes BETWEEN 0 AND 240),
  early_checkin_minutes integer NOT NULL DEFAULT 60 CHECK (early_checkin_minutes BETWEEN 0 AND 600),
  checkout_extension_minutes integer NOT NULL DEFAULT 120 CHECK (checkout_extension_minutes BETWEEN 0 AND 720),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (end_time > start_time)
);
CREATE UNIQUE INDEX IF NOT EXISTS work_policies_one_default
  ON public.work_policies (company_id) WHERE is_default AND deleted_at IS NULL;

ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS work_policy_id uuid REFERENCES public.work_policies (id) ON DELETE SET NULL;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS work_policy_id uuid REFERENCES public.work_policies (id) ON DELETE SET NULL;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS home_branch_id uuid REFERENCES public.branches (id) ON DELETE SET NULL;

INSERT INTO public.work_policies (company_id, name, is_default)
SELECT c.id, 'Horaires standard', true
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.work_policies w WHERE w.company_id = c.id AND w.is_default AND w.deleted_at IS NULL);

CREATE OR REPLACE FUNCTION public.ensure_default_work_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.work_policies (company_id, name, is_default)
  VALUES (NEW.id, 'Horaires standard', true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS companies_default_work_policy ON public.companies;
CREATE TRIGGER companies_default_work_policy
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.ensure_default_work_policy();

CREATE OR REPLACE FUNCTION public.effective_work_policy(p_employee_id uuid)
RETURNS public.work_policies
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.*
  FROM public.employees e
  LEFT JOIN public.departments d ON d.id = e.department_id
  JOIN public.work_policies w
    ON w.deleted_at IS NULL
   AND w.company_id = e.company_id
   AND w.id = COALESCE(
         e.work_policy_id,
         d.work_policy_id,
         (SELECT x.id FROM public.work_policies x
           WHERE x.company_id = e.company_id AND x.is_default AND x.deleted_at IS NULL LIMIT 1))
  WHERE e.id = p_employee_id;
$$;

-- ---------------------------------------------------------------------------
-- Attendance records : expected schedule, lateness, location trail
-- ---------------------------------------------------------------------------
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expected_start time,
  ADD COLUMN IF NOT EXISTS expected_end time,
  ADD COLUMN IF NOT EXISTS late_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_departure_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_checkout boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS check_in_lat double precision,
  ADD COLUMN IF NOT EXISTS check_in_lng double precision,
  ADD COLUMN IF NOT EXISTS check_in_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS check_in_distance_m double precision,
  ADD COLUMN IF NOT EXISTS check_out_lat double precision,
  ADD COLUMN IF NOT EXISTS check_out_lng double precision,
  ADD COLUMN IF NOT EXISTS check_out_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS check_out_distance_m double precision;

-- ---------------------------------------------------------------------------
-- Rejections, devices, corrections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees (id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches (id) ON DELETE SET NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  action text,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  distance_m double precision,
  is_mock boolean NOT NULL DEFAULT false,
  device_id text,
  reason_code text NOT NULL,
  message text NOT NULL
);
CREATE INDEX IF NOT EXISTS attendance_rejections_company_idx
  ON public.attendance_rejections (company_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.employee_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  device_id text NOT NULL,
  platform text,
  model text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  UNIQUE (employee_id, device_id)
);

CREATE TABLE IF NOT EXISTS public.attendance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  work_date date NOT NULL,
  requested_check_in time,
  requested_check_out time,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_corrections_company_idx
  ON public.attendance_corrections (company_id, status, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_policies', 'attendance_rejections', 'employee_devices', 'attendance_corrections'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_manage_company(company_id))',
      t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_manage_company(company_id)) WITH CHECK (public.can_manage_company(company_id))',
      t || '_write', t);
  END LOOP;
END
$$;
-- Every member may read the policies of their company (schedule shown in the app).
DROP POLICY IF EXISTS work_policies_member_read ON public.work_policies;
CREATE POLICY work_policies_member_read ON public.work_policies FOR SELECT TO authenticated
  USING (public.belongs_to_company(company_id));
-- Employees see their own corrections and devices.
DROP POLICY IF EXISTS attendance_corrections_own ON public.attendance_corrections;
CREATE POLICY attendance_corrections_own ON public.attendance_corrections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
DROP POLICY IF EXISTS employee_devices_own ON public.employee_devices;
CREATE POLICY employee_devices_own ON public.employee_devices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
-- Rejection log is append-only (written by security definer functions).
REVOKE INSERT, UPDATE, DELETE ON public.attendance_rejections FROM authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.haversine_m(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

CREATE OR REPLACE FUNCTION public.company_local_now()
RETURNS timestamp
LANGUAGE sql
STABLE
AS $$
  SELECT now() AT TIME ZONE 'Indian/Comoro';
$$;

-- Signature of one QR window for a site.
CREATE OR REPLACE FUNCTION public.branch_qr_signature(p_branch_id uuid, p_window bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT substr(encode(hmac(b.id::text || '.' || p_window::text, b.qr_secret, 'sha256'), 'hex'), 1, 32)
  FROM public.branches b WHERE b.id = p_branch_id;
$$;

-- Token currently shown on a site's display: "MSH1.<branchId>.<window>.<sig>".
CREATE OR REPLACE FUNCTION public.branch_qr_current(p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.branches;
  v_epoch bigint := floor(extract(epoch FROM now()))::bigint;
  v_window bigint;
BEGIN
  SELECT * INTO v_b FROM public.branches WHERE id = p_branch_id AND deleted_at IS NULL;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Site introuvable'; END IF;
  v_window := v_epoch / v_b.qr_rotation_seconds;
  RETURN jsonb_build_object(
    'token', 'MSH1.' || v_b.id || '.' || v_window || '.' || public.branch_qr_signature(v_b.id, v_window),
    'expires_in', v_b.qr_rotation_seconds - (v_epoch % v_b.qr_rotation_seconds),
    'rotation_seconds', v_b.qr_rotation_seconds,
    'branch_name', v_b.name,
    'company_name', (SELECT COALESCE(c.trade_name, c.legal_name) FROM public.companies c WHERE c.id = v_b.company_id)
  );
END;
$$;

-- Returns the branch id if the token is valid for the current or previous window.
CREATE OR REPLACE FUNCTION public.branch_qr_verify(p_token text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts text[] := string_to_array(coalesce(p_token, ''), '.');
  v_branch uuid;
  v_window bigint;
  v_rot integer;
  v_now_window bigint;
BEGIN
  IF array_length(v_parts, 1) <> 4 OR v_parts[1] <> 'MSH1' THEN RETURN NULL; END IF;
  BEGIN
    v_branch := v_parts[2]::uuid;
    v_window := v_parts[3]::bigint;
  EXCEPTION WHEN others THEN RETURN NULL;
  END;
  SELECT qr_rotation_seconds INTO v_rot FROM public.branches WHERE id = v_branch AND deleted_at IS NULL;
  IF v_rot IS NULL THEN RETURN NULL; END IF;
  v_now_window := floor(extract(epoch FROM now()))::bigint / v_rot;
  IF v_window NOT IN (v_now_window, v_now_window - 1) THEN RETURN NULL; END IF;
  IF public.branch_qr_signature(v_branch, v_window) <> v_parts[4] THEN RETURN NULL; END IF;
  RETURN v_branch;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_attendance_rejection(
  p_emp public.employees, p_branch_id uuid, p_action text, p_lat double precision, p_lng double precision,
  p_accuracy double precision, p_distance double precision, p_is_mock boolean, p_device text,
  p_code text, p_message text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.attendance_rejections
    (company_id, employee_id, branch_id, action, lat, lng, accuracy_m, distance_m, is_mock, device_id, reason_code, message)
  VALUES
    (p_emp.company_id, p_emp.id, p_branch_id, p_action, p_lat, p_lng, p_accuracy, round(p_distance::numeric, 1),
     coalesce(p_is_mock, false), p_device, p_code, p_message);
$$;

-- ---------------------------------------------------------------------------
-- Secure clock-in / clock-out (mobile)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mobile_secure_clock(
  p_device_id text,
  p_platform text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_accuracy_m double precision DEFAULT NULL,
  p_is_mock boolean DEFAULT false,
  p_qr_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    v_late := greatest(0, (extract(epoch FROM (v_time - (v_policy.start_time + make_interval(mins => v_policy.grace_minutes)))) / 60)::int);
    IF v_late > 0 THEN
      v_late := greatest(0, (extract(epoch FROM (v_time - v_policy.start_time)) / 60)::int);
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
$$;

-- Today's schedule for the employee (shown on the app home screen).
CREATE OR REPLACE FUNCTION public.mobile_get_schedule()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_policy public.work_policies;
  v_day date := public.company_local_now()::date;
  v_holiday text;
BEGIN
  v_emp := public.mobile_require_employee();
  v_policy := public.effective_work_policy(v_emp.id);
  SELECT name INTO v_holiday FROM public.public_holidays
  WHERE holiday_date = v_day AND (company_id IS NULL OR company_id = v_emp.company_id) LIMIT 1;
  RETURN jsonb_build_object(
    'work_date', v_day,
    'is_working_day', (extract(isodow FROM v_day)::int = ANY (coalesce(v_policy.work_days, ARRAY[1,2,3,4,5]))) AND v_holiday IS NULL,
    'holiday_name', v_holiday,
    'policy_name', v_policy.name,
    'start_time', to_char(v_policy.start_time, 'HH24:MI'),
    'end_time', to_char(v_policy.end_time, 'HH24:MI'),
    'grace_minutes', v_policy.grace_minutes,
    'checkin_opens', to_char(v_policy.start_time - make_interval(mins => v_policy.early_checkin_minutes), 'HH24:MI'),
    'requires_qr', EXISTS (SELECT 1 FROM public.branches b WHERE b.company_id = v_emp.company_id
                           AND b.deleted_at IS NULL AND b.require_qr
                           AND (v_emp.home_branch_id IS NULL OR b.id = v_emp.home_branch_id)),
    'geofence_enabled', EXISTS (SELECT 1 FROM public.branches b WHERE b.company_id = v_emp.company_id
                                AND b.deleted_at IS NULL AND b.latitude IS NOT NULL)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Corrections
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mobile_request_correction(
  p_work_date date,
  p_check_in time DEFAULT NULL,
  p_check_out time DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_id uuid;
BEGIN
  v_emp := public.mobile_require_employee();
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'Indiquez le motif de la correction'; END IF;
  IF p_check_in IS NULL AND p_check_out IS NULL THEN RAISE EXCEPTION 'Indiquez une heure d’entrée ou de sortie'; END IF;
  IF p_check_in IS NOT NULL AND p_check_out IS NOT NULL AND p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'L’heure de sortie doit être après l’heure d’entrée';
  END IF;
  IF p_work_date > public.company_local_now()::date OR p_work_date < public.company_local_now()::date - 60 THEN
    RAISE EXCEPTION 'Date hors période (60 derniers jours)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.attendance_corrections WHERE employee_id = v_emp.id AND work_date = p_work_date AND status = 'pending') THEN
    RAISE EXCEPTION 'Une demande de correction est déjà en attente pour ce jour';
  END IF;
  INSERT INTO public.attendance_corrections
    (company_id, employee_id, work_date, requested_check_in, requested_check_out, reason, created_by)
  VALUES (v_emp.company_id, v_emp.id, p_work_date, p_check_in, p_check_out, btrim(p_reason), auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_list_corrections(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
BEGIN
  v_emp := public.mobile_require_employee();
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(x)::jsonb)
    FROM (
      SELECT id, work_date, to_char(requested_check_in, 'HH24:MI') AS requested_check_in,
             to_char(requested_check_out, 'HH24:MI') AS requested_check_out,
             reason, status, review_note, created_at
      FROM public.attendance_corrections
      WHERE employee_id = v_emp.id
      ORDER BY created_at DESC
      LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_attendance_correction(p_id uuid, p_action text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.attendance_corrections;
  v_old public.attendance_records;
  v_new public.attendance_records;
  v_policy public.work_policies;
  v_in time;
  v_out time;
  v_late integer;
BEGIN
  SELECT * INTO v_c FROM public.attendance_corrections WHERE id = p_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT (public.can_manage_company(v_c.company_id) OR public.manages_employee(v_c.employee_id)) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF v_c.status <> 'pending' THEN RAISE EXCEPTION 'Demande déjà traitée'; END IF;
  IF p_action NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'Action inconnue'; END IF;

  UPDATE public.attendance_corrections
  SET status = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(p_note), '')
  WHERE id = p_id;

  IF p_action = 'approve' THEN
    PERFORM set_config('ankibapay.bypass_role_guard', '1', true);
    v_policy := public.effective_work_policy(v_c.employee_id);
    SELECT * INTO v_old FROM public.attendance_records
    WHERE employee_id = v_c.employee_id AND work_date = v_c.work_date AND deleted_at IS NULL;
    v_in := coalesce(v_c.requested_check_in, v_old.check_in);
    v_out := coalesce(v_c.requested_check_out, v_old.check_out);
    v_late := CASE WHEN v_in IS NOT NULL AND v_policy.id IS NOT NULL
                    AND v_in > v_policy.start_time + make_interval(mins => v_policy.grace_minutes)
                   THEN (extract(epoch FROM (v_in - v_policy.start_time)) / 60)::int ELSE 0 END;
    IF v_old.id IS NULL THEN
      INSERT INTO public.attendance_records
        (company_id, employee_id, work_date, status, check_in, check_out, worked_minutes, late_minutes,
         expected_start, expected_end, source, notes, created_by)
      VALUES
        (v_c.company_id, v_c.employee_id, v_c.work_date, CASE WHEN v_late > 0 THEN 'late' ELSE 'present' END,
         v_in, v_out,
         CASE WHEN v_in IS NOT NULL AND v_out IS NOT NULL THEN (extract(epoch FROM (v_out - v_in)) / 60)::int END,
         v_late, v_policy.start_time, v_policy.end_time, 'manual', 'Correction : ' || v_c.reason, auth.uid())
      RETURNING * INTO v_new;
    ELSE
      UPDATE public.attendance_records
      SET check_in = v_in, check_out = v_out,
          status = CASE WHEN v_in IS NULL THEN status WHEN v_late > 0 THEN 'late' ELSE 'present' END,
          worked_minutes = CASE WHEN v_in IS NOT NULL AND v_out IS NOT NULL THEN (extract(epoch FROM (v_out - v_in)) / 60)::int END,
          late_minutes = v_late, missing_checkout = (v_out IS NULL), source = 'manual',
          notes = concat_ws(E'\n', notes, 'Correction : ' || v_c.reason), updated_at = now()
      WHERE id = v_old.id
      RETURNING * INTO v_new;
    END IF;

    INSERT INTO public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, summary, metadata)
    VALUES (v_c.company_id, auth.uid(), 'attendance.correction_approved', 'attendance_record', v_new.id,
            'Correction de pointage du ' || to_char(v_c.work_date, 'DD/MM/YYYY'),
            jsonb_build_object(
              'reason', v_c.reason,
              'old', CASE WHEN v_old.id IS NULL THEN NULL ELSE jsonb_build_object('check_in', v_old.check_in, 'check_out', v_old.check_out, 'status', v_old.status) END,
              'new', jsonb_build_object('check_in', v_new.check_in, 'check_out', v_new.check_out, 'status', v_new.status)));
  END IF;

  RETURN jsonb_build_object('id', p_id, 'status', CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END);
END;
$$;

-- ---------------------------------------------------------------------------
-- Devices (HR)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_employee_device(p_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d public.employee_devices;
BEGIN
  SELECT * INTO v_d FROM public.employee_devices WHERE id = p_id;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 'Appareil introuvable'; END IF;
  IF NOT public.can_manage_company(v_d.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF p_action = 'approve' THEN
    -- One approved device per employee: the previous one is revoked.
    UPDATE public.employee_devices SET status = 'revoked', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE employee_id = v_d.employee_id AND status = 'approved' AND id <> p_id;
    UPDATE public.employee_devices SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
  ELSIF p_action = 'revoke' THEN
    UPDATE public.employee_devices SET status = 'revoked', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Action inconnue';
  END IF;
  INSERT INTO public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, summary)
  VALUES (v_d.company_id, auth.uid(), 'device.' || p_action, 'employee_device', p_id,
          coalesce(v_d.model, v_d.platform, 'Appareil') || ' — ' || p_action);
  RETURN jsonb_build_object('id', p_id, 'status', CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'revoked' END);
END;
$$;

-- ---------------------------------------------------------------------------
-- Daily processing (absences, missing check-out) — idempotent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_attendance_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamp := public.company_local_now();
  v_count integer := 0;
  v_n integer;
  v_day date;
BEGIN
  PERFORM set_config('ankibapay.bypass_role_guard', '1', true);

  -- Process today (after the end of each policy) and the 3 previous days (catch-up).
  FOR v_day IN SELECT generate_series(v_now::date - 3, v_now::date, interval '1 day')::date LOOP
    -- Missing check-out once the check-out window is closed.
    UPDATE public.attendance_records a
    SET missing_checkout = true, updated_at = now()
    FROM public.employees e
    CROSS JOIN LATERAL public.effective_work_policy(e.id) w
    WHERE a.employee_id = e.id AND a.work_date = v_day AND a.deleted_at IS NULL
      AND a.check_in IS NOT NULL AND a.check_out IS NULL AND NOT a.missing_checkout
      AND (v_day < v_now::date OR v_now::time > w.end_time + make_interval(mins => w.checkout_extension_minutes));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_count := v_count + v_n;

    -- Absent / on leave for working days without any record, once the day is over.
    INSERT INTO public.attendance_records
      (company_id, employee_id, work_date, status, expected_start, expected_end, source, notes)
    SELECT e.company_id, e.id, v_day,
           CASE WHEN EXISTS (
                  SELECT 1 FROM public.leave_requests lr
                  WHERE lr.employee_id = e.id AND lr.deleted_at IS NULL AND lr.status = 'approved'
                    AND v_day BETWEEN lr.start_date AND lr.end_date)
                THEN 'on_leave' ELSE 'absent' END,
           w.start_time, w.end_time, 'job', 'Clôture automatique'
    FROM public.employees e
    JOIN public.companies c ON c.id = e.company_id AND c.deleted_at IS NULL AND c.is_active
    CROSS JOIN LATERAL public.effective_work_policy(e.id) w
    WHERE e.deleted_at IS NULL AND e.status IN ('active', 'on_leave')
      AND e.hire_date <= v_day
      AND (e.termination_date IS NULL OR e.termination_date >= v_day)
      AND extract(isodow FROM v_day)::int = ANY (w.work_days)
      AND (v_day < v_now::date OR v_now::time > w.end_time)
      AND NOT EXISTS (SELECT 1 FROM public.public_holidays h
                      WHERE h.holiday_date = v_day AND (h.company_id IS NULL OR h.company_id = e.company_id))
      AND NOT EXISTS (SELECT 1 FROM public.attendance_records a
                      WHERE a.employee_id = e.id AND a.work_date = v_day AND a.deleted_at IS NULL)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_count := v_count + v_n;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Live board (HR / managers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_live_board(p_company_id uuid, p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := coalesce(p_date, public.company_local_now()::date);
BEGIN
  IF NOT public.belongs_to_company(p_company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN (
    WITH expected AS (
      SELECT e.id, e.first_name, e.last_name, e.job_title,
             coalesce(a.branch_id, e.home_branch_id) AS branch_id,
             a.status, a.check_in, a.check_out, a.late_minutes, a.missing_checkout, a.source,
             a.check_in_distance_m
      FROM public.employees e
      CROSS JOIN LATERAL public.effective_work_policy(e.id) w
      LEFT JOIN public.attendance_records a
        ON a.employee_id = e.id AND a.work_date = v_day AND a.deleted_at IS NULL
      WHERE e.company_id = p_company_id AND e.deleted_at IS NULL AND e.status IN ('active', 'on_leave')
        AND (a.id IS NOT NULL OR (extract(isodow FROM v_day)::int = ANY (w.work_days)
             AND NOT EXISTS (SELECT 1 FROM public.public_holidays h
                             WHERE h.holiday_date = v_day AND (h.company_id IS NULL OR h.company_id = p_company_id))))
    )
    SELECT jsonb_build_object(
      'date', v_day,
      'totals', jsonb_build_object(
        'expected', count(*),
        'present', count(*) FILTER (WHERE status = 'present'),
        'late', count(*) FILTER (WHERE status = 'late'),
        'absent', count(*) FILTER (WHERE status = 'absent'),
        'on_leave', count(*) FILTER (WHERE status = 'on_leave'),
        'not_yet', count(*) FILTER (WHERE status IS NULL),
        'missing_checkout', count(*) FILTER (WHERE missing_checkout)
      ),
      'by_branch', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'branch_id', g.branch_id, 'branch_name', coalesce(b.name, 'Sans site'),
          'expected', g.expected, 'present', g.present, 'late', g.late, 'absent', g.absent, 'not_yet', g.not_yet))
        FROM (
          SELECT branch_id, count(*) AS expected,
                 count(*) FILTER (WHERE status = 'present') AS present,
                 count(*) FILTER (WHERE status = 'late') AS late,
                 count(*) FILTER (WHERE status = 'absent') AS absent,
                 count(*) FILTER (WHERE status IS NULL) AS not_yet
          FROM expected GROUP BY branch_id
        ) g LEFT JOIN public.branches b ON b.id = g.branch_id
      ), '[]'::jsonb),
      'people', coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', id, 'name', first_name || ' ' || last_name, 'job_title', job_title,
        'status', coalesce(status, 'not_yet'), 'check_in', to_char(check_in, 'HH24:MI'),
        'check_out', to_char(check_out, 'HH24:MI'), 'late_minutes', late_minutes,
        'missing_checkout', missing_checkout, 'source', source, 'distance_m', check_in_distance_m
      ) ORDER BY last_name, first_name), '[]'::jsonb)
    )
    FROM expected
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.branch_qr_signature(uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branch_qr_current(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branch_qr_verify(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_attendance_rejection(public.employees, uuid, text, double precision, double precision, double precision, double precision, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_attendance_jobs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mobile_secure_clock(text, text, text, double precision, double precision, double precision, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_get_schedule() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_request_correction(date, time, time, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_list_corrections(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_attendance_correction(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_employee_device(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attendance_live_board(uuid, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mobile_secure_clock(text, text, text, double precision, double precision, double precision, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_get_schedule() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_request_correction(date, time, time, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_list_corrections(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_attendance_correction(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_employee_device(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_live_board(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_work_policy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.haversine_m(double precision, double precision, double precision, double precision) TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_policies, public.employee_devices, public.attendance_corrections TO authenticated;
GRANT SELECT ON public.attendance_rejections TO authenticated;
