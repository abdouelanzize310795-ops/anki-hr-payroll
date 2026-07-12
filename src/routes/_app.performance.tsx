import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TrendingUp, Star, Target, Award, Building2, Plus, Trash2 } from "lucide-react";
import { listCompanies } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import {
  createReview,
  listReviews,
  performanceStats,
  softDeleteReview,
} from "@/modules/performance/performance.functions";
import {
  REVIEW_STATUS_LABEL,
  type PerformanceReviewWithMeta,
} from "@/modules/performance/types";
import type { CompanyWithMeta } from "@/modules/companies/types";
import type { EmployeeWithRelations } from "@/modules/employees/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/performance")({ component: PerformancePage });

const appRouteApi = getRouteApi("/_app");

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function PerformancePage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [companyFilter, setCompanyFilter] = useState(profileCompanyId ?? "all");
  const [reviews, setReviews] = useState<PerformanceReviewWithMeta[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof performanceStats>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [employeeId, setEmployeeId] = useState("");
  const [period, setPeriod] = useState("T3 2026");
  const [score, setScore] = useState("4");
  const [goals, setGoals] = useState("80");
  const [notes, setNotes] = useState("");
  const [reviewer, setReviewer] = useState("");

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);
  const createCompanyId = effectiveCompanyId ?? (admin ? companies[0]?.id : undefined);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, s] = await Promise.all([
        listReviews({ data: { companyId: effectiveCompanyId } }),
        performanceStats({ data: { companyId: effectiveCompanyId } }),
      ]);
      setReviews(r);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
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
  }, [companyFilter, lockedCompanyId]);

  useEffect(() => {
    if (!effectiveCompanyId) {
      setEmployees([]);
      return;
    }
    void (async () => {
      setEmployees(
        await listEmployees({ data: { companyId: effectiveCompanyId, status: "active" } }),
      );
    })();
  }, [effectiveCompanyId]);

  const onCreate = async () => {
    if (!createCompanyId || !employeeId) {
      setError("Employé et entreprise requis");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createReview({
        data: {
          companyId: createCompanyId,
          employeeId,
          periodLabel: period,
          score: Number(score),
          goalsPct: Number(goals),
          notes,
          reviewerName: reviewer || auth.profile?.full_name || "",
          status: "finalized",
        },
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setOpen(false);
      setEmployeeId("");
      setNotes("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        badge="Croissance"
        title="Performance"
        description="Évaluations, objectifs et feedback continu."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Nouvelle évaluation
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Évaluation collaborateur</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid gap-1.5">
                  <Label>Employé</Label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.first_name} {e.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Période</Label>
                  <Input value={period} onChange={(e) => setPeriod(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <Label>Note / 5</Label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      step={0.1}
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Objectifs %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={goals}
                      onChange={(e) => setGoals(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Évaluateur</Label>
                  <Input
                    value={reviewer}
                    onChange={(e) => setReviewer(e.target.value)}
                    placeholder="Nom du manager"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Commentaire</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                </div>
                <Button onClick={() => void onCreate()} disabled={busy || !employeeId}>
                  Enregistrer
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {admin && (
        <div className="mb-4">
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les entreprises</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Note moyenne"
          value={loading ? "…" : `${stats?.avgScore ?? 0} / 5`}
          icon={Star}
          accent="gold"
        />
        <StatCard
          label="Objectifs atteints"
          value={loading ? "…" : `${stats?.avgGoals ?? 0}%`}
          icon={Target}
          accent="success"
        />
        <StatCard
          label="Évaluations"
          value={
            loading
              ? "…"
              : `${stats?.reviewsDone ?? 0} / ${stats?.headcount ?? 0}`
          }
          icon={Award}
          accent="primary"
        />
        <StatCard
          label="Top performers"
          value={loading ? "…" : String(stats?.topCount ?? 0)}
          icon={TrendingUp}
          accent="primary"
          deltaLabel="≥ 4,5"
        />
      </div>

      <div className="mt-6">
        <SectionCard title="Classement" description="Évaluations par note décroissante">
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : reviews.length === 0 ? (
            <EmptyPlaceholder
              title="Aucune évaluation"
              description="Ajoutez une évaluation pour suivre la performance de l’équipe."
              icon={Star}
            />
          ) : (
            <div className="space-y-4">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary-soft text-xs text-primary">
                      {initials(r.employee_name ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.employee_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.job_title || r.period_label}
                      </span>
                      <StatusPill status={REVIEW_STATUS_LABEL[r.status]} />
                    </div>
                    <div className="mt-1.5">
                      <Progress value={r.goals_pct} className="h-1.5" />
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        Objectifs {r.goals_pct}%
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg bg-gold/15 px-2.5 py-1 text-sm font-semibold text-gold-foreground">
                      <Star className="h-3.5 w-3.5 fill-current" /> {r.score}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void softDeleteReview({ data: { id: r.id } }).then(load)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
