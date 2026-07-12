import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, FileText } from "lucide-react";
import { getPayslip } from "@/modules/payroll/payroll.functions";
import { PayslipPrintView } from "@/modules/payroll/components/PayslipPrintView";
import type { PayslipDetail } from "@/modules/payroll/types";

export const Route = createFileRoute("/_app/payroll/payslip/$payslipId")({
  component: PayslipPage,
});

function PayslipPage() {
  const { payslipId } = Route.useParams();
  const [slip, setSlip] = useState<PayslipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setSlip(await getPayslip({ data: { id: payslipId } }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chargement impossible");
      } finally {
        setLoading(false);
      }
    })();
  }, [payslipId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement du bulletin…</p>;
  }

  if (!slip) {
    return (
      <EmptyPlaceholder
        title="Bulletin introuvable"
        description={error ?? "Ce bulletin n’existe pas."}
        icon={FileText}
      />
    );
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          badge="Bulletin"
          title={slip.employee_name}
          description={`${slip.payslip_number ?? ""} · ${slip.period_label ?? ""}`}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/payroll/$runId" params={{ runId: slip.payroll_run_id }}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  Cycle
                </Link>
              </Button>
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" />
                Imprimer
              </Button>
            </div>
          }
        />
      </div>
      <PayslipPrintView slip={slip} />
    </>
  );
}
