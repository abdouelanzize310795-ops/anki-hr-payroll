import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Plus, Briefcase, Users2, Target, Trophy } from "lucide-react";

export const Route = createFileRoute("/_app/recruitment")({ component: RecruitmentPage });

const stages = [
  { name: "Sourced", count: 128, color: "bg-primary/10 text-primary" },
  { name: "Screened", count: 64, color: "bg-chart-3/15 text-chart-3" },
  { name: "Interview", count: 32, color: "bg-gold/20 text-gold-foreground" },
  { name: "Offer", count: 12, color: "bg-success/15 text-success" },
  { name: "Hired", count: 5, color: "bg-primary text-primary-foreground" },
];

const jobs = [
  { title: "Senior Product Designer", loc: "Lagos • Remote", apps: 42, days: 12 },
  { title: "DevOps Engineer", loc: "Nairobi", apps: 28, days: 8 },
  { title: "Financial Controller", loc: "Casablanca", apps: 19, days: 21 },
  { title: "Sales Manager, West Africa", loc: "Dakar", apps: 34, days: 5 },
];

function RecruitmentPage() {
  return (
    <>
      <PageHeader badge="Talent" title="Recruitment"
        description="Track your pipeline from sourced to hired."
        actions={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New job</Button>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open roles" value="18" icon={Briefcase} accent="primary" />
        <StatCard label="Candidates" value="241" icon={Users2} accent="gold" />
        <StatCard label="Time to hire" value="22d" delta="-4d" trend="up" icon={Target} accent="success" />
        <StatCard label="Offer rate" value="34%" delta="+6%" trend="up" icon={Trophy} accent="primary" />
      </div>

      <div className="mt-6">
        <SectionCard title="Pipeline" description="Kanban view of active candidates">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {stages.map((s) => (
              <div key={s.name} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.name}</div>
                  <Badge className={s.color}>{s.count}</Badge>
                </div>
                <div className="space-y-2">
                  {[1,2,3].map((i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7"><AvatarFallback className="bg-primary-soft text-primary text-[10px]">C{i}</AvatarFallback></Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">Candidate {i}</div>
                          <div className="truncate text-[10px] text-muted-foreground">Senior Dev</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Open positions">
          <div className="divide-y divide-border">
            {jobs.map((j) => (
              <div key={j.title} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary"><UserPlus className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{j.title}</div>
                  <div className="text-xs text-muted-foreground">{j.loc}</div>
                </div>
                <div className="hidden text-right sm:block">
                  <div className="text-sm font-semibold">{j.apps} applicants</div>
                  <div className="text-xs text-muted-foreground">Open {j.days}d</div>
                </div>
                <Button variant="outline" size="sm">View</Button>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
