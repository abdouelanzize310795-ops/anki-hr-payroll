import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/supabase/env";
import {
  createCompanySchema,
  prepareLogoUploadSchema,
  updateCompanySchema,
} from "./schemas";
import type { Branch, Company, CompanyWithMeta, Country, Currency, Department } from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

const LOGO_BUCKET = "company-logos";

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Authentification requise");
  }
  return data.user.id;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
}

function publicLogoUrl(path: string): string {
  const { VITE_SUPABASE_URL } = getPublicEnv();
  return `${VITE_SUPABASE_URL}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}

export const listCountries = createServerFn({ method: "GET" }).handler(async (): Promise<Country[]> => {
  await requireUserId();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("countries")
    .select("*")
    .eq("is_active", true)
    .order("name_fr");
  if (error) throw new Error(error.message);
  return (data ?? []) as Country[];
});

export const listCurrencies = createServerFn({ method: "GET" }).handler(async (): Promise<Currency[]> => {
  await requireUserId();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("currencies")
    .select("*")
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as Currency[];
});

export const listCompanies = createServerFn({ method: "GET" }).handler(async (): Promise<CompanyWithMeta[]> => {
  const userId = await requireUserId();
  const supabase = createSupabaseServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  // Employees must not access company master data (bank, billing, etc.)
  if (profile?.role === "employee") {
    return [];
  }

  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .is("deleted_at", null)
    .order("legal_name");

  if (error) throw new Error(error.message);

  const [{ data: countriesData }, { data: currenciesData }] = await Promise.all([
    supabase.from("countries").select("*").eq("is_active", true),
    supabase.from("currencies").select("*").eq("is_active", true),
  ]);

  const countries = (countriesData ?? []) as Country[];
  const currencies = (currenciesData ?? []) as Currency[];
  const countryMap = new Map(countries.map((c) => [c.code, c]));
  const currencyMap = new Map(currencies.map((c) => [c.code, c]));
  const companies = (data ?? []) as Company[];

  const withCounts = await Promise.all(
    companies.map(async (company) => {
      const [branches, departments] = await Promise.all([
        supabase
          .from("branches")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company.id)
          .is("deleted_at", null),
        supabase
          .from("departments")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company.id)
          .is("deleted_at", null),
      ]);

      return {
        ...company,
        country: countryMap.get(company.country_code) ?? null,
        currency: currencyMap.get(company.currency_code) ?? null,
        branches_count: branches.count ?? 0,
        departments_count: departments.count ?? 0,
      } satisfies CompanyWithMeta;
    }),
  );

  return withCounts;
});

export const getCompany = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<CompanyWithMeta | null> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: company, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!company) return null;

    const [{ data: countriesData }, { data: currenciesData }] = await Promise.all([
      supabase.from("countries").select("*").eq("is_active", true),
      supabase.from("currencies").select("*").eq("is_active", true),
    ]);

    const row = company as Company;
    const countries = (countriesData ?? []) as Country[];
    const currencies = (currenciesData ?? []) as Currency[];

    return {
      ...row,
      country: countries.find((c) => c.code === row.country_code) ?? null,
      currency: currencies.find((c) => c.code === row.currency_code) ?? null,
    };
  });

export const createCompany = createServerFn({ method: "POST" })
  .validator(createCompanySchema)
  .handler(async ({ data }): Promise<ActionResult<Company>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: company, error } = await supabase.rpc("create_company_with_owner", {
      p_legal_name: data.legalName,
      p_trade_name: data.tradeName || null,
      p_sector: data.sector || null,
      p_tax_id: data.taxId || null,
      p_email: data.email || null,
      p_phone: data.phone || null,
      p_address_line1: data.addressLine1 || null,
      p_city: data.city || null,
      p_region: data.region || null,
      p_country_code: data.countryCode,
      p_currency_code: data.currencyCode,
      p_bank_name: data.bankName || null,
      p_bank_account: data.bankAccount || null,
      p_bank_rib: data.bankRib || null,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    let saved = company as Company;
    const registration = data.registrationNumber?.trim();
    if (registration) {
      const { data: updated, error: regError } = await supabase
        .from("companies")
        .update({ registration_number: registration })
        .eq("id", saved.id)
        .select("*")
        .single();
      if (regError) return { ok: false, message: regError.message };
      if (updated) saved = updated as Company;
    }

    return { ok: true, data: saved };
  });

export const updateCompany = createServerFn({ method: "POST" })
  .validator(updateCompanySchema)
  .handler(async ({ data }): Promise<ActionResult<Company>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const payload: Record<string, unknown> = {
      legal_name: data.legalName.trim(),
      trade_name: data.tradeName?.trim() || null,
      sector: data.sector?.trim() || null,
      tax_id: data.taxId?.trim() || null,
      registration_number: data.registrationNumber?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      address_line1: data.addressLine1?.trim() || null,
      city: data.city?.trim() || null,
      region: data.region?.trim() || null,
      country_code: data.countryCode,
      currency_code: data.currencyCode,
      bank_name: data.bankName?.trim() || null,
      bank_account: data.bankAccount?.trim() || null,
      bank_rib: data.bankRib?.trim() || null,
    };

    if (data.payrollPeriodicity !== undefined) payload.payroll_periodicity = data.payrollPeriodicity;
    if (data.workDaysPerWeek !== undefined) payload.work_days_per_week = data.workDaysPerWeek;
    if (data.standardHoursPerDay !== undefined) payload.standard_hours_per_day = data.standardHoursPerDay;
    if (data.overtimeMultiplier !== undefined) payload.overtime_multiplier = data.overtimeMultiplier;
    if (data.isActive !== undefined) payload.is_active = data.isActive;
    if (data.logoUrl !== undefined) payload.logo_url = data.logoUrl || null;

    const { data: company, error } = await supabase
      .from("companies")
      .update(payload)
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, data: company as Company };
  });

export const markSubscriptionPaid = createServerFn({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
      plan: z.enum(["starter", "pro", "enterprise"]).default("pro"),
      paymentMethod: z.enum(["mvola", "poketra"]).default("mvola"),
    }),
  )
  .handler(async ({ data }): Promise<ActionResult<Company>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: company, error } = await supabase.rpc("mark_company_subscription_paid", {
      p_company_id: data.companyId,
      p_plan: data.plan,
      p_payment_method: data.paymentMethod,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: company as Company };
  });

export const prepareCompanyLogoUpload = createServerFn({ method: "POST" })
  .validator(prepareLogoUploadSchema)
  .handler(async ({ data }): Promise<
    ActionResult<{ bucket: string; path: string; token: string; publicUrl: string }>
  > => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const ext =
      data.mimeType === "image/png"
        ? "png"
        : data.mimeType === "image/webp"
          ? "webp"
          : data.mimeType === "image/svg+xml"
            ? "svg"
            : "jpg";
    const safe = sanitizeFileName(data.fileName.replace(/\.[^.]+$/, "")) || "logo";
    const path = `${data.companyId}/${safe}-${Date.now()}.${ext}`;

    const { data: signed, error } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !signed) {
      return { ok: false, message: error?.message ?? "Impossible de préparer l’upload du logo" };
    }

    return {
      ok: true,
      data: {
        bucket: LOGO_BUCKET,
        path: signed.path,
        token: signed.token,
        publicUrl: publicLogoUrl(signed.path),
      },
    };
  });

export const setCompanyLogoUrl = createServerFn({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
      logoUrl: z.string().url(),
    }),
  )
  .handler(async ({ data }): Promise<ActionResult<Company>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: company, error } = await supabase
      .from("companies")
      .update({ logo_url: data.logoUrl })
      .eq("id", data.companyId)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error || !company) return { ok: false, message: error?.message ?? "Mise à jour logo impossible" };
    return { ok: true, data: company as Company };
  });

export const listBranches = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }): Promise<Branch[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("branches")
      .select("*")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .order("is_headquarters", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []) as Branch[];
  });

export const listDepartments = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }): Promise<Department[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    await supabase.rpc("sync_expired_manager_coverages");

    const { data: rows, error } = await supabase
      .from("departments")
      .select("*")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .order("name");
    if (error) throw new Error(error.message);

    const deptIds = (rows ?? []).map((d) => d.id);

    const { data: allCov } = deptIds.length
      ? await supabase
          .from("manager_leave_coverages")
          .select(
            "leave_request_id, department_id, acting_manager_employee_id, start_date, end_date",
          )
          .in("department_id", deptIds)
          .is("deleted_at", null)
      : {
          data: [] as Array<{
            leave_request_id: string;
            department_id: string;
            acting_manager_employee_id: string;
            start_date: string;
            end_date: string;
          }>,
        };

    const leaveIds = [...new Set((allCov ?? []).map((c) => c.leave_request_id))];

    const { data: approvedLeaves } = leaveIds.length
      ? await supabase
          .from("leave_requests")
          .select("id")
          .in("id", leaveIds)
          .eq("status", "approved")
      : { data: [] as Array<{ id: string }> };
    const approvedSet = new Set((approvedLeaves ?? []).map((l) => l.id));

    const today = new Date().toISOString().slice(0, 10);
    const activeByDept = new Map<
      string,
      { acting_manager_employee_id: string; start_date: string; end_date: string }
    >();
    for (const c of allCov ?? []) {
      if (!approvedSet.has(c.leave_request_id)) continue;
      if (c.start_date <= today && c.end_date >= today) {
        activeByDept.set(c.department_id, {
          acting_manager_employee_id: c.acting_manager_employee_id,
          start_date: c.start_date,
          end_date: c.end_date,
        });
      }
    }

    const nameIds = [
      ...new Set(
        [
          ...(rows ?? []).map((d) => d.manager_employee_id),
          ...[...activeByDept.values()].map((c) => c.acting_manager_employee_id),
        ].filter(Boolean) as string[],
      ),
    ];
    const { data: managers } = nameIds.length
      ? await supabase
          .from("employees")
          .select("id, first_name, last_name")
          .in("id", nameIds)
      : { data: [] as Array<{ id: string; first_name: string; last_name: string }> };
    const nameMap = new Map(
      (managers ?? []).map((m) => [m.id, `${m.first_name} ${m.last_name}`]),
    );

    return ((rows ?? []) as Department[]).map((d) => {
      const cov = activeByDept.get(d.id);
      const effectiveId = cov?.acting_manager_employee_id ?? d.manager_employee_id;
      return {
        ...d,
        manager_name: d.manager_employee_id
          ? nameMap.get(d.manager_employee_id) ?? null
          : null,
        effective_manager_employee_id: effectiveId ?? null,
        effective_manager_name: effectiveId ? nameMap.get(effectiveId) ?? null : null,
        acting_manager_employee_id: cov?.acting_manager_employee_id ?? null,
        acting_manager_name: cov?.acting_manager_employee_id
          ? nameMap.get(cov.acting_manager_employee_id) ?? null
          : null,
        coverage_start: cov?.start_date ?? null,
        coverage_end: cov?.end_date ?? null,
      };
    });
  });
