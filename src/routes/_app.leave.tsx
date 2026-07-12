import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { CalendarDays, Plus, Umbrella, Stethoscope, Baby } from "lucide-react";

export const Route = createFileRoute("/_app/leave")({ component: LeavePage });

const requests = [
  { who: "Fatou Ndiaye", type: "Annual leave", from: "Aug 12", to: "Aug 16", days: 5, status: "Pending" },
  { who: "Kwame Mensah", type: "Sick leave", from: "Aug 3", to: "Aug 4", days: 2, status: "Approved" },
  { who: "Aisha Bello", type: "Maternity", from: "Sep 1", to: "Dec 1", days: 92, status: "Approved" },
  { who: "Thabo Nkosi", type: "Unpaid", from: "Aug 20", to: "Aug 22", days: 3, status: "Rejected" },
];

function LeavePage() {
  return (
    <>
      <PageHeader badge="Time off" title="Leave management"
        description="Requests, balances and calendar."
        actions={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New request</Button>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="On leave today" value="8" icon={Umbrella} accent="gold" />
        <StatCard label="Sick" value="3" icon={Stethoscope} accent="destructive" />
        <StatCard label="Parental" value="2" icon={Baby} accent="primary" />
        <StatCard label="Pending" value="6" icon={CalendarDays} accent="primary" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Requests">
            <div className="divide-y divide-border">
              {requests.map((r) => (
                <div key={r.who + r.from} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary-soft text-primary text-xs">{r.who.split(" ").map(n=>n[0]).join("")}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{r.who} <span className="font-normal text-muted-foreground">• {r.type}</span></div>
                    <div className="text-xs text-muted-foreground">{r.from} → {r.to} ({r.days} days)</div>
                  </div>
                  <StatusPill status={r.status} />
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
        <SectionCard title="My balance">
          {[
            { l: "Annual", used: 8, total: 22 },
            { l: "Sick", used: 2, total: 10 },
            { l: "Personal", used: 1, total: 5 },
          ].map((b) => (
            <div key={b.l} className="mb-4 last:mb-0">
              <div className="mb-1.5 flex justify-between text-xs"><span className="font-medium">{b.l}</span><span className="text-muted-foreground">{b.used} / {b.total} days</span></div>
              <Progress value={(b.used / b.total) * 100} className="h-1.5" />
            </div>
          ))}
        </SectionCard>
      </div>
    </>
  );
}
