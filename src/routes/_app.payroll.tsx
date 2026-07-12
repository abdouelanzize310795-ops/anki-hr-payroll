import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, Play, Download, FileText, DollarSign, TrendingUp } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export const Route = createFileRoute("/_app/payroll")({ component: PayrollPage });

const trend = [
  { m: "Jan", v: 182 }, { m: "Feb", v: 191 }, { m: "Mar", v: 205 },
  { m: "Apr", v: 213 }, { m: "May", v: 224 }, { m: "Jun", v: 236 }, { m: "Jul", v: 248 },
];

const runs = [
  { period: "July 2026", country: "Nigeria", gross: "₦68.4M", net: "₦52.1M", status: "Paid" },
  { period: "July 2026", country: "Kenya", gross: "KES 12.4M", net: "KES 9.8M", status: "Approved" },
  { period: "July 2026", country: "South Africa", gross: "R 2.1M", net: "R 1.6M", status: "Pending" },
  { period: "June 2026", country: "Nigeria", gross: "₦65.2M", net: "₦50.4M", status: "Paid" },
];

function PayrollPage() {
  return (
    <>
      <PageHeader badge="Payroll" title="Payroll"
        description="Run, approve, and distribute payslips across all entities."
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="mr-1.5 h-4 w-4" />Payslips</Button>
            <Button size="sm"><Play className="mr-1.5 h-4 w-4" />Run payroll</Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Monthly cost" value="$248.4K" delta="+5.2%" trend="up" icon={Wallet} accent="primary" />
        <StatCard label="Average salary" value="$1,002" delta="+2.1%" trend="up" icon={DollarSign} accent="gold" />
        <StatCard label="Payslips generated" value="248" icon={FileText} accent="success" />
        <StatCard label="YTD growth" value="+18%" icon={TrendingUp} accent="primary" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Payroll cost trend" description="Total cost ($K)">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                  <Line type="monotone" dataKey="v" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 4, fill: "var(--color-primary)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>
        <SectionCard title="Salary breakdown" description="July 2026">
          {[
            { l: "Base salaries", v: "$198.1K", w: "80%" },
            { l: "Bonuses", v: "$24.2K", w: "10%" },
            { l: "Allowances", v: "$14.9K", w: "6%" },
            { l: "Taxes & social", v: "$11.2K", w: "4%" },
          ].map((r) => (
            <div key={r.l} className="mb-3 last:mb-0">
              <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{r.l}</span><span className="text-muted-foreground">{r.v}</span></div>
              <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: r.w }} /></div>
            </div>
          ))}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Payroll runs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.period}</TableCell>
                  <TableCell className="text-muted-foreground">{r.country}</TableCell>
                  <TableCell>{r.gross}</TableCell>
                  <TableCell className="font-semibold">{r.net}</TableCell>
                  <TableCell><StatusPill status={r.status} /></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm">View payslips</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </>
  );
}
