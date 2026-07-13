import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, SectionCard, StatCard } from "@/components/app/primitives";
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
import {
  FolderKanban, Upload, FileText, Folder, HardDrive, Building2, Download, Trash2, Search,
  FilePlus2, Sparkles,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { listCompanies } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import {
  abortDocumentUpload,
  createDocumentFromTemplate,
  documentStats,
  getDocumentDownloadUrl,
  getDocumentHtmlContent,
  listDocuments,
  listDocumentTemplates,
  prepareDocumentUpload,
  softDeleteDocument,
} from "@/modules/documents/document.functions";
import {
  DOCUMENT_CATEGORIES,
  documentCategoryLabel,
  formatFileSize,
  relativeTimeFr,
  type DocumentCategory,
  type HrDocumentWithMeta,
} from "@/modules/documents/types";
import type { CompanyWithMeta } from "@/modules/companies/types";
import type { EmployeeWithRelations } from "@/modules/employees/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/documents")({ component: DocumentsPage });

const appRouteApi = getRouteApi("/_app");

type TemplateCard = {
  id: string;
  category: DocumentCategory;
  title: string;
  shortLabel: string;
  description: string;
  note: string | null;
  fields: string[];
};

function DocumentsPage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);
  const canManage =
    admin || auth.profile?.role === "employer" || auth.profile?.role === "hr";

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>(profileCompanyId ?? "all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | DocumentCategory>("all");
  const [docs, setDocs] = useState<HrDocumentWithMeta[]>([]);
  const [stats, setStats] = useState({
    fileCount: 0,
    folderCount: 0,
    totalBytes: 0,
    byCategory: {} as Record<string, { count: number; size: number }>,
  });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState<string | null>(null);
  const [templateEmployeeId, setTemplateEmployeeId] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("other");
  const [employeeId, setEmployeeId] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, s, tpls] = await Promise.all([
        listDocuments({
          data: {
            companyId: effectiveCompanyId,
            category: categoryFilter,
            search: search.trim() || undefined,
          },
        }),
        documentStats({ data: { companyId: effectiveCompanyId } }),
        listDocumentTemplates(),
      ]);
      setDocs(rows);
      setStats(s);
      setTemplates(tpls as TemplateCard[]);
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
  }, [companyFilter, categoryFilter, lockedCompanyId]);

  useEffect(() => {
    if (!effectiveCompanyId) {
      setEmployees([]);
      return;
    }
    void (async () => {
      setEmployees(await listEmployees({ data: { companyId: effectiveCompanyId, status: "active" } }));
    })();
  }, [effectiveCompanyId]);

  const folders = useMemo(
    () =>
      DOCUMENT_CATEGORIES.map((c) => ({
        key: c,
        name: documentCategoryLabel[c],
        count: stats.byCategory[c]?.count ?? 0,
        size: formatFileSize(stats.byCategory[c]?.size ?? 0),
      })),
    [stats],
  );

  const templatesGrouped = useMemo(() => {
    const groups = DOCUMENT_CATEGORIES.map((c) => ({
      category: c,
      label: documentCategoryLabel[c],
      items: templates.filter((t) => t.category === c),
    }));
    return groups.filter((g) => g.items.length > 0);
  }, [templates]);

  const handleUpload = async () => {
    const companyId = effectiveCompanyId;
    if (!companyId) {
      setError("Sélectionnez une entreprise");
      return;
    }
    if (!file || !title.trim()) {
      setError("Titre et fichier obligatoires");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Fichier trop volumineux (max 10 Mo)");
      return;
    }

    setBusy(true);
    setError(null);
    let createdId: string | null = null;
    try {
      const prepared = await prepareDocumentUpload({
        data: {
          companyId,
          title,
          category,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          employeeId: employeeId || null,
          description,
        },
      });
      if (!prepared.ok) {
        setError(prepared.message);
        return;
      }
      createdId = prepared.data.document.id;

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from(prepared.data.bucket)
        .uploadToSignedUrl(prepared.data.path, prepared.data.token, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

      if (uploadError) {
        await abortDocumentUpload({ data: { id: createdId } });
        setError(uploadError.message);
        return;
      }

      setOpen(false);
      setTitle("");
      setDescription("");
      setEmployeeId("");
      setFile(null);
      setCategory("other");
      await load();
    } catch (err) {
      if (createdId) await abortDocumentUpload({ data: { id: createdId } });
      setError(err instanceof Error ? err.message : "Upload impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateTemplate = async (templateId: string) => {
    const companyId = effectiveCompanyId;
    if (!companyId) {
      setError("Sélectionnez une entreprise pour générer un modèle");
      return;
    }
    setGenBusy(templateId);
    setError(null);
    try {
      const result = await createDocumentFromTemplate({
        data: {
          companyId,
          templateId,
          employeeId: templateEmployeeId || null,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await load();
      await handleDownload(result.data.document.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Génération impossible");
    } finally {
      setGenBusy(null);
    }
  };

  const handleGenerateAll = async () => {
    const companyId = effectiveCompanyId;
    if (!companyId) {
      setError("Sélectionnez une entreprise");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const t of templates) {
        const result = await createDocumentFromTemplate({
          data: {
            companyId,
            templateId: t.id,
            employeeId: templateEmployeeId || null,
          },
        });
        if (!result.ok) throw new Error(`${t.shortLabel}: ${result.message}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Génération groupée impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (id: string) => {
    setError(null);
    const result = await getDocumentDownloadUrl({ data: { id } });
    if (!result.ok) {
      setError(result.message);
      return;
    }

    const isHtml =
      (result.data.mimeType ?? "").includes("html") ||
      result.data.fileName.toLowerCase().endsWith(".html");

    if (isHtml) {
      const htmlRes = await getDocumentHtmlContent({ data: { id } });
      if (!htmlRes.ok) {
        setError(htmlRes.message);
        return;
      }
      setPreviewHtml(htmlRes.data.html);
      setPreviewTitle(htmlRes.data.title);
      return;
    }

    const preview = window.open("about:blank", "_blank");
    if (preview) {
      preview.location.href = result.data.url;
      return;
    }
    const a = document.createElement("a");
    a.href = result.data.url;
    a.download = result.data.fileName;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDelete = async (id: string) => {
    const result = await softDeleteDocument({ data: { id } });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await load();
  };

  return (
    <>
      <PageHeader
        badge="Coffre"
        title="Documents"
        description="Modèles RH Comores + coffre privé (max 10 Mo / fichier)."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !effectiveCompanyId}
                onClick={() => void handleGenerateAll()}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                {busy ? "Génération…" : "Générer tous les modèles"}
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={!effectiveCompanyId && admin && companyFilter === "all"}>
                    <Upload className="mr-1.5 h-4 w-4" />
                    Téléverser
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="font-display">Ajouter un document</DialogTitle>
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
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contrat CDI — Amina Y." />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Catégorie</Label>
                        <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DOCUMENT_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>{documentCategoryLabel[c]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Employé (optionnel)</Label>
                        <Select value={employeeId || "__none"} onValueChange={(v) => setEmployeeId(v === "__none" ? "" : v)}>
                          <SelectTrigger><SelectValue placeholder="Entreprise" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Non lié</SelectItem>
                            {employees.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.first_name} {e.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Description</Label>
                      <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Fichier</Label>
                      <Input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xlsx,.csv,.txt,.html"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                      <p className="text-[11px] text-muted-foreground">PDF, images, Word, Excel, HTML — 10 Mo max</p>
                    </div>
                    <Button className="w-full" disabled={busy} onClick={() => void handleUpload()}>
                      {busy ? "Envoi…" : "Enregistrer"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Fichiers" value={String(stats.fileCount)} icon={FileText} accent="primary" />
        <StatCard label="Catégories" value={String(stats.folderCount)} icon={Folder} accent="gold" />
        <StatCard label="Stockage" value={formatFileSize(stats.totalBytes)} icon={HardDrive} accent="success" />
        <StatCard label="Modèles" value={String(templates.length)} icon={FilePlus2} accent="primary" />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        {admin && (
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
        )}
        {canManage && (
          <Select
            value={templateEmployeeId || "__none"}
            onValueChange={(v) => setTemplateEmployeeId(v === "__none" ? "" : v)}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Employé pour modèles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Modèle générique</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  Remplir avec {e.first_name} {e.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
        <Button variant="outline" size="sm" onClick={() => void load()}>Filtrer</Button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Dialog
        open={Boolean(previewHtml)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewHtml(null);
            setPreviewTitle("");
          }
        }}
      >
        <DialogContent className="flex h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border px-4 py-3 pr-12">
            <DialogTitle className="truncate font-display text-base">{previewTitle || "Aperçu"}</DialogTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const w = window.open("", "_blank");
                if (!w || !previewHtml) return;
                w.document.open();
                w.document.write(previewHtml);
                w.document.close();
                w.focus();
                window.setTimeout(() => w.print(), 300);
              }}
            >
              Imprimer / PDF
            </Button>
          </DialogHeader>
          {previewHtml && (
            <iframe
              title={previewTitle || "Aperçu document"}
              className="min-h-0 w-full flex-1 bg-white"
              srcDoc={previewHtml}
              sandbox=""
            />
          )}
        </DialogContent>
      </Dialog>

      {canManage && (
        <div className="mt-8 space-y-6">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">Modèles de documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {templates.length} modèles RH — générez un fichier prérempli dans le coffre (HTML imprimable).
            </p>
          </div>
          {templatesGrouped.map((group) => (
            <SectionCard key={group.category} title={group.label} description={`${group.items.length} modèle(s)`}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col rounded-xl border border-border/80 bg-muted/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-mono uppercase tracking-wider text-reef">
                          {t.shortLabel}
                        </div>
                        <div className="mt-1 text-sm font-medium leading-snug">{t.title}</div>
                      </div>
                      <FilePlus2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    </div>
                    <p className="mt-2 flex-1 text-xs text-muted-foreground">{t.description}</p>
                    <Button
                      size="sm"
                      className="mt-3 w-full"
                      disabled={!effectiveCompanyId || genBusy === t.id || busy}
                      onClick={() => void handleGenerateTemplate(t.id)}
                    >
                      {genBusy === t.id ? "Génération…" : "Générer"}
                    </Button>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {folders.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setCategoryFilter(categoryFilter === f.key ? "all" : f.key)}
            className={`card-elevated group p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-glow ${
              categoryFilter === f.key ? "ring-2 ring-primary" : ""
            }`}
          >
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-gold/15 text-gold-foreground group-hover:bg-gold">
              <Folder className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">{f.name}</div>
            <div className="text-xs text-muted-foreground">
              {f.count} fichier{f.count > 1 ? "s" : ""} · {f.size}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <SectionCard
          title="Fichiers récents"
          description={loading ? "Chargement…" : `${docs.length} document(s)`}
        >
          {!loading && docs.length === 0 ? (
            <EmptyPlaceholder
              title="Aucun document"
              description="Générez un modèle ou téléversez un fichier."
              icon={FileText}
            />
          ) : (
            <div className="divide-y divide-border">
              {docs.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {documentCategoryLabel[r.category]}
                      {r.employee_name ? ` · ${r.employee_name}` : ""}
                      {" · "}
                      {relativeTimeFr(r.created_at)}
                      {admin && r.company_name ? ` · ${r.company_name}` : ""}
                    </div>
                  </div>
                  <div className="hidden text-xs text-muted-foreground sm:block">
                    {formatFileSize(r.file_size)}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void handleDownload(r.id)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    {canManage && (
                      <Button variant="ghost" size="sm" onClick={() => void handleDelete(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
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
