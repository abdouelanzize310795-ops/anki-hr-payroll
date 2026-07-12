import { createFileRoute, Link, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, Money, SectionCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, FileText, Landmark } from "lucide-react";
import {
  getTransferBatch,
  markTransferExported,
} from "@/modules/transfers/transfer.functions";
import { buildTransferCsv } from "@/modules/transfers/amountWords";
import {
  transferStatusLabel,
  transferStatusPill,
  type TransferBatchDetail,
} from "@/modules/transfers/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/transfers/$batchId")({
  component: TransferBatchPage,
});

const appRouteApi = getRouteApi("/_app");

function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TransferBatchPage() {
  const { batchId } = Route.useParams();
  const { auth } = appRouteApi.useRouteContext();
  const admin = isPlatformAdmin(auth);
  const canManage =
    admin || auth.profile?.role === "employer" || auth.profile?.role === "hr";

  const [batch, setBatch] = useState<TransferBatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setBatch(await getTransferBatch({ data: { id: batchId } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [batchId]);

  const handleExportCsv = async () => {
    if (!batch) return;
    const csv = buildTransferCsv(batch.lines, batch.currency_code);
    const slug = batch.label.replace(/[^\w\-]+/g, "_").slice(0, 40);
    downloadText(`virements_${slug}.csv`, csv);

    if (canManage && batch.status !== "exported") {
      setBusy(true);
      try {
        const result = await markTransferExported({ data: { id: batch.id } });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        await load();
      } finally {
        setBusy(false);
      }
    }
  };

  const handlePrint = () => window.print();

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  if (!batch) {
    return (
      <EmptyPlaceholder
        title="Ordre introuvable"
        description={error ?? "Cet ordre de virement n’existe pas."}
        icon={Landmark}
      />
    );
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          badge={transferStatusLabel[batch.status]}
          title={batch.label}
          description={[batch.company_name, batch.payroll_label].filter(Boolean).join(" · ")}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/transfers"><ArrowLeft className="mr-1.5 h-4 w-4" />Retour</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <FileText className="mr-1.5 h-4 w-4" />
                État récapitulatif
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void handleExportCsv()}>
                <Download className="mr-1.5 h-4 w-4" />
                Exporter CSV
              </Button>
            </div>
          }
        />
      </div>

      {error && (
        <p className="mb-4 print:hidden rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {batch.missing_account_count > 0 && (
        <p className="mb-4 print:hidden rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold-foreground">
          {batch.missing_account_count} salarié(s) sans compte bancaire — complétez les fiches
          employés avant remise à la banque.
        </p>
      )}

      <div className="transfer-print">
        <SectionCard
          title={batch.label}
          description={`Format terrain · ${batch.line_count} virement(s) · ${transferStatusLabel[batch.status]}`}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Nom et prénom</TableHead>
                <TableHead>Fonction</TableHead>
                <TableHead>N° de compte</TableHead>
                <TableHead className="text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.lines.map((l) => (
                <TableRow key={l.id} className={!l.has_account ? "bg-destructive/5" : undefined}>
                  <TableCell className="font-mono text-xs">
                    {String(l.order_number).padStart(3, "0")}
                  </TableCell>
                  <TableCell className="font-medium">{l.beneficiary_name}</TableCell>
                  <TableCell>{l.job_title ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.bank_account || l.bank_rib || (
                      <span className="text-destructive">Compte manquant</span>
                    )}
                    {l.bank_name ? (
                      <div className="text-[10px] text-muted-foreground">{l.bank_name}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={l.amount} currency={l.currency_code} />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} className="text-right font-semibold">
                  Total général
                </TableCell>
                <TableCell className="text-right font-display text-lg text-primary">
                  <Money value={batch.total_amount} currency={batch.currency_code} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <p className="mt-4 text-sm text-muted-foreground">
            Arrêté le présent état à la somme de{" "}
            <span className="font-medium text-foreground">
              {batch.total_in_words ?? "—"}
            </span>
            .
          </p>

          <div className="mt-4 print:hidden">
            <StatusPill status={transferStatusPill[batch.status]} />
          </div>
        </SectionCard>
      </div>
    </>
  );
}
