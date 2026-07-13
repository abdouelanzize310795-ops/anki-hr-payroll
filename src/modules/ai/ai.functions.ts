import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/types";
import { matchHelpGuide } from "./help-guides";

type AiReply = { answer: string; hints: string[] };

const requireActor = createServerOnlyFn(async () => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id, full_name")
    .eq("id", data.user.id)
    .maybeSingle();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, first_name, last_name, department_id, status, job_title")
    .eq("user_id", data.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  return {
    userId: data.user.id,
    role: (profile?.role ?? "employee") as AppRole,
    companyId: profile?.company_id ?? null,
    employeeId: emp?.id ?? null,
    fullName: profile?.full_name ?? null,
    employee: emp,
  };
});

function fmtKmf(n: number) {
  return new Intl.NumberFormat("fr-KM", { maximumFractionDigits: 0 }).format(n);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_HINTS = [
  "Comment créer un ticket ?",
  "Comment pointer ?",
  "Comment demander un congé ?",
  "Effectif actif",
  "Tickets helpdesk ouverts",
];

const EMPLOYEE_HINTS = [
  "Comment créer un ticket ?",
  "Comment pointer ?",
  "Comment demander un congé ?",
  "Mon pointage",
  "Mes congés",
];

export const askAnkibaAi = createServerFn({ method: "POST" })
  .validator(
    z.object({
      question: z.string().trim().min(2).max(500),
      companyId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }): Promise<AiReply> => {
    const actor = await requireActor();
    const supabase = createSupabaseServerClient();
    const q = data.question.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    const companyId =
      actor.role === "platform_admin"
        ? data.companyId
        : (data.companyId ?? actor.companyId ?? undefined);

    const isEmployeeOnly = actor.role === "employee";

    // ——— How-to / aide plateforme (avant les stats) ———
    const guide = matchHelpGuide(q, actor.role);
    if (guide) {
      return { answer: guide.answer, hints: guide.hints };
    }

    // ——— Employee self-service ———
    if (isEmployeeOnly) {
      if (!actor.employeeId) {
        return {
          answer:
            "Votre compte n’est pas lié à une fiche employé. Contactez la RH pour activer votre dossier.",
          hints: EMPLOYEE_HINTS,
        };
      }

      if (/pointage|presence|badge|entree|sortie|aujourd.?hui/.test(q)) {
        const { data: att } = await supabase
          .from("attendance_records")
          .select("status, check_in, check_out, worked_minutes, work_date")
          .eq("employee_id", actor.employeeId)
          .eq("work_date", todayIso())
          .is("deleted_at", null)
          .maybeSingle();

        if (!att) {
          return {
            answer: "Aucun pointage enregistré pour **aujourd’hui**. Pensez à badger votre entrée.",
            hints: ["Mes congés", "Mes tickets", "Mon bulletin"],
          };
        }
        const mins = Number(att.worked_minutes ?? 0);
        const dur = mins > 0 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}` : "—";
        return {
          answer:
            `Aujourd’hui : entrée **${att.check_in?.slice(0, 5) ?? "—"}**, sortie **${att.check_out?.slice(0, 5) ?? "—"}**, ` +
            `durée **${dur}**, statut **${att.status}**.`,
          hints: ["Mes congés", "Mes tickets"],
        };
      }

      if (/conge|absence|solde/.test(q)) {
        const year = new Date().getFullYear();
        const [{ data: leaves }, { data: balances }] = await Promise.all([
          supabase
            .from("leave_requests")
            .select("status, start_date, end_date, days_count")
            .eq("employee_id", actor.employeeId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("leave_balances")
            .select("entitled_days, used_days, pending_days, carried_over_days, leave_type_id")
            .eq("employee_id", actor.employeeId)
            .eq("year", year),
        ]);

        const pending = (leaves ?? []).filter((l) =>
          ["pending", "pending_manager", "pending_hr"].includes(l.status),
        ).length;
        const bal =
          (balances ?? []).length > 0
            ? (balances ?? [])
                .map((b) => {
                  const remaining =
                    Number(b.entitled_days ?? 0) +
                    Number(b.carried_over_days ?? 0) -
                    Number(b.used_days ?? 0) -
                    Number(b.pending_days ?? 0);
                  return `${remaining} j restants`;
                })
                .join(", ")
            : "solde non initialisé";

        return {
          answer:
            `Vos congés ${year} : **${bal}**. ` +
            `Demandes en cours : **${pending}**. ` +
            ((leaves ?? []).length
              ? `Dernières : ${(leaves ?? [])
                  .slice(0, 3)
                  .map((l) => `${l.start_date}→${l.end_date} (${l.status})`)
                  .join(" ; ")}.`
              : ""),
          hints: ["Mon pointage", "Mes tickets"],
        };
      }

      if (/ticket|helpdesk|incident|demande/.test(q)) {
        const { data: tickets } = await supabase
          .from("helpdesk_tickets")
          .select("ticket_number, title, status, priority")
          .or(
            `requester_employee_id.eq.${actor.employeeId},requester_user_id.eq.${actor.userId},created_by.eq.${actor.userId}`,
          )
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(5);

        if (!tickets?.length) {
          return {
            answer: "Vous n’avez aucun ticket helpdesk. Créez-en un depuis **Helpdesk**.",
            hints: ["Mon pointage", "Mes congés"],
          };
        }
        return {
          answer:
            `Vos tickets : **${tickets.length}** récents — ` +
            tickets
              .map((t) => `${t.ticket_number} « ${t.title} » (${t.status})`)
              .join(" ; ") +
            ".",
          hints: ["Mon pointage", "Mes congés"],
        };
      }

      if (/paie|bulletin|salaire/.test(q)) {
        const { data: slips } = await supabase
          .from("payslips")
          .select("id, net_amount, currency_code, payroll_run_id, created_at")
          .eq("employee_id", actor.employeeId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1);

        const slip = slips?.[0];
        if (!slip) {
          return {
            answer: "Aucun bulletin trouvé pour vous pour le moment.",
            hints: ["Mon pointage", "Mes congés"],
          };
        }
        return {
          answer: `Votre dernier bulletin : net **${fmtKmf(Number(slip.net_amount))}** ${slip.currency_code ?? "KMF"}. Consultez **Paie** pour le détail.`,
          hints: ["Mes congés", "Mon pointage"],
        };
      }

      return {
        answer:
          `Bonjour — je peux vous guider (**Comment créer un ticket ?**, **Comment pointer ?**) ` +
          `ou consulter vos données : **mon pointage**, **mes congés**, **mes tickets**, **mon bulletin**. ` +
          `Demandez aussi « Quelles questions puis-je poser ? ».`,
        hints: EMPLOYEE_HINTS,
      };
    }

    // ——— Manager / RH / employeur ———
    let empQ = supabase
      .from("employees")
      .select("id, first_name, last_name, status, base_salary, job_title, department_id")
      .is("deleted_at", null);
    if (companyId) empQ = empQ.eq("company_id", companyId);
    const { data: employees } = await empQ;
    const emps = employees ?? [];
    const active = emps.filter((e) => e.status === "active" || e.status === "on_leave");
    const onLeave = emps.filter((e) => e.status === "on_leave");

    if (/effectif|headcount|combien.*employ|nombre.*employ|combien.*collabor/.test(q)) {
      return {
        answer:
          `Effectif : **${active.length}** actif(s) (dont **${onLeave.length}** en congé), ` +
          `**${emps.length}** au total dans le périmètre.`,
        hints: ["Qui est en congé ?", "Présence du jour", "Résumé de la paie"],
      };
    }

    if (/pointage|presence|present|absent.*jour|aujourd.?hui/.test(q) && !/conge/.test(q)) {
      let attQ = supabase
        .from("attendance_records")
        .select("status, employee_id, check_in, check_out")
        .eq("work_date", todayIso())
        .is("deleted_at", null);
      if (companyId) attQ = attQ.eq("company_id", companyId);
      const { data: rows } = await attQ;
      const list = rows ?? [];
      const present = list.filter((r) =>
        ["present", "late", "remote", "half_day"].includes(r.status),
      ).length;
      const late = list.filter((r) => r.status === "late").length;
      const absent = list.filter((r) => r.status === "absent").length;
      return {
        answer:
          `Présence du **${todayIso()}** : **${present}** présent(s), **${late}** retard(s), **${absent}** absent(s) ` +
          `(${list.length} pointage(s) enregistré(s)).`,
        hints: ["Effectif actif", "Qui est en congé ?", "Tickets helpdesk ouverts"],
      };
    }

    if (/conge|leave|absent/.test(q)) {
      let leaveQ = supabase
        .from("leave_requests")
        .select("id, status, start_date, end_date, days_count, employee_id")
        .is("deleted_at", null)
        .in("status", ["pending", "pending_manager", "pending_hr", "approved"]);
      if (companyId) leaveQ = leaveQ.eq("company_id", companyId);
      const { data: leaves } = await leaveQ;
      const all = leaves ?? [];
      const pendingMgr = all.filter((l) => l.status === "pending_manager" || l.status === "pending").length;
      const pendingHr = all.filter((l) => l.status === "pending_hr").length;
      const approved = all.filter((l) => l.status === "approved");
      const today = todayIso();
      const outNow = approved.filter((l) => l.start_date <= today && l.end_date >= today);

      const empMap = new Map(emps.map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
      const names = outNow
        .slice(0, 6)
        .map((l) => empMap.get(l.employee_id) ?? "—")
        .join(", ");

      return {
        answer:
          `Congés : **${pendingMgr}** en attente manager, **${pendingHr}** en attente RH, ` +
          `**${approved.length}** approuvé(s). ` +
          (outNow.length
            ? `En congé aujourd’hui (**${outNow.length}**) : ${names}${outNow.length > 6 ? "…" : ""}.`
            : "Personne en congé aujourd’hui selon les demandes approuvées."),
        hints: ["Effectif actif", "Présence du jour", "Tickets helpdesk ouverts"],
      };
    }

    if (/paie|payroll|salaire|bulletin|masse/.test(q)) {
      let runQ = supabase
        .from("payroll_runs")
        .select("id, label, status, total_net, total_gross, period_month, period_year")
        .is("deleted_at", null)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(3);
      if (companyId) runQ = runQ.eq("company_id", companyId);
      const { data: runs } = await runQ;
      const latest = runs?.[0];
      if (!latest) {
        return {
          answer: "Aucun cycle de paie trouvé. Créez-en un depuis le module **Paie**.",
          hints: ["Effectif actif", "Qui est en congé ?"],
        };
      }
      const mass = active.reduce((s, e) => s + Number(e.base_salary || 0), 0);
      return {
        answer:
          `Dernier cycle : **${latest.label}** (${latest.status}). ` +
          `Brut **${fmtKmf(Number(latest.total_gross))}** KMF · Net **${fmtKmf(Number(latest.total_net))}** KMF. ` +
          `Masse salariale de base (actifs) : **${fmtKmf(mass)}** KMF.`,
        hints: ["Effectif actif", "État des contrats", "Tickets helpdesk ouverts"],
      };
    }

    if (/contrat|embauch/.test(q)) {
      let cq = supabase
        .from("contracts")
        .select("id, status, job_title")
        .is("deleted_at", null);
      if (companyId) cq = cq.eq("company_id", companyId);
      const { data: contracts } = await cq;
      const byStatus = new Map<string, number>();
      for (const c of contracts ?? []) {
        byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
      }
      const labels: Record<string, string> = {
        draft: "brouillon",
        sent: "envoyé",
        signed: "signé",
        active: "actif",
        expired: "expiré",
        cancelled: "annulé",
      };
      return {
        answer:
          `Contrats : **${(contracts ?? []).length}** au total — ` +
          ([...byStatus.entries()]
            .map(([s, n]) => `${labels[s] ?? s}: ${n}`)
            .join(", ") || "aucun") +
          ".",
        hints: ["Effectif actif", "Résumé de la paie"],
      };
    }

    // How-to about tickets should not fall into live ticket stats
    if (/ticket|helpdesk|incident|support/.test(q) && !/comment|aide|creer|ouvrir|valider|approuver/.test(q)) {
      let tq = supabase
        .from("helpdesk_tickets")
        .select("id, ticket_number, title, status, priority, handler_employee_id, assignee_department_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(40);
      if (companyId) tq = tq.eq("company_id", companyId);
      const { data: tickets } = await tq;
      const all = tickets ?? [];
      const open = all.filter((t) => ["open", "in_progress", "pending_manager"].includes(t.status));
      const inProgress = all.filter((t) => t.status === "in_progress");
      const pending = all.filter((t) => t.status === "pending_manager");

      const handlerIds = [
        ...new Set(inProgress.map((t) => t.handler_employee_id).filter(Boolean) as string[]),
      ];
      const { data: handlers } = handlerIds.length
        ? await supabase.from("employees").select("id, first_name, last_name").in("id", handlerIds)
        : { data: [] as Array<{ id: string; first_name: string; last_name: string }> };
      const hMap = new Map(
        (handlers ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
      );

      const taken = inProgress
        .slice(0, 5)
        .map(
          (t) =>
            `${t.ticket_number} → ${t.handler_employee_id ? hMap.get(t.handler_employee_id) ?? "?" : "non assigné"}`,
        )
        .join(" ; ");

      return {
        answer:
          `Helpdesk : **${pending.length}** en attente manager, **${open.length}** ouverts/en cours, ` +
          `dont **${inProgress.length}** pris en charge` +
          (taken ? ` — ${taken}` : "") +
          ".",
        hints: ["Qui a pris un ticket ?", "Effectif actif", "Présence du jour"],
      };
    }

    if (/qui.*(pris|charge|traite)|handler|prise en charge/.test(q)) {
      let tq = supabase
        .from("helpdesk_tickets")
        .select("ticket_number, title, handler_employee_id, handled_at, status")
        .eq("status", "in_progress")
        .is("deleted_at", null)
        .not("handler_employee_id", "is", null)
        .order("handled_at", { ascending: false })
        .limit(10);
      if (companyId) tq = tq.eq("company_id", companyId);
      const { data: tickets } = await tq;
      if (!tickets?.length) {
        return {
          answer: "Aucun ticket actuellement pris en charge.",
          hints: ["Tickets helpdesk ouverts", "Effectif actif"],
        };
      }
      const ids = [...new Set(tickets.map((t) => t.handler_employee_id!).filter(Boolean))];
      const { data: handlers } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .in("id", ids);
      const hMap = new Map(
        (handlers ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
      );
      return {
        answer:
          `En cours de traitement : ` +
          tickets
            .map(
              (t) =>
                `**${hMap.get(t.handler_employee_id!) ?? "?"}** sur ${t.ticket_number} « ${t.title} »`,
            )
            .join(" ; ") +
          ".",
        hints: ["Tickets helpdesk ouverts", "Présence du jour"],
      };
    }

    const top = active
      .slice(0, 5)
      .map((e) => `${e.first_name} ${e.last_name}${e.job_title ? ` (${e.job_title})` : ""}`)
      .join(", ");

    return {
      answer:
        `Je réponds sur vos **données** (effectif, congés, présence, paie, contrats, helpdesk) ` +
        `et je guide les gestes de la plateforme (**Comment créer un ticket ?**, **Comment pointer ?**, **Comment calculer la paie ?**…). ` +
        `Aperçu : **${active.length}** actifs` +
        (top ? ` — ex. ${top}` : "") +
        `. Demandez « Quelles questions puis-je poser ? » pour la liste.`,
      hints: DEFAULT_HINTS,
    };
  });
