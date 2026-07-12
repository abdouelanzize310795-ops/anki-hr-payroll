import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard } from "@/components/app/primitives";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TrendingUp, Star, Target, Award } from "lucide-react";

export const Route = createFileRoute("/_app/performance")({ component: PerformancePage });

const reviews = [
  { name: "Kwame Mensah", role: "Senior Developer", score: 4.7, goals: 92 },
  { name: "Aisha Bello", role: "Product Manager", score: 4.5, goals: 88 },
  { name: "Nia Wanjiru", role: "Payroll Analyst", score: 4.2, goals: 78 },
  { name: "Thabo Nkosi", role: "Sales Lead", score: 4.8, goals: 96 },
];

function PerformancePage() {
  return (
    <>
      <PageHeader badge="Growth" title="Performance"
        description="Reviews, OKRs and continuous feedback."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Avg score" value="4.4 / 5" icon={Star} accent="gold" />
        <StatCard label="OKR completion" value="82%" icon={Target} accent="success" />
        <StatCard label="Reviews done" value="186 / 248" icon={Award} accent="primary" />
        <StatCard label="Promotions Q3" value="14" icon={TrendingUp} accent="primary" />
      </div>
      <div className="mt-6">
        <SectionCard title="Top performers" description="Q3 2026 review cycle">
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
                <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary-soft text-primary text-xs">{r.name.split(" ").map(n=>n[0]).join("")}</AvatarFallback></Avatar>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.role}</span>
                  </div>
                  <div className="mt-1.5"><Progress value={r.goals} className="h-1.5" /></div>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-gold/15 px-2.5 py-1 text-sm font-semibold text-gold-foreground">
                  <Star className="h-3.5 w-3.5 fill-current" /> {r.score}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
