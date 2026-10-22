import { createFileRoute } from "@tanstack/react-router";
import { PayslipRenderer } from "@/modules/payroll/components/PayslipRenderer";
import { getPayslip } from "@/modules/payroll/payroll.functions";

/**
 * Bare payslip page (no app shell) used to produce the PDF with the employer's
 * template. Access rules are those of getPayslip (own approved payslip for employees).
 */
export const Route = createFileRoute("/print/payslip/$payslipId")({
  loader: async ({ params }) => ({ slip: await getPayslip({ data: { id: params.payslipId } }) }),
  component: PrintPayslipPage,
});

function PrintPayslipPage() {
  const { slip } = Route.useLoaderData();
  if (!slip) {
    return <p style={{ padding: 40, fontFamily: "sans-serif" }}>Bulletin introuvable ou non accessible.</p>;
  }
  return (
    <div className="min-h-screen bg-white print:bg-white" data-payslip-ready="1">
      <style>{"@page { size: A4; margin: 10mm; } html, body { background: #fff !important; }"}</style>
      <PayslipRenderer slip={slip} />
    </div>
  );
}
