import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { BarChart3, Download, FileText, TrendingUp, Users, Wallet } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports")({ component: ReportsPage });

const byCountry = [
  { c: "Nigeria", v: 118 }, { c: "Kenya", v: 62 }, { c: "South Africa", v: 42 },
  { c: "Senegal", v: 18 }, { c: "Ghana", v: 8 },
];
const byDept = [
  { name: "Engineering", value: 88, color: "var(--chart-1)" },
  { name: "Sales", value: 62, color: "var(--chart-2)" },
  { name: "People", value: 34, color: "var(--chart-3)" },
  { name: "Finance", value: 28, color: "var(--chart-4)" },
  { name: "Ops", value: 36, color: "var(--chart-5)" },
];

const catalog = [
  { title: "Monthly HR summary", desc: "Headcount, hires, exits, cost", icon: Users },
  { title: "Payroll ledger", desc: "Full breakdown by employee", icon: Wallet },
  { title: "Attendance trends", desc: "Hours worked & overtime", icon: TrendingUp },
  { title: "Compliance & certificates", desc: "Training completion", icon: FileText },
];

function ReportsPage() {
  return (
    <>
      <PageHeader badge="Analytics" title="Reports"
        description="Interactive analytics and executive reporting."
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="mr-1.5 h-4 w-4" />PDF</Button>
            <Button size="sm"><Download className="mr-1.5 h-4 w-4" />Excel</Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Employees by country">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCountry} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="c" type="category" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} width={80} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                <Bar dataKey="v" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="Headcount by department">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byDept} innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value">
                  {byDept.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Report catalog">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {catalog.map((r) => (
              <div key={r.title} className="group flex items-center gap-4 rounded-xl border border-border p-4 transition-all hover:border-primary hover:bg-primary-soft">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary group-hover:bg-primary group-hover:text-primary-foreground"><r.icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">{r.desc}</div>
                </div>
                <Button variant="ghost" size="sm">Generate</Button>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
