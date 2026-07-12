import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, EmptyPlaceholder } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
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
import { Plus, Flag, Building2, Trash2 } from "lucide-react";
import { listCompanies } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import {
  createTask, listTasks, moveTaskStatus, softDeleteTask,
} from "@/modules/tasks/task.functions";
import {
  TASK_COLUMNS,
  taskPriorityLabel,
  taskStatusLabel,
  type HrTask,
  type TaskPriority,
  type TaskStatus,
} from "@/modules/tasks/types";
import type { CompanyWithMeta } from "@/modules/companies/types";
import type { EmployeeWithRelations } from "@/modules/employees/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/tasks")({ component: TasksPage });

const appRouteApi = getRouteApi("/_app");

const columnStyle: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-primary-soft text-primary",
  review: "bg-gold/20 text-gold-foreground",
  done: "bg-success/15 text-success",
};

function TasksPage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>(profileCompanyId ?? "all");
  const [tasks, setTasks] = useState<HrTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await listTasks({ data: { companyId: effectiveCompanyId } }));
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
      setEmployees(await listEmployees({ data: { companyId: effectiveCompanyId, status: "active" } }));
    })();
  }, [effectiveCompanyId]);

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, HrTask[]> = {
      todo: [], in_progress: [], review: [], done: [],
    };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  const handleCreate = async () => {
    const companyId = effectiveCompanyId;
    if (!companyId) {
      setError("Sélectionnez une entreprise");
      return;
    }
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createTask({
        data: {
          companyId,
          title,
          description,
          priority,
          status: "todo",
          assigneeEmployeeId: assigneeId || null,
          dueDate: dueDate || "",
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setTitle("");
      setDescription("");
      setAssigneeId("");
      setDueDate("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (id: string, status: TaskStatus) => {
    const result = await moveTaskStatus({ data: { id, status } });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await load();
  };

  const handleDelete = async (id: string) => {
    const result = await softDeleteTask({ data: { id } });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await load();
  };

  return (
    <>
      <PageHeader
        badge="Organisation"
        title="Tâches"
        description="Suivi des actions RH et paie de l’équipe."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!effectiveCompanyId && !admin}>
                <Plus className="mr-1.5 h-4 w-4" />
                Nouvelle tâche
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Nouvelle tâche</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {!lockedCompanyId && (
                  <div className="space-y-1">
                    <Label>Entreprise</Label>
                    <Select
                      value={companyFilter === "all" ? "" : companyFilter}
                      onValueChange={setCompanyFilter}
                    >
                      <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Titre</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Préparer la paie de juillet" />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Priorité</Label>
                    <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Basse</SelectItem>
                        <SelectItem value="medium">Moyenne</SelectItem>
                        <SelectItem value="high">Haute</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Échéance</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Assigné</Label>
                  <Select value={assigneeId || "__none"} onValueChange={(v) => setAssigneeId(v === "__none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Optionnel" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Non assigné</SelectItem>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.first_name} {e.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={busy || !title.trim()} onClick={() => void handleCreate()}>
                  {busy ? "Création…" : "Créer"}
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

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : tasks.length === 0 ? (
        <EmptyPlaceholder
          title="Aucune tâche"
          description="Créez une première tâche RH (paie, contrats, onboarding…)."
          icon={Flag}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TASK_COLUMNS.map((status) => (
            <SectionCard
              key={status}
              title={`${taskStatusLabel[status]} · ${byStatus[status].length}`}
            >
              <div className="space-y-2">
                {byStatus[status].length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">Vide</p>
                ) : (
                  byStatus[status].map((it) => (
                    <div key={it.id} className="rounded-xl border border-border bg-background p-3">
                      <div className="text-sm font-medium">{it.title}</div>
                      {it.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{it.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", it.priority === "high" && "border-destructive/40 text-destructive")}
                        >
                          <Flag className="mr-1 h-2.5 w-2.5" />
                          {taskPriorityLabel[it.priority]}
                        </Badge>
                        {it.assignee_name && (
                          <span className="text-[11px] text-muted-foreground">{it.assignee_name}</span>
                        )}
                        {it.due_date && (
                          <span className="font-mono text-[10px] text-muted-foreground">{it.due_date}</span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {TASK_COLUMNS.filter((s) => s !== status).map((s) => (
                          <Button
                            key={s}
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => void handleMove(it.id, s)}
                          >
                            → {taskStatusLabel[s]}
                          </Button>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive"
                          onClick={() => void handleDelete(it.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className={cn("mt-2 inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium", columnStyle[status])}>
                {taskStatusLabel[status]}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </>
  );
}
