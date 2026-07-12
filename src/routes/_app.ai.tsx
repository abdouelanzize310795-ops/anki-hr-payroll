import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Zap, FileText, MessageSquare, Wand2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/ai")({ component: AiPage });

const skills = [
  { icon: FileText, t: "Draft contracts", d: "Employment, NDA, consultancy — localised per country." },
  { icon: Wand2, t: "Generate HR reports", d: "Headcount, cost, DEI, retention insights." },
  { icon: MessageSquare, t: "Employee Q&A", d: "Answer questions on policies, payroll and leave." },
  { icon: Search, t: "Natural language search", d: "Ask about anyone, any policy, any number." },
];

function AiPage() {
  return (
    <>
      <PageHeader badge="AI" title="ANKIBAPAY AI"
        description="Your co-pilot for HR, payroll and workforce operations."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Conversations" value="1,284" icon={MessageSquare} accent="primary" />
        <StatCard label="Documents generated" value="342" icon={FileText} accent="gold" />
        <StatCard label="Time saved (est.)" value="184h" icon={Zap} accent="success" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Ask ANKIBAPAY AI">
            <div className="rounded-2xl bg-muted/40 p-6">
              <div className="mx-auto max-w-xl text-center">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl brand-gradient shadow-glow"><Sparkles className="h-6 w-6 text-primary-foreground" /></div>
                <div className="font-display text-xl font-bold">How can I help today?</div>
                <p className="mt-1 text-sm text-muted-foreground">Ask about payroll, employees, contracts or generate a document.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {["Draft an offer letter", "This month's payroll summary", "Who's on leave next week?"].map((s) => (
                    <Badge key={s} variant="outline" className="cursor-pointer hover:border-primary hover:bg-primary-soft">{s}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <Textarea placeholder="Type your question or command…" rows={2} className="resize-none" />
              <Button size="icon" className="shrink-0"><Send className="h-4 w-4" /></Button>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="What I can do">
          <div className="space-y-3">
            {skills.map((s) => (
              <div key={s.t} className="flex items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><s.icon className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{s.t}</div>
                  <div className="text-xs text-muted-foreground">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
