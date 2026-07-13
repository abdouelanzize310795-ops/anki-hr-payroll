import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  UserPlus, Plus, Briefcase, Users2, Target, Trophy, Building2, Trash2,
} from "lucide-react";
import { listCompanies } from "@/modules/companies/company.functions";
import {
  createCandidate,
  createJobOpening,
  hireCandidateAsEmployee,
  listCandidates,
  listJobOpenings,
  moveCandidateStage,
  recruitmentStats,
  softDeleteCandidate,
  softDeleteJobOpening,
  updateJobOpening,
} from "@/modules/recruitment/recruitment.functions";
import {
  CANDIDATE_STAGE_LABEL,
  CANDIDATE_STAGES,
  EMPLOYMENT_TYPES,
  JOB_STATUS_LABEL,
  type CandidateStage,
  type CandidateWithMeta,
  type JobOpeningStatus,
  type JobOpeningWithMeta,
} from "@/modules/recruitment/types";
import type { CompanyWithMeta } from "@/modules/companies/types";
import { listDepartments } from "@/modules/companies/company.functions";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/recruitment")({ component: RecruitmentPage });

const appRouteApi = getRouteApi("/_app");

const stageStyle: Record<CandidateStage, string> = {
  sourced: "bg-muted text-muted-foreground",
  screened: "bg-primary-soft text-primary",
  interview: "bg-gold/20 text-gold-foreground",
  offer: "bg-success/15 text-success",
  hired: "bg-primary text-primary-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function daysOpen(iso: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
}

function RecruitmentPage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [companyFilter, setCompanyFilter] = useState(profileCompanyId ?? "all");
  const [jobs, setJobs] = useState<JobOpeningWithMeta[]>([]);
  const [candidates, setCandidates] = useState<CandidateWithMeta[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof recruitmentStats>> | null>(null);
  const [depts, setDepts] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jobOpen, setJobOpen] = useState(false);
  const [candOpen, setCandOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [jobTitle, setJobTitle] = useState("");
  const [jobLoc, setJobLoc] = useState("");
  const [jobType, setJobType] = useState<string>("CDI");
  const [jobDept, setJobDept] = useState("");
  const [jobDesc, setJobDesc] = useState("");

  const [candFirst, setCandFirst] = useState("");
  const [candLast, setCandLast] = useState("");
  const [candEmail, setCandEmail] = useState("");
  const [candPhone, setCandPhone] = useState("");
  const [candJobId, setCandJobId] = useState("");
  const [candSource, setCandSource] = useState("");

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);

  const openJobs = useMemo(
    () => jobs.filter((j) => j.status === "open" || j.status === "draft" || j.status === "on_hold"),
    [jobs],
  );

  const pipeline = useMemo(() => {
    const map: Record<CandidateStage, CandidateWithMeta[]> = {
      sourced: [],
      screened: [],
      interview: [],
      offer: [],
      hired: [],
      rejected: [],
    };
    for (const c of candidates) {
      if (c.stage === "rejected") continue;
      map[c.stage].push(c);
    }
    return map;
  }, [candidates]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [j, c, s] = await Promise.all([
        listJobOpenings({ data: { companyId: effectiveCompanyId } }),
        listCandidates({ data: { companyId: effectiveCompanyId } }),
        recruitmentStats({ data: { companyId: effectiveCompanyId } }),
      ]);
      setJobs(j);
      setCandidates(c);
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
      setDepts([]);
      return;
    }
    void (async () => {
      setDepts(await listDepartments({ data: { companyId: effectiveCompanyId } }));
    })();
  }, [effectiveCompanyId]);

  const createCompanyId = effectiveCompanyId ?? (admin ? companies[0]?.id : undefined);

  const onCreateJob = async () => {
    if (!createCompanyId) {
      setError("Choisissez une entreprise");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createJobOpening({
        data: {
          companyId: createCompanyId,
          title: jobTitle,
          location: jobLoc,
          employmentType: jobType,
          departmentId: jobDept || null,
          description: jobDesc,
          status: "open",
        },
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setJobOpen(false);
      setJobTitle("");
      setJobLoc("");
      setJobDesc("");
      setJobDept("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onCreateCand = async () => {
    if (!createCompanyId || !candJobId) {
      setError("Offre et entreprise requises");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createCandidate({
        data: {
          companyId: createCompanyId,
          jobOpeningId: candJobId,
          firstName: candFirst,
          lastName: candLast,
          email: candEmail,
          phone: candPhone,
          source: candSource,
        },
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setCandOpen(false);
      setCandFirst("");
      setCandLast("");
      setCandEmail("");
      setCandPhone("");
      setCandSource("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onMove = async (id: string, stage: CandidateStage) => {
    if (stage === "hired") {
      const res = await hireCandidateAsEmployee({ data: { candidateId: id } });
      if (!res.ok) setError(res.message);
      else await load();
      return;
    }
    const res = await moveCandidateStage({ data: { id, stage } });
    if (!res.ok) setError(res.message);
    else await load();
  };

  const onCloseJob = async (id: string, status: JobOpeningStatus) => {
    const res = await updateJobOpening({ data: { id, status } });
    if (!res.ok) setError(res.message);
    else await load();
  };

  return (
    <>
      <PageHeader
        badge="Talents"
        title="Recrutement"
        description="Pipeline candidatures — du sourcing à l’embauche."
        actions={
          <div className="flex flex-wrap gap-2">
            <Dialog open={candOpen} onOpenChange={setCandOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!openJobs.length && !createCompanyId}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Candidat
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Nouveau candidat</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid gap-1.5">
                    <Label>Offre</Label>
                    <Select value={candJobId} onValueChange={setCandJobId}>
                      <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent>
                        {openJobs.map((j) => (
                          <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1.5">
                      <Label>Prénom</Label>
                      <Input value={candFirst} onChange={(e) => setCandFirst(e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Nom</Label>
                      <Input value={candLast} onChange={(e) => setCandLast(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={candEmail} onChange={(e) => setCandEmail(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Téléphone</Label>
                    <Input value={candPhone} onChange={(e) => setCandPhone(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Source</Label>
                    <Input
                      value={candSource}
                      onChange={(e) => setCandSource(e.target.value)}
                      placeholder="Spontané, LinkedIn…"
                    />
                  </div>
                  <Button onClick={() => void onCreateCand()} disabled={busy || !candFirst || !candLast || !candJobId}>
                    Ajouter
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={jobOpen} onOpenChange={setJobOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Nouvelle offre
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Nouvelle offre d’emploi</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid gap-1.5">
                    <Label>Intitulé</Label>
                    <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Commercial terrain" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1.5">
                      <Label>Lieu</Label>
                      <Input value={jobLoc} onChange={(e) => setJobLoc(e.target.value)} placeholder="Moroni" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Type</Label>
                      <Select value={jobType} onValueChange={setJobType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EMPLOYMENT_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {depts.length > 0 && (
                    <div className="grid gap-1.5">
                      <Label>Département</Label>
                      <Select value={jobDept || "none"} onValueChange={(v) => setJobDept(v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Optionnel" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {depts.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid gap-1.5">
                    <Label>Description</Label>
                    <Textarea value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} rows={3} />
                  </div>
                  <Button onClick={() => void onCreateJob()} disabled={busy || jobTitle.trim().length < 2}>
                    Publier
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
        <StatCard label="Postes ouverts" value={loading ? "…" : String(stats?.openRoles ?? 0)} icon={Briefcase} accent="primary" />
        <StatCard label="Candidats actifs" value={loading ? "…" : String(stats?.candidates ?? 0)} icon={Users2} accent="gold" />
        <StatCard
          label="Délai moyen embauche"
          value={loading ? "…" : stats?.avgHireDays ? `${stats.avgHireDays} j` : "—"}
          icon={Target}
          accent="success"
        />
        <StatCard
          label="Taux offre"
          value={loading ? "…" : `${stats?.offerRate ?? 0}%`}
          icon={Trophy}
          accent="primary"
        />
      </div>

      <div className="mt-6">
        <SectionCard title="Pipeline" description="Avancez les candidats d’étape en étape">
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : candidates.filter((c) => c.stage !== "rejected").length === 0 ? (
            <EmptyPlaceholder
              title="Pipeline vide"
              description="Ajoutez un candidat sur une offre ouverte pour démarrer le suivi."
              icon={Users2}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {CANDIDATE_STAGES.map((stage) => (
                <div key={stage} className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {CANDIDATE_STAGE_LABEL[stage]}
                    </div>
                    <Badge className={stageStyle[stage]}>{pipeline[stage].length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {pipeline[stage].map((c) => {
                      const idx = CANDIDATE_STAGES.indexOf(stage);
                      const next = idx >= 0 && idx < CANDIDATE_STAGES.length - 1
                        ? CANDIDATE_STAGES[idx + 1]
                        : null;
                      return (
                        <div key={c.id} className="rounded-lg border border-border bg-card p-2.5">
                          <div className="flex items-start gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="bg-primary-soft text-[10px] text-primary">
                                {initials(c.first_name, c.last_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium">
                                {c.first_name} {c.last_name}
                              </div>
                              <div className="truncate text-[10px] text-muted-foreground">
                                {c.job_title ?? "—"}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => void softDeleteCandidate({ data: { id: c.id } }).then(load)}
                              aria-label="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {next && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-1.5 h-7 w-full text-[11px]"
                              onClick={() => void onMove(c.id, next)}
                            >
                              → {CANDIDATE_STAGE_LABEL[next]}
                            </Button>
                          )}
                          {stage !== "hired" && (
                            <button
                              type="button"
                              className="mt-0.5 w-full text-[10px] text-muted-foreground hover:text-destructive"
                              onClick={() => void onMove(c.id, "rejected")}
                            >
                              Refuser
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Offres d’emploi">
          {openJobs.length === 0 && jobs.length === 0 && !loading ? (
            <EmptyPlaceholder
              title="Aucune offre"
              description="Créez une offre pour commencer à recevoir des candidatures."
              icon={Briefcase}
            />
          ) : (
            <div className="divide-y divide-border">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{j.title}</span>
                      <StatusPill status={JOB_STATUS_LABEL[j.status]} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[j.location, j.employment_type, j.department_name].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="text-sm font-semibold">{j.candidate_count ?? 0} candidats</div>
                    <div className="text-xs text-muted-foreground">
                      Ouvert {daysOpen(j.published_at ?? j.created_at)} j
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {j.status === "open" && (
                      <Button variant="outline" size="sm" onClick={() => void onCloseJob(j.id, "closed")}>
                        Fermer
                      </Button>
                    )}
                    {j.status === "closed" && (
                      <Button variant="outline" size="sm" onClick={() => void onCloseJob(j.id, "open")}>
                        Rouvrir
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void softDeleteJobOpening({ data: { id: j.id } }).then(load)}
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
