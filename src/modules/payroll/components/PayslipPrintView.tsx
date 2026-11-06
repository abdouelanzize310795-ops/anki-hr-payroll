import type { RenderablePayslip } from "@/modules/payroll/template.types";
import { PayslipRenderer } from "./PayslipRenderer";

/** Printable payslip, rendered with the company's payslip template. */
export function PayslipPrintView({ slip }: { slip: RenderablePayslip }) {
  return <PayslipRenderer slip={slip} />;
}
