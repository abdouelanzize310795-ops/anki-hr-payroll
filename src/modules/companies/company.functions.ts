import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCompanySchema, updateCompanySchema } from "./schemas";
import type { Branch, Company, CompanyWithMeta, Country, Currency, Department } from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Authentification requise");
  }
  return data.user.id;
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
  await requireUserId();
  const supabase = createSupabaseServerClient();

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

    return { ok: true, data: company as Company };
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
    if (data.isActive !== undefined) payload.is_active = data.isActive;

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
    const { data: rows, error } = await supabase
      .from("departments")
      .select("*")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []) as Department[];
  });
