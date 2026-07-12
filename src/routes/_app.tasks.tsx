import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Flag } from "lucide-react";

export const Route = createFileRoute("/_app/tasks")({ component: TasksPage });

const cols = [
  { name: "To do", color: "bg-muted text-muted-foreground", items: [
    { t: "Prepare July payroll variance report", p: "High", a: "Nia W." },
    { t: "Draft new remote work policy", p: "Med", a: "Amina K." },
  ]},
  { name: "In progress", color: "bg-primary-soft text-primary", items: [
    { t: "Review Q3 headcount plan with CFO", p: "High", a: "Amina K." },
    { t: "Sourcing sprint — Senior Backend", p: "Med", a: "Fatou N." },
  ]},
  { name: "Review", color: "bg-gold/20 text-gold-foreground", items: [
    { t: "New onboarding flow — final check", p: "Low", a: "Zanele K." },
  ]},
  { name: "Done", color: "bg-success/15 text-success", items: [
    { t: "Compliance training rollout", p: "Med", a: "Kwame M." },
    { t: "Ghana office lease renewal", p: "High", a: "Amina K." },
  ]},
];

function TasksPage() {
  return (
    <>
      <PageHeader badge="Work" title="Tasks"
        description="Personal & team tasks across ANKIBAPAY."
        actions={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New task</Button>}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cols.map((c) => (
          <SectionCard key={c.name} title={`${c.name} • ${c.items.length}`}>
            <div className="space-y-2">
              {c.items.map((it, i) => (
                <div key={i} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-start gap-2">
                    <Checkbox className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{it.t}</div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]"><Flag className="mr-1 h-2.5 w-2.5" />{it.p}</Badge>
                        <span className="text-[11px] text-muted-foreground">{it.a}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        ))}
      </div>
    </>
  );
}
