import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, SectionCard, StatusPill } from "@/components/app/primitives";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Headphones, Plus, Building2 } from "lucide-react";
import { listCompanies, listDepartments } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import {
  createHelpdeskTicket,
  listHelpdeskTickets,
  transitionHelpdeskTicket,
} from "@/modules/helpdesk/helpdesk.functions";
import { uploadHelpdeskTicketPhoto } from "@/modules/helpdesk/upload-photo";
import {
  helpdeskCategoryLabel,
  helpdeskPriorityLabel,
  helpdeskStatusLabel,
  helpdeskStatusToPill,
  type HelpdeskCategory,
  type HelpdeskPriority,
  type HelpdeskStatus,
  type HelpdeskTicketWithRelations,
} from "@/modules/helpdesk/types";
import type { CompanyWithMeta } from "@/modules/companies/types";
import type { Department } from "@/modules/companies/types";
import type { EmployeeWithRelations } from "@/modules/employees/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/helpdesk")({ component: HelpdeskPage });

const appRouteApi = getRouteApi("/_app");

function HelpdeskPage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);
  const role = auth.profile?.role ?? "employee";
  const canApprove =
    admin || role === "employer" || role === "hr" || role === "manager";

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>(profileCompanyId ?? "all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tickets, setTickets] = useState<HelpdeskTicketWithRelations[]>([]);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<HelpdeskCategory>("request");
  const [priority, setPriority] = useState<HelpdeskPriority>("medium");
  const [assignMode, setAssignMode] = useState<"person" | "department">("department");
  const [assigneeEmployeeId, setAssigneeEmployeeId] = useState("");
  const [assigneeDepartmentId, setAssigneeDepartmentId] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setTickets(
        await listHelpdeskTickets({
          data: {
            companyId: effectiveCompanyId,
            status: statusFilter as HelpdeskStatus | "all",
          },
        }),
      );
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
    if (!effectiveCompanyId) {
      setEmployees([]);
      setDepartments([]);
      return;
    }
    void (async () => {
      const [emps, depts] = await Promise.all([
        listEmployees({ data: { companyId: effectiveCompanyId, status: "active" } }),
        listDepartments({ data: { companyId: effectiveCompanyId } }),
      ]);
      setEmployees(emps);
      setDepartments(depts);
      const mine = emps.find((e) => e.user_id === auth.user?.id);
      setMyEmployeeId(mine?.id ?? null);
    })();
  }, [effectiveCompanyId, auth.user?.id]);

  useEffect(() => {
    void load();
  }, [companyFilter, statusFilter, lockedCompanyId]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setCategory("request");
    setPriority("medium");
    setAssignMode("department");
    setAssigneeEmployeeId("");
    setAssigneeDepartmentId("");
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleCreate = async () => {
    if (!effectiveCompanyId) {
      setError("Sélectionnez une entreprise");
      return;
    }
    if (!title.trim() || title.trim().length < 3) {
      setError("Titre trop court (3 caractères min.)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createHelpdeskTicket({
        data: {
          companyId: effectiveCompanyId,
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          assigneeEmployeeId: assignMode === "person" ? assigneeEmployeeId || null : null,
          assigneeDepartmentId: assignMode === "department" ? assigneeDepartmentId || null : null,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (photoFile) {
        try {
          await uploadHelpdeskTicketPhoto(effectiveCompanyId, result.data.id, photoFile);
        } catch (photoErr) {
          setError(
            photoErr instanceof Error
              ? `Ticket créé, mais photo refusée : ${photoErr.message}`
              : "Ticket créé, mais la photo n’a pas pu être jointe",
          );
          setOpen(false);
          resetForm();
          await load();
          return;
        }
      }
      setOpen(false);
      resetForm();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleAction = async (
    id: string,
    action: "approve" | "reject" | "cancel" | "start" | "resolve" | "close",
  ) => {
    setBusy(true);
    setError(null);
    try {
      const result = await transitionHelpdeskTicket({ data: { id, action } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const stats = useMemo(() => {
    const all = tickets;
    return {
      pending: all.filter((t) => t.status === "pending_manager").length,
      open: all.filter((t) => t.status === "open" || t.status === "in_progress").length,
      done: all.filter((t) => t.status === "resolved" || t.status === "closed").length,
    };
  }, [tickets]);

  return (
    <>
      <PageHeader
        badge="Support"
        title="Helpdesk"
        description="Tickets qualifiés : validation manager, puis traitement par la personne ou le département assigné."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!effectiveCompanyId}>
                <Plus className="mr-1.5 h-4 w-4" />
                Nouveau ticket
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display">Créer un ticket</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Titre</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Accès VPN bloqué" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Catégorie</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as HelpdeskCategory)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(helpdeskCategoryLabel) as HelpdeskCategory[]).map((k) => (
                          <SelectItem key={k} value={k}>{helpdeskCategoryLabel[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Priorité</Label>
                    <Select value={priority} onValueChange={(v) => setPriority(v as HelpdeskPriority)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(helpdeskPriorityLabel) as HelpdeskPriority[]).map((k) => (
                          <SelectItem key={k} value={k}>{helpdeskPriorityLabel[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Assigner à</Label>
                  <Select value={assignMode} onValueChange={(v) => setAssignMode(v as "person" | "department")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="department">Un département</SelectItem>
                      <SelectItem value="person">Une personne</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {assignMode === "department" ? (
                  <div>
                    <Label>Département</Label>
                    <Select value={assigneeDepartmentId} onValueChange={setAssigneeDepartmentId}>
                      <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label>Personne</Label>
                    <Select value={assigneeEmployeeId} onValueChange={setAssigneeEmployeeId}>
                      <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.first_name} {e.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Photo (optionnel)</Label>
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, WebP ou GIF · max 5 Mo</p>
                  {photoPreview && (
                    <a
                      href={photoPreview}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block overflow-hidden rounded-lg border border-border"
                    >
                      <img src={photoPreview} alt="Aperçu" className="max-h-40 w-full object-contain bg-muted/30" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Votre manager de département doit d’abord approuver. Ensuite, le destinataire (personne ou tout le département) est notifié.
                </p>
                <Button className="w-full" disabled={busy} onClick={() => void handleCreate()}>
                  Soumettre
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {!effectiveCompanyId && (
        <p className="mb-4 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm">
          Sélectionnez une entreprise pour créer un ticket.
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>À valider : <strong className="text-foreground">{stats.pending}</strong></span>
        <span>En traitement : <strong className="text-foreground">{stats.open}</strong></span>
        <span>Terminés : <strong className="text-foreground">{stats.done}</strong></span>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        {admin && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Entreprise" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {(Object.keys(helpdeskStatusLabel) as HelpdeskStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{helpdeskStatusLabel[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <SectionCard title="Tickets" description={`${tickets.length} ticket(s)`}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : tickets.length === 0 ? (
          <EmptyPlaceholder
            title="Aucun ticket"
            description="Créez un ticket pour solliciter un département ou un collègue."
            icon={Headphones}
          />
        ) : (
          <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Sujet</TableHead>
                    <TableHead>Photo</TableHead>
                    <TableHead>Demandeur</TableHead>
                    <TableHead>Assigné</TableHead>
                    <TableHead>Pris en charge</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
            <TableBody>
              {tickets.map((t) => {
                const isRequester =
                  myEmployeeId === t.requester_employee_id ||
                  t.created_by === auth.user?.id;
                const pending = t.status === "pending_manager";
                const canTreat =
                  t.status === "open" || t.status === "in_progress" || t.status === "resolved";
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.ticket_number}</TableCell>
                    <TableCell>
                      <div className="font-medium">{t.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {helpdeskCategoryLabel[t.category]}
                        {t.description ? ` · ${t.description.slice(0, 60)}${t.description.length > 60 ? "…" : ""}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      {t.photo_url ? (
                        <a href={t.photo_url} target="_blank" rel="noreferrer" className="inline-block">
                          <img
                            src={t.photo_url}
                            alt={`Photo ${t.ticket_number}`}
                            className="h-12 w-12 rounded-md border border-border object-cover"
                          />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{t.requester_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {t.assignee_name ?? t.assignee_department_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.handler_name ? (
                        <div>
                          <div className="font-medium">{t.handler_name}</div>
                          {t.handled_at && (
                            <div className="text-xs text-muted-foreground">
                              {new Date(t.handled_at).toLocaleString("fr-FR", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{helpdeskPriorityLabel[t.priority]}</TableCell>
                    <TableCell>
                      <StatusPill status={helpdeskStatusToPill(t.status)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {pending && canApprove && (
                          <>
                            <Button size="sm" variant="default" disabled={busy} onClick={() => void handleAction(t.id, "approve")}>
                              Approuver
                            </Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleAction(t.id, "reject")}>
                              Refuser
                            </Button>
                          </>
                        )}
                        {t.status === "open" && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleAction(t.id, "start")}>
                            Prendre en charge
                          </Button>
                        )}
                        {(t.status === "open" || t.status === "in_progress") && (
                          <Button size="sm" disabled={busy} onClick={() => void handleAction(t.id, "resolve")}>
                            Résoudre
                          </Button>
                        )}
                        {canTreat && t.status === "resolved" && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleAction(t.id, "close")}>
                            Clôturer
                          </Button>
                        )}
                        {(pending || t.status === "open") && isRequester && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleAction(t.id, "cancel")}>
                            Annuler
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </>
  );
}
