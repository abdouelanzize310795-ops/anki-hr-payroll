import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Calculator, TrendingUp, TrendingDown, Wallet, Plus } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/accounting")({ component: AccountingPage });

const data = [
  { m: "Jan", rev: 320, exp: 210 }, { m: "Feb", rev: 340, exp: 220 },
  { m: "Mar", rev: 380, exp: 240 }, { m: "Apr", rev: 410, exp: 260 },
  { m: "May", rev: 445, exp: 280 }, { m: "Jun", rev: 470, exp: 300 }, { m: "Jul", rev: 512, exp: 315 },
];
const entries = [
  { date: "Jul 12", desc: "Payroll — Nigeria", cat: "Personnel", amt: "-$68,420", status: "Paid" },
  { date: "Jul 10", desc: "Client invoice #A-1042", cat: "Revenue", amt: "+$24,800", status: "Paid" },
  { date: "Jul 08", desc: "Office rent — Lagos HQ", cat: "Facilities", amt: "-$4,200", status: "Paid" },
  { date: "Jul 05", desc: "SaaS subscriptions", cat: "Tools", amt: "-$1,840", status: "Pending" },
];

function AccountingPage() {
  return (
    <>
      <PageHeader badge="Finance" title="Accounting"
        description="Revenue, expenses and general ledger."
        actions={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New entry</Button>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue MTD" value="$512K" delta="+9%" trend="up" icon={TrendingUp} accent="success" />
        <StatCard label="Expenses MTD" value="$315K" delta="+3%" trend="down" icon={TrendingDown} accent="destructive" />
        <StatCard label="Net margin" value="38.4%" delta="+2.1%" trend="up" icon={Calculator} accent="primary" />
        <StatCard label="Cash on hand" value="$1.24M" icon={Wallet} accent="gold" />
      </div>
      <div className="mt-6">
        <SectionCard title="Revenue vs expenses" description="Trailing 7 months ($K)">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="ae" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                <Area type="monotone" dataKey="rev" stroke="var(--color-success)" strokeWidth={2.5} fill="url(#ar)" />
                <Area type="monotone" dataKey="exp" stroke="var(--color-destructive)" strokeWidth={2.5} fill="url(#ae)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>
      <div className="mt-6">
        <SectionCard title="Recent entries">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Category</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {entries.map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{e.date}</TableCell>
                  <TableCell className="font-medium">{e.desc}</TableCell>
                  <TableCell className="text-muted-foreground">{e.cat}</TableCell>
                  <TableCell className={e.amt.startsWith("+") ? "text-success font-semibold" : "text-foreground font-medium"}>{e.amt}</TableCell>
                  <TableCell><StatusPill status={e.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </>
  );
}
