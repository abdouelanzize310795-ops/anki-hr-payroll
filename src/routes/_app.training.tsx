import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  GraduationCap, Plus, BookOpen, Award, Users2, Building2, Trash2, UserPlus,
} from "lucide-react";
import { listCompanies } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import {
  createCourse,
  enrollEmployee,
  listCourses,
  listEnrollments,
  softDeleteCourse,
  trainingStats,
  updateEnrollment,
} from "@/modules/training/training.functions";
import {
  COURSE_STATUS_LABEL,
  ENROLLMENT_STATUS_LABEL,
  TRAINING_CATEGORIES,
  type TrainingCourseWithMeta,
  type TrainingEnrollmentWithMeta,
} from "@/modules/training/types";
import type { CompanyWithMeta } from "@/modules/companies/types";
import type { EmployeeWithRelations } from "@/modules/employees/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/training")({ component: TrainingPage });

const appRouteApi = getRouteApi("/_app");

function TrainingPage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [companyFilter, setCompanyFilter] = useState(profileCompanyId ?? "all");
  const [courses, setCourses] = useState<TrainingCourseWithMeta[]>([]);
  const [enrollments, setEnrollments] = useState<TrainingEnrollmentWithMeta[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof trainingStats>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [courseOpen, setCourseOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("Général");
  const [duration, setDuration] = useState("2");
  const [description, setDescription] = useState("");

  const [enrollCourseId, setEnrollCourseId] = useState("");
  const [enrollEmployeeId, setEnrollEmployeeId] = useState("");

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);
  const createCompanyId = effectiveCompanyId ?? (admin ? companies[0]?.id : undefined);

  const activeCourses = courses.filter((c) => c.status === "active" || c.status === "draft");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, e, s] = await Promise.all([
        listCourses({ data: { companyId: effectiveCompanyId } }),
        listEnrollments({ data: { companyId: effectiveCompanyId } }),
        trainingStats({ data: { companyId: effectiveCompanyId } }),
      ]);
      setCourses(c);
      setEnrollments(e);
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

  const onCreateCourse = async () => {
    if (!createCompanyId) {
      setError("Choisissez une entreprise");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createCourse({
        data: {
          companyId: createCompanyId,
          title,
          category,
          description,
          durationHours: Number(duration) || 2,
          status: "active",
        },
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setCourseOpen(false);
      setTitle("");
      setDescription("");
      setDuration("2");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onEnroll = async () => {
    if (!createCompanyId || !enrollCourseId || !enrollEmployeeId) {
      setError("Cours et employé requis");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await enrollEmployee({
        data: {
          companyId: createCompanyId,
          courseId: enrollCourseId,
          employeeId: enrollEmployeeId,
        },
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEnrollOpen(false);
      setEnrollCourseId("");
      setEnrollEmployeeId("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        badge="Apprentissage"
        title="Formation"
        description="Cours internes, inscriptions et certificats."
        actions={
          <div className="flex flex-wrap gap-2">
            <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!activeCourses.length}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Inscrire
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Inscrire un employé</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid gap-1.5">
                    <Label>Cours</Label>
                    <Select value={enrollCourseId} onValueChange={setEnrollCourseId}>
                      <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent>
                        {activeCourses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Employé</Label>
                    <Select value={enrollEmployeeId} onValueChange={setEnrollEmployeeId}>
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
                  <Button
                    onClick={() => void onEnroll()}
                    disabled={busy || !enrollCourseId || !enrollEmployeeId}
                  >
                    Confirmer
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={courseOpen} onOpenChange={setCourseOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Nouveau cours
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Nouveau cours</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid gap-1.5">
                    <Label>Titre</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Sécurité au travail"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1.5">
                      <Label>Catégorie</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TRAINING_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Durée (h)</Label>
                      <Input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Description</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button
                    onClick={() => void onCreateCourse()}
                    disabled={busy || title.trim().length < 2}
                  >
                    Créer
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
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
          label="Cours actifs"
          value={loading ? "…" : String(stats?.activeCourses ?? 0)}
          icon={BookOpen}
          accent="primary"
        />
        <StatCard
          label="Inscriptions"
          value={loading ? "…" : String(stats?.enrollments ?? 0)}
          icon={Users2}
          accent="gold"
        />
        <StatCard
          label="Certificats"
          value={loading ? "…" : String(stats?.certificates ?? 0)}
          icon={Award}
          accent="success"
        />
        <StatCard
          label="Avancement moyen"
          value={loading ? "…" : `${stats?.avgCompletion ?? 0}%`}
          icon={GraduationCap}
          accent="primary"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : courses.length === 0 ? (
          <div className="md:col-span-2">
            <EmptyPlaceholder
              title="Aucun cours"
              description="Créez un premier cours pour former vos équipes."
              icon={GraduationCap}
            />
          </div>
        ) : (
          courses.map((c) => (
            <SectionCard
              key={c.id}
              title={c.title}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void softDeleteCourse({ data: { id: c.id } }).then(load)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="border-0 bg-primary-soft text-primary">{c.category}</Badge>
                <Badge variant="outline">{c.duration_hours} h</Badge>
                <StatusPill status={COURSE_STATUS_LABEL[c.status]} />
                <span className="text-xs text-muted-foreground">
                  {c.enrolled_count ?? 0} inscrits
                </span>
              </div>
              {c.description && (
                <p className="mb-3 text-sm text-muted-foreground line-clamp-2">{c.description}</p>
              )}
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-muted-foreground">Avancement moyen</span>
                <span className="font-medium">{c.avg_progress ?? 0}%</span>
              </div>
              <Progress value={c.avg_progress ?? 0} className="h-1.5" />
            </SectionCard>
          ))
        )}
      </div>

      <div className="mt-6">
        <SectionCard title="Inscriptions récentes" description="Suivi individuel">
          {enrollments.length === 0 && !loading ? (
            <EmptyPlaceholder
              title="Aucune inscription"
              description="Inscrivez des employés à un cours actif."
              icon={Users2}
            />
          ) : (
            <div className="divide-y divide-border">
              {enrollments.slice(0, 12).map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{e.employee_name}</div>
                    <div className="text-xs text-muted-foreground">{e.course_title}</div>
                  </div>
                  <StatusPill status={ENROLLMENT_STATUS_LABEL[e.status]} />
                  <div className="w-24">
                    <Progress value={e.progress_pct} className="h-1.5" />
                    <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                      {e.progress_pct}%
                    </div>
                  </div>
                  {e.status !== "completed" && e.status !== "cancelled" && (
                    <div className="flex gap-1">
                      {e.status === "enrolled" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void updateEnrollment({
                              data: { id: e.id, status: "in_progress", progressPct: 40 },
                            }).then(load)
                          }
                        >
                          Démarrer
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void updateEnrollment({
                            data: { id: e.id, status: "completed" },
                          }).then(load)
                        }
                      >
                        Terminer
                      </Button>
                    </div>
                  )}
                  {e.certificate_issued && (
                    <Badge className="border-0 bg-success/15 text-success">Certificat</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
