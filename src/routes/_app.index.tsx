import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { StatCard, SectionCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Users, Wallet, Clock, UserPlus, Plus, Download, TrendingUp, ArrowRight,
  CalendarDays, FileSignature,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

const payrollData = [
  { m: "Jan", gross: 182, net: 148 }, { m: "Feb", gross: 191, net: 155 },
  { m: "Mar", gross: 205, net: 166 }, { m: "Apr", gross: 213, net: 172 },
  { m: "May", gross: 224, net: 181 }, { m: "Jun", gross: 236, net: 190 },
  { m: "Jul", gross: 248, net: 200 },
];
const attendance = [
  { d: "Mon", p: 234 }, { d: "Tue", p: 241 }, { d: "Wed", p: 239 },
  { d: "Thu", p: 228 }, { d: "Fri", p: 220 }, { d: "Sat", p: 96 }, { d: "Sun", p: 42 },
];
const pipeline = [
  { name: "Sourced", value: 128, color: "var(--chart-1)" },
  { name: "Screened", value: 64, color: "var(--chart-2)" },
  { name: "Interview", value: 32, color: "var(--chart-3)" },
  { name: "Offer", value: 12, color: "var(--chart-4)" },
];

const activity = [
  { who: "Fatou Ndiaye", what: "submitted a leave request", when: "2m ago", init: "FN" },
  { who: "Payroll bot", what: "generated July payslips (248)", when: "1h ago", init: "PB" },
  { who: "Kwame Mensah", what: "signed employment contract", when: "3h ago", init: "KM" },
  { who: "Amina Kouassi", what: "approved 4 expense claims", when: "5h ago", init: "AK" },
  { who: "Thabo Nkosi", what: "completed onboarding", when: "yesterday", init: "TN" },
];

const approvals = [
  { title: "July 2026 Payroll — Kenya", amount: "KES 12.4M", type: "Payroll", by: "Nia W." },
  { title: "Leave — 5 days annual", amount: "Aug 12 → 16", type: "Leave", by: "Kwame M." },
  { title: "Contract renewal — Senior Dev", amount: "24 months", type: "Contract", by: "Fatou N." },
  { title: "Expense reimbursement", amount: "$1,240", type: "Expense", by: "Thabo N." },
];

const contracts = [
  { name: "Aisha Bello", role: "Product Manager", country: "Nigeria", ends: "in 12 days", status: "Active" },
  { name: "Jean-Luc Diop", role: "DevOps Engineer", country: "Senegal", ends: "in 21 days", status: "Pending" },
  { name: "Zanele Khumalo", role: "HR Business Partner", country: "South Africa", ends: "in 34 days", status: "Active" },
];

function DashboardPage() {
  return (
    <>
      <PageHeader
        badge="Overview"
        title="Good morning, Amina"
        description="Here's what's happening across your workforce today."
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="mr-1.5 h-4 w-4" /> Export</Button>
            <Button size="sm" className="bg-primary"><Plus className="mr-1.5 h-4 w-4" /> Quick action</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total employees" value="248" delta="+12" trend="up" icon={Users} accent="primary" />
        <StatCard label="Monthly payroll" value="$248.4K" delta="+5.2%" trend="up" icon={Wallet} accent="gold" />
        <StatCard label="Attendance rate" value="94.6%" delta="+1.8%" trend="up" icon={Clock} accent="success" />
        <StatCard label="Open positions" value="18" delta="-3" trend="down" icon={UserPlus} accent="destructive" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard
            title="Payroll trend"
            description="Gross vs net payroll — last 7 months ($K)"
            action={<Button variant="ghost" size="sm">Last 7 months <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>}
          >
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={payrollData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-gold)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-gold)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                  <Area type="monotone" dataKey="gross" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#g1)" />
                  <Area type="monotone" dataKey="net" stroke="var(--color-gold)" strokeWidth={2.5} fill="url(#g2)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Recruitment funnel" description="Active pipeline this quarter">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pipeline} innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pipeline.map((p, i) => <Cell key={i} fill={p.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Weekly attendance" description="Employees present this week">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendance}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="d" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                <Bar dataKey="p" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard
            title="Pending approvals"
            description="4 items waiting on you"
            action={<Button variant="outline" size="sm">Review all</Button>}
          >
            <div className="divide-y divide-border">
              {approvals.map((a) => (
                <div key={a.title} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <FileSignature className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground">Requested by {a.by} • {a.type}</div>
                  </div>
                  <div className="hidden text-right text-sm font-semibold text-foreground sm:block">{a.amount}</div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm">Reject</Button>
                    <Button size="sm">Approve</Button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Recent activity" description="What's happening across your organisation">
            <div className="space-y-4">
              {activity.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary-soft text-primary text-xs font-semibold">{a.init}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm"><span className="font-medium">{a.who}</span> <span className="text-muted-foreground">{a.what}</span></div>
                    <div className="text-xs text-muted-foreground">{a.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Expiring contracts" description="Next 30 days" action={<Button variant="ghost" size="sm">View all</Button>}>
          <div className="space-y-4">
            {contracts.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <Avatar className="h-9 w-9"><AvatarFallback className="bg-gold/20 text-gold-foreground text-xs font-semibold">{c.name.split(" ").map(n => n[0]).join("")}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.role} • {c.country}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium">{c.ends}</div>
                  <StatusPill status={c.status} />
                </div>
              </div>
            ))}
            <div className="pt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5"><span>Renewal rate</span><span className="font-medium text-foreground">86%</span></div>
              <Progress value={86} className="h-1.5" />
            </div>
          </SectionCard>
        </SectionCard>
      </div>
    </>
  );
}
