import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays, Plus, Umbrella, Stethoscope, Baby, Search, Building2, Check, X, Ban,
} from "lucide-react";
import { listCompanies } from "@/modules/companies/company.functions";
import {
  createLeaveRequest,
  leaveStats,
  listLeaveBalances,
  listLeaveRequests,
  transitionLeaveRequest,
} from "@/modules/leave/leave.functions";
import { LeaveRequestForm } from "@/modules/leave/components/LeaveRequestForm";
import {
  leaveStatusToPill,
  type LeaveBalanceWithType,
  type LeaveRequestStatus,
  type LeaveRequestWithRelations,
} from "@/modules/leave/types";
import type { CreateLeaveRequestInput } from "@/modules/leave/schemas";
import type { CompanyWithMeta } from "@/modules/companies/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/leave")({ component: LeavePage });

const appRouteApi = getRouteApi("/_app");

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function LeavePage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);
  const canManage =
    admin || auth.profile?.role === "employer" || auth.profile?.role === "hr";

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>(profileCompanyId ?? "all");
  const [requests, setRequests] = useState<LeaveRequestWithRelations[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceWithType[]>([]);
  const [stats, setStats] = useState({ onLeaveToday: 0, sick: 0, parental: 0, pending: 0 });
  const [statusFilter, setStatusFilter] = useState<"all" | LeaveRequestStatus>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, s] = await Promise.all([
        listLeaveRequests({
          data: {
            companyId: effectiveCompanyId,
            status: statusFilter,
            search: search.trim() || undefined,
          },
        }),
        leaveStats({ data: { companyId: effectiveCompanyId } }),
      ]);
      setRequests(rows);
      setStats(s);

      if (effectiveCompanyId) {
        const bal = await listLeaveBalances({ data: { companyId: effectiveCompanyId } });
        setBalances(bal);
      } else {
        setBalances([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les congés");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      if (admin) setCompanies(await listCompanies());
    })();
  }, [admin]);

  useEffect(() => {
    void load();
  }, [companyFilter, statusFilter, lockedCompanyId]);

  const handleCreate = async (values: CreateLeaveRequestInput) => {
    const result = await createLeaveRequest({ data: values });
    if (!result.ok) throw new Error(result.message);
    setOpen(false);
    await load();
  };

  const handleTransition = async (
    id: string,
    action: "approve" | "reject" | "cancel",
  ) => {
    setActingId(id);
    try {
      const result = await transitionLeaveRequest({ data: { id, action } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await load();
    } finally {
      setActingId(null);
    }
  };

  return (
    <>
      <PageHeader
        badge="Temps"
        title="Congés"
        description="Demandes, soldes et validation — jours ouvrés (lun–ven)."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Nouvelle demande
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display">Demande de congé</DialogTitle>
              </DialogHeader>
              <LeaveRequestForm
                lockedCompanyId={lockedCompanyId ?? (effectiveCompanyId ?? null)}
                onSubmit={handleCreate}
              />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="En congé aujourd'hui" value={String(stats.onLeaveToday)} icon={Umbrella} accent="gold" />
        <StatCard label="Maladie" value={String(stats.sick)} icon={Stethoscope} accent="destructive" />
        <StatCard label="Parental" value={String(stats.parental)} icon={Baby} accent="primary" />
        <StatCard label="En attente" value={String(stats.pending)} icon={CalendarDays} accent="primary" />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        {admin && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Entreprise" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les entreprises</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | LeaveRequestStatus)}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="approved">Approuvé</SelectItem>
            <SelectItem value="rejected">Refusé</SelectItem>
            <SelectItem value="cancelled">Annulé</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Filtrer
        </Button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Demandes" description="Workflow : soumission → validation RH.">
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : requests.length === 0 ? (
              <EmptyPlaceholder
                title="Aucune demande"
                description="Créez une première demande de congé pour un collaborateur."
                icon={CalendarDays}
              />
            ) : (
              <div className="divide-y divide-border">
                {requests.map((r) => (
                  <div key={r.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary-soft text-xs text-primary">
                        {initials(r.employee_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {r.employee_name ?? "—"}
                        <span className="font-normal text-muted-foreground">
                          {" "}• {r.leave_type_name}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.start_date} → {r.end_date} ({r.days_count} j)
                        {r.company_name && admin ? ` · ${r.company_name}` : ""}
                      </div>
                      {r.reason && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.reason}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={leaveStatusToPill(r.status)} />
                      {canManage && r.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === r.id}
                            onClick={() => void handleTransition(r.id, "approve")}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" />
                            Approuver
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={actingId === r.id}
                            onClick={() => void handleTransition(r.id, "reject")}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Refuser
                          </Button>
                        </>
                      )}
                      {(r.status === "pending" || r.status === "draft" || (canManage && r.status === "approved")) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={actingId === r.id}
                          onClick={() => void handleTransition(r.id, "cancel")}
                        >
                          <Ban className="mr-1 h-3.5 w-3.5" />
                          Annuler
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard
          title="Soldes"
          description={
            effectiveCompanyId
              ? "Premier collaborateur actif · année en cours"
              : "Sélectionnez une entreprise"
          }
        >
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {effectiveCompanyId
                ? "Aucun solde — ajoutez un employé actif."
                : "Filtrez sur une entreprise pour voir les soldes."}
            </p>
          ) : (
            balances.map((b) => {
              const total = Number(b.entitled_days) + Number(b.carried_over_days);
              const used = Number(b.used_days);
              const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
              return (
                <div key={b.id} className="mb-4 last:mb-0">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="font-medium">{b.leave_type_name}</span>
                    <span className="font-mono text-muted-foreground">
                      {used} / {total} j
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    Dispo {b.available_days ?? 0} j · en attente {b.pending_days} j
                  </p>
                </div>
              );
            })
          )}
        </SectionCard>
      </div>
    </>
  );
}
