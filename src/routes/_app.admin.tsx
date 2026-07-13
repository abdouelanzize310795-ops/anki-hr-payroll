import { createFileRoute, getRouteApi, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, Users, Building2, Wallet, AlertTriangle, Check,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getAdminOverview,
  type AdminOverview,
} from "@/modules/admin/admin.functions";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";
import {
  companyApprovalLabel,
  companySubscriptionLabel,
  type CompanyApprovalStatus,
  type CompanySubscriptionStatus,
} from "@/modules/companies/types";
import { CompanyApprovalActions } from "@/modules/admin/components/CompanyApprovalActions";

export const Route = createFileRoute("/_app/admin")({
  beforeLoad: ({ context }) => {
    if (!isPlatformAdmin(context.auth)) {
      throw redirect({ to: "/" });
    }
  },
  component: AdminPage,
});

const appRouteApi = getRouteApi("/_app");

const ROLE_LABEL: Record<string, string> = {
  platform_admin: "Admin plateforme",
  employer: "Employeur",
  hr: "RH",
  manager: "Manager",
  employee: "Employé",
};

function relativeFr(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l’instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hier" : `il y a ${days} j`;
}

function AdminPage() {
  const { auth } = appRouteApi.useRouteContext();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAdminOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [auth.id]);

  const pending = (data?.companies ?? []).filter(
    (c) =>
      c.approval_status === "pending_approval" || c.approval_status === "pending_payment",
  );

  return (
    <>
      <PageHeader
        badge="Plateforme"
        title="Super Admin"
        description="Validez les entreprises après paiement et suivez tous les tenants AnkibaPay."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/companies">
              <Building2 className="mr-1.5 h-4 w-4" />
              Entreprises
            </Link>
          </Button>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Tenants"
          value={loading ? "…" : String(data?.tenants ?? 0)}
          icon={ShieldCheck}
          accent="primary"
        />
        <StatCard
          label="À valider"
          value={loading ? "…" : String(data?.pendingApprovals ?? 0)}
          icon={AlertTriangle}
          accent={data?.pendingApprovals ? "destructive" : "gold"}
        />
        <StatCard
          label="Utilisateurs actifs"
          value={loading ? "…" : String(data?.activeUsers ?? 0)}
          icon={Users}
          accent="gold"
        />
        <StatCard
          label="Employés"
          value={loading ? "…" : String(data?.employees ?? 0)}
          icon={Building2}
          accent="success"
        />
        <StatCard
          label="Cycles paie ouverts"
          value={loading ? "…" : String(data?.openPayrollRuns ?? 0)}
          icon={data?.openPayrollRuns ? AlertTriangle : Wallet}
          accent={data?.openPayrollRuns ? "destructive" : "primary"}
        />
      </div>

      <div className="mt-6">
        <SectionCard
          title="File de validation"
          description="Vérifiez le transfert M'Vola (code dans la description) puis activez le compte"
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !pending.length ? (
            <EmptyPlaceholder
              title="Aucune demande en attente"
              description="Les nouvelles entreprises apparaissent ici après paiement."
              icon={Check}
            />
          ) : (
            <div className="space-y-4">
              {pending.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-border bg-muted/20 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-medium">{c.legal_name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {c.city || "—"} · Plan {c.subscription_plan || "—"} ·{" "}
                        {c.employee_count} employé(s)
                      </div>
                      {c.payment_reference ? (
                        <div className="mt-2 rounded-lg border border-primary/20 bg-primary-soft/40 px-3 py-2 text-sm">
                          <span className="text-muted-foreground">Code M&apos;Vola : </span>
                          <code className="font-mono font-bold text-primary">
                            {c.payment_reference}
                          </code>
                          {c.payment_method ? (
                            <span className="ml-2 text-xs uppercase text-muted-foreground">
                              {c.payment_method}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                          Aucun code généré — l’entreprise n’a pas encore choisi de plan.
                        </div>
                      )}
                    </div>
                    <CompanyApprovalActions
                      companyId={c.id}
                      approvalStatus={c.approval_status}
                      variant="full"
                      onDone={() => void load()}
                      onError={setError}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Toutes les entreprises" description="Tenants de la plateforme">
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !data?.companies.length ? (
            <EmptyPlaceholder
              title="Aucun tenant"
              description="Créez une entreprise pour démarrer."
              icon={Building2}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raison sociale</TableHead>
                  <TableHead>Abonnement</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Effectif</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/companies/$companyId"
                        params={{ companyId: c.id }}
                        className="hover:text-primary hover:underline"
                      >
                        {c.legal_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{c.city || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm capitalize">{c.subscription_plan || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {companySubscriptionLabel[
                          c.subscription_status as CompanySubscriptionStatus
                        ] ?? c.subscription_status}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusPill
                        status={
                          companyApprovalLabel[c.approval_status as CompanyApprovalStatus] ??
                          c.approval_status
                        }
                      />
                    </TableCell>
                    <TableCell>{c.employee_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <SectionCard title="Utilisateurs" description="Comptes plateforme">
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Compte</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.users ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.full_name || u.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.email}
                        {u.company_name ? ` · ${u.company_name}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {ROLE_LABEL[u.role] ?? u.role}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={u.is_active ? "Actif" : "Inactif"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Activité récente" description="Paie et congés">
          {!data?.activity.length && !loading ? (
            <EmptyPlaceholder
              title="Pas encore d’activité"
              description="Les événements paie et congés apparaîtront ici."
              icon={Wallet}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Événement</TableHead>
                  <TableHead>Quand</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.activity ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.label}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {relativeFr(a.when)}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={a.status} />
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
