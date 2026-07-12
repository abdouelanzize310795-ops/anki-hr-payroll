import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Plus, BookOpen, Award, Users2 } from "lucide-react";

export const Route = createFileRoute("/_app/training")({ component: TrainingPage });

const courses = [
  { title: "Leadership Essentials", cat: "Management", enrolled: 42, done: 78, dur: "6h" },
  { title: "Advanced React & TypeScript", cat: "Engineering", enrolled: 28, done: 64, dur: "12h" },
  { title: "GDPR & Data Compliance", cat: "Compliance", enrolled: 248, done: 91, dur: "2h" },
  { title: "Sales Negotiation Masterclass", cat: "Sales", enrolled: 34, done: 55, dur: "8h" },
];

function TrainingPage() {
  return (
    <>
      <PageHeader badge="Learning" title="Training"
        description="Upskill your workforce and track compliance."
        actions={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New course</Button>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active courses" value="24" icon={BookOpen} accent="primary" />
        <StatCard label="Enrollments" value="1,204" icon={Users2} accent="gold" />
        <StatCard label="Certificates" value="386" icon={Award} accent="success" />
        <StatCard label="Avg completion" value="72%" icon={GraduationCap} accent="primary" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {courses.map((c) => (
          <SectionCard key={c.title} title={c.title}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="bg-primary-soft text-primary border-0">{c.cat}</Badge>
              <Badge variant="outline">{c.dur}</Badge>
              <span className="text-xs text-muted-foreground">{c.enrolled} enrolled</span>
            </div>
            <div className="mb-1.5 flex justify-between text-xs"><span className="text-muted-foreground">Avg completion</span><span className="font-medium">{c.done}%</span></div>
            <Progress value={c.done} className="h-1.5" />
          </SectionCard>
        ))}
      </div>
    </>
  );
}
