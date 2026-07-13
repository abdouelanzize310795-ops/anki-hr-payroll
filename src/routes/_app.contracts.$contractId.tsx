import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatusPill, Money } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer, Send, PenLine, Play, Ban } from "lucide-react";
import {
  getContract, transitionContract,
  type EmployeeAccountProvision,
} from "@/modules/contracts/contract.functions";
import { ContractPrintView } from "@/modules/contracts/components/ContractPrintView";
import {
  contractStatusLabel,
  contractTypeLabel,
  type ContractDetail,
  type ContractStatus,
} from "@/modules/contracts/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/contracts/$contractId")({
  component: ContractDetailPage,
});

const appRouteApi = getRouteApi("/_app");

function statusToPill(status: ContractStatus) {
  const map: Record<ContractStatus, string> = {
    draft: "Brouillon",
    sent: "En attente",
    signed: "Approuvé",
    active: "Actif",
    expired: "Expiré",
    cancelled: "Refusé",
  };
  return map[status];
}

function ContractDetailPage() {
  const { contractId } = Route.useParams();
  const { auth } = appRouteApi.useRouteContext();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountCreds, setAccountCreds] = useState<EmployeeAccountProvision | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await getContract({ data: { id: contractId } });
      if (!row) {
        setError("Contrat introuvable ou accès refusé.");
        setContract(null);
        return;
      }
      setContract(row);
      setSignerName(row.employee_name ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [contractId]);

  const runAction = async (
    action: "send" | "sign" | "activate" | "cancel",
  ) => {
    if (!contract) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await transitionContract({
        data: {
          id: contract.id,
          action,
          signerName: action === "sign" ? signerName : undefined,
          reason: action === "cancel" ? cancelReason : undefined,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const labels = {
        send: "Contrat marqué comme envoyé.",
        sign: "Contrat signé.",
        activate: "Contrat activé — fiche employé mise à jour.",
        cancel: "Contrat annulé.",
      };
      setMessage(labels[action]);
      if (action === "activate") {
        if (result.account) setAccountCreds(result.account);
        if (result.accountError) {
          setError(
            `Contrat activé, mais compte employé non créé : ${result.accountError}`,
          );
        }
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Chargement du contrat…
      </div>
    );
  }

  if (error && !contract) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" asChild>
          <Link to="/contracts"><ArrowLeft className="mr-1.5 h-4 w-4" />Retour</Link>
        </Button>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!contract) return null;

  const canManage = isPlatformAdmin(auth) || Boolean(auth.profile?.company_id);
  const editable = contract.status === "draft" || contract.status === "sent";

  return (
    <>
      <PageHeader
        badge={contract.contract_number ?? "Contrat"}
        title={`${contract.employee_name} — ${contractTypeLabel[contract.contract_type]}`}
        description={`${contract.job_title} · ${contractStatusLabel[contract.status]}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={statusToPill(contract.status)} />
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" />Imprimer
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/contracts"><ArrowLeft className="mr-1.5 h-4 w-4" />Liste</Link>
            </Button>
          </div>
        }
      />

      {message && (
        <div className="mb-4 rounded-lg border border-reef/30 bg-reef/10 px-3 py-2 text-sm">{message}</div>
      )}
      {accountCreds && (
        <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          <div className="font-medium text-gold-foreground">Compte collaborateur prêt</div>
          <p className="mt-1 text-muted-foreground">
            Transmettez ces identifiants à l’employé (mot de passe affiché une seule fois).
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">E-mail</dt>
              <dd className="font-mono text-sm">{accountCreds.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mot de passe temporaire</dt>
              <dd className="font-mono text-sm">
                {accountCreds.temporaryPassword ??
                  (accountCreds.created
                    ? "—"
                    : "Compte existant — mot de passe inchangé")}
              </dd>
            </div>
          </dl>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {canManage && contract.status !== "cancelled" && contract.status !== "expired" && (
        <div className="mb-6">
        <SectionCard
          title="Workflow"
          description="Envoi → signature → activation. Un contrat annulé devient immuable."
        >
          <div className="flex flex-wrap gap-2">
            {contract.status === "draft" && (
              <Button size="sm" disabled={busy} onClick={() => void runAction("send")}>
                <Send className="mr-1.5 h-4 w-4" />Marquer envoyé
              </Button>
            )}
            {editable && (
              <>
                <div className="flex min-w-[220px] flex-1 items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="signer">Nom du signataire salarié</Label>
                    <Input
                      id="signer"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !signerName.trim()}
                    onClick={() => void runAction("sign")}
                  >
                    <PenLine className="mr-1.5 h-4 w-4" />Signer
                  </Button>
                </div>
              </>
            )}
            {(contract.status === "signed" || contract.status === "sent" || contract.status === "draft") && (
              <Button size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90" disabled={busy} onClick={() => void runAction("activate")}>
                <Play className="mr-1.5 h-4 w-4" />Activer
              </Button>
            )}
            {contract.status !== "cancelled" && (
              <div className="flex min-w-[240px] flex-1 items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="cancelReason">Motif d’annulation</Label>
                  <Input
                    id="cancelReason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Motif…"
                  />
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void runAction("cancel")}
                >
                  <Ban className="mr-1.5 h-4 w-4" />Annuler
                </Button>
              </div>
            )}
          </div>
          {contract.status === "active" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Contrat actif : salaire <Money value={contract.base_salary} currency={contract.currency_code} />
              {" "}appliqué sur la fiche employé.
            </p>
          )}
        </SectionCard>
        </div>
      )}

      <div className="print:mt-0">
        <ContractPrintView contract={contract} />
      </div>
    </>
  );
}
