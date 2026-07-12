import { createFileRoute, Link, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, Money, SectionCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Calculator, Check, Ban, Wallet, RotateCcw, FileText, Landmark,
} from "lucide-react";
import {
  getPayrollRun,
  transitionPayrollRun,
} from "@/modules/payroll/payroll.functions";
import { generateTransferBatch } from "@/modules/transfers/transfer.functions";
import { useNavigate } from "@tanstack/react-router";import {
  payrollRunStatusLabel,
  payrollRunStatusPill,
  type PayrollRun,
  type Payslip,
} from "@/modules/payroll/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/payroll/$runId")({
  component: PayrollRunPage,
});

const appRouteApi = getRouteApi("/_app");

function PayrollRunPage() {
  const { runId } = Route.useParams();
  const navigate = useNavigate();
  const { auth } = appRouteApi.useRouteContext();
  const admin = isPlatformAdmin(auth);
  const canManage =
    admin || auth.profile?.role === "employer" || auth.profile?.role === "hr";

  const [run, setRun] = useState<(PayrollRun & { company_name?: string | null; payslips: Payslip[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPayrollRun({ data: { id: runId } });
      setRun(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [runId]);

  const act = async (action: "calculate" | "approve" | "pay" | "cancel" | "reopen") => {
    setBusy(true);
    setError(null);
    try {
      const result = await transitionPayrollRun({ data: { id: runId, action } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const createTransfers = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await generateTransferBatch({ data: { payrollRunId: runId } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      void navigate({ to: "/transfers/$batchId", params: { batchId: result.data.id } });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement du cycle…</p>;
  }

  if (!run) {
    return (
      <EmptyPlaceholder
        title="Cycle introuvable"
        description="Ce cycle de paie n’existe pas ou a été supprimé."
        icon={FileText}
      />
    );
  }

  return (
    <>
      <PageHeader
        badge={payrollRunStatusLabel[run.status]}
        title={run.label}
        description={[run.company_name, `${run.period_start} → ${run.period_end}`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/payroll"><ArrowLeft className="mr-1.5 h-4 w-4" />Retour</Link>
            </Button>
            {canManage && (run.status === "draft" || run.status === "calculated") && (
              <Button size="sm" disabled={busy} onClick={() => void act("calculate")}>
                <Calculator className="mr-1.5 h-4 w-4" />
                {run.status === "draft" ? "Calculer" : "Recalculer"}
              </Button>
            )}
            {canManage && run.status === "calculated" && (
              <Button size="sm" disabled={busy} onClick={() => void act("approve")}>
                <Check className="mr-1.5 h-4 w-4" />
                Approuver
              </Button>
            )}
            {canManage && run.status === "approved" && (
              <Button size="sm" disabled={busy} onClick={() => void act("pay")}>
                <Wallet className="mr-1.5 h-4 w-4" />
                Marquer payé
              </Button>
            )}
            {canManage && (run.status === "calculated" || run.status === "approved") && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void act("reopen")}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Rouvrir
              </Button>
            )}
            {canManage && run.status !== "paid" && run.status !== "cancelled" && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act("cancel")}>
                <Ban className="mr-1.5 h-4 w-4" />
                Annuler
              </Button>
            )}
            {canManage && (run.status === "approved" || run.status === "paid") && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void createTransfers()}>
                <Landmark className="mr-1.5 h-4 w-4" />
                Virements
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SectionCard title="Effectif">
          <p className="font-display text-3xl font-bold">{run.employee_count}</p>
        </SectionCard>
        <SectionCard title="Brut">
          <p className="font-display text-2xl font-bold">
            <Money value={run.total_gross} currency={run.currency_code} />
          </p>
        </SectionCard>
        <SectionCard title="Retenues">
          <p className="font-display text-2xl font-bold">
            <Money value={run.total_deductions} currency={run.currency_code} />
          </p>
        </SectionCard>
        <SectionCard title="Net">
          <p className="font-display text-2xl font-bold">
            <Money value={run.total_net} currency={run.currency_code} />
          </p>
        </SectionCard>
      </div>

      <SectionCard
        title="Bulletins"
        description={
          run.status === "draft"
            ? "Lancez le calcul pour générer les bulletins des salariés actifs avec un salaire de base."
            : undefined
        }
      >
        {run.payslips.length === 0 ? (
          <EmptyPlaceholder
            title="Aucun bulletin"
            description="Vérifiez que des employés actifs ont un salaire de base, puis calculez."
            icon={FileText}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Salarié</TableHead>
                <TableHead>Poste</TableHead>
                <TableHead>Brut</TableHead>
                <TableHead>Net</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.payslips.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.payslip_number}</TableCell>
                  <TableCell className="font-medium">{p.employee_name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.job_title}</TableCell>
                  <TableCell className="font-mono">
                    <Money value={p.gross_amount} currency={p.currency_code} />
                  </TableCell>
                  <TableCell className="font-mono font-semibold">
                    <Money value={p.net_amount} currency={p.currency_code} />
                  </TableCell>
                  <TableCell>
                    <StatusPill
                      status={
                        p.status === "paid"
                          ? "Payé"
                          : p.status === "approved"
                            ? "Approuvé"
                            : p.status === "cancelled"
                              ? "Annulé"
                              : "Calculé"
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/payroll/payslip/$payslipId" params={{ payslipId: p.id }}>
                        Voir
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <div className="mt-4">
        <StatusPill status={payrollRunStatusPill[run.status]} />
        <span className="ml-2 text-xs text-muted-foreground">
          Coût employeur estimé{" "}
          <Money value={run.total_employer_cost} currency={run.currency_code} />
        </span>
      </div>
    </>
  );
}
