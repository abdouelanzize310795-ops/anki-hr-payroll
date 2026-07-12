import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, LogIn, LogOut, Timer, Download } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export const Route = createFileRoute("/_app/attendance")({ component: AttendancePage });

const monthly = Array.from({ length: 30 }, (_, i) => ({ d: i + 1, h: 6 + Math.round(Math.random() * 4) }));

function AttendancePage() {
  return (
    <>
      <PageHeader badge="Time" title="Attendance"
        description="Clock-in, clock-out and worked hours across the workforce."
        actions={<Button variant="outline" size="sm"><Download className="mr-1.5 h-4 w-4" />Export timesheet</Button>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Present today" value="234" icon={LogIn} accent="success" />
        <StatCard label="Late" value="12" icon={Clock} accent="gold" />
        <StatCard label="Overtime" value="184h" icon={Timer} accent="primary" />
        <StatCard label="Absent" value="6" icon={LogOut} accent="destructive" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Worked hours" description="Company average per day (this month)">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="d" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                  <Bar dataKey="h" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>
        <SectionCard title="Department utilization">
          <div className="space-y-4">
            {[
              { d: "Engineering", v: 92 },
              { d: "Sales", v: 88 },
              { d: "People", v: 76 },
              { d: "Finance", v: 81 },
              { d: "Operations", v: 69 },
            ].map((r) => (
              <div key={r.d}>
                <div className="mb-1.5 flex justify-between text-xs"><span className="font-medium">{r.d}</span><span className="text-muted-foreground">{r.v}%</span></div>
                <Progress value={r.v} className="h-1.5" />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
