import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SubscriptionPayment = {
  id: string;
  company_id: string;
  company_name?: string;
  reference: string | null;
  plan: string | null;
  payment_method: string | null;
  seats: number | null;
  expected_amount: number | null;
  received_amount: number | null;
  period_start: string | null;
  period_end: string | null;
  status: "pending" | "confirmed" | "rejected" | "cancelled";
  receipt_number: string | null;
  note: string | null;
  created_at: string;
  confirmed_at: string | null;
};

/** Access is enforced by the table's RLS: a company sees its own rows, the platform admin all. */
export const listSubscriptionPayments = createServerFn({ method: "POST" })
  .validator(z.object({ companyId: z.string().uuid().optional() }))
  .handler(async ({ data }): Promise<SubscriptionPayment[]> => {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("subscription_payments").select("*");
    if (data.companyId) query = query.eq("company_id", data.companyId);
    const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    const payments = (rows ?? []) as SubscriptionPayment[];
    const ids = [...new Set(payments.map((p) => p.company_id))];
    if (ids.length === 0) return payments;
    const { data: companies } = await supabase.from("companies").select("id, legal_name").in("id", ids);
    const names = new Map(((companies ?? []) as { id: string; legal_name: string }[]).map((c) => [c.id, c.legal_name]));
    return payments.map((p) => ({ ...p, company_name: names.get(p.company_id) }));
  });

export type PaymentReceipt = {
  payment: SubscriptionPayment;
  company: { legal_name: string; address_line1: string | null; city: string | null; tax_id: string | null } | null;
};

export const getPaymentReceipt = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<PaymentReceipt | null> => {
    const supabase = createSupabaseServerClient();
    const { data: row } = await supabase
      .from("subscription_payments")
      .select("*")
      .eq("id", data.id)
      .eq("status", "confirmed")
      .maybeSingle();
    if (!row) return null;
    const payment = row as SubscriptionPayment;
    const { data: company } = await supabase
      .from("companies")
      .select("legal_name, address_line1, city, tax_id")
      .eq("id", payment.company_id)
      .maybeSingle();
    return { payment, company: (company as PaymentReceipt["company"]) ?? null };
  });
