import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Laptop, Plus, Smartphone, Monitor, Package, Building2, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCompanies } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import {
  assetStats,
  createAsset,
  listAssets,
  softDeleteAsset,
  updateAsset,
} from "@/modules/assets/asset.functions";
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABEL,
  ASSET_STATUS_LABEL,
  type AssetCategory,
  type CompanyAssetWithMeta,
} from "@/modules/assets/types";
import type { CompanyWithMeta } from "@/modules/companies/types";
import type { EmployeeWithRelations } from "@/modules/employees/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/assets")({ component: AssetsPage });

const appRouteApi = getRouteApi("/_app");

function AssetsPage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [companyFilter, setCompanyFilter] = useState(profileCompanyId ?? "all");
  const [assets, setAssets] = useState<CompanyAssetWithMeta[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof assetStats>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<AssetCategory>("laptop");
  const [serial, setSerial] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);
  const createCompanyId = effectiveCompanyId ?? (admin ? companies[0]?.id : undefined);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, s] = await Promise.all([
        listAssets({ data: { companyId: effectiveCompanyId } }),
        assetStats({ data: { companyId: effectiveCompanyId } }),
      ]);
      setAssets(a);
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
    if (!createCompanyId) {
      setError("Choisissez une entreprise");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createAsset({
        data: {
          companyId: createCompanyId,
          name,
          category,
          serialNumber: serial,
          assignedEmployeeId: assigneeId || null,
        },
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setOpen(false);
      setName("");
      setSerial("");
      setAssigneeId("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        badge="Inventaire"
        title="Actifs"
        description="Équipements de l’entreprise affectés aux employés."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Ajouter
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nouvel actif</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid gap-1.5">
                  <Label>Désignation</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dell Latitude 5440"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <Label>Catégorie</Label>
                    <Select
                      value={category}
                      onValueChange={(v) => setCategory(v as AssetCategory)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ASSET_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {ASSET_CATEGORY_LABEL[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>N° série</Label>
                    <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Affecté à (optionnel)</Label>
                  <Select
                    value={assigneeId || "none"}
                    onValueChange={(v) => setAssigneeId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Non affecté" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non affecté</SelectItem>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.first_name} {e.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => void onCreate()} disabled={busy || name.trim().length < 2}>
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
        <StatCard label="Ordinateurs" value={loading ? "…" : String(stats?.laptops ?? 0)} icon={Laptop} accent="primary" />
        <StatCard label="Téléphones" value={loading ? "…" : String(stats?.phones ?? 0)} icon={Smartphone} accent="gold" />
        <StatCard label="Écrans" value={loading ? "…" : String(stats?.monitors ?? 0)} icon={Monitor} accent="success" />
        <StatCard label="Disponibles" value={loading ? "…" : String(stats?.unassigned ?? 0)} icon={Package} accent="destructive" />
      </div>

      <div className="mt-6">
        <SectionCard title="Registre des actifs">
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : assets.length === 0 ? (
            <EmptyPlaceholder
              title="Aucun actif"
              description="Ajoutez ordinateurs, téléphones ou autres équipements."
              icon={Package}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Actif</TableHead>
                  <TableHead>Série</TableHead>
                  <TableHead>Affecté à</TableHead>
                  <TableHead>Depuis</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {ASSET_CATEGORY_LABEL[a.category]}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {a.serial_number || "—"}
                    </TableCell>
                    <TableCell>{a.assignee_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.assigned_at
                        ? new Date(a.assigned_at).toLocaleDateString("fr-FR")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={ASSET_STATUS_LABEL[a.status]} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {a.status === "assigned" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void updateAsset({
                                data: {
                                  id: a.id,
                                  assignedEmployeeId: null,
                                  status: "available",
                                },
                              }).then(load)
                            }
                          >
                            Libérer
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void softDeleteAsset({ data: { id: a.id } }).then(load)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>
    </>
  );
}
