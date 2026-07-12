import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck, Wallet, UserPlus, FileSignature, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_app/notifications")({ component: NotificationsPage });

const groups = [
  { day: "Today", items: [
    { icon: Wallet, t: "July payroll ready for approval", d: "Nigeria • 128 employees • $68.4K", when: "2h ago", unread: true, tint: "bg-primary-soft text-primary" },
    { icon: CalendarDays, t: "Fatou Ndiaye requested leave", d: "Aug 12 → Aug 16 (5 days)", when: "3h ago", unread: true, tint: "bg-gold/15 text-gold-foreground" },
    { icon: UserPlus, t: "3 new candidates applied", d: "Senior Product Designer role", when: "5h ago", unread: false, tint: "bg-success/10 text-success" },
  ]},
  { day: "Yesterday", items: [
    { icon: FileSignature, t: "Kwame Mensah signed his contract", d: "Employment agreement — Nigeria", when: "1d ago", unread: false, tint: "bg-primary-soft text-primary" },
  ]},
];

function NotificationsPage() {
  return (
    <>
      <PageHeader badge="Inbox" title="Notifications"
        description="Everything that needs your attention, in one place."
        actions={<Button variant="outline" size="sm"><CheckCheck className="mr-1.5 h-4 w-4" />Mark all read</Button>}
      />
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.day}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.day}</div>
            <SectionCard title="">
              <div className="divide-y divide-border">
                {g.items.map((n, i) => (
                  <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${n.tint}`}><n.icon className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">{n.t}</div>
                        {n.unread && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
                      </div>
                      <div className="text-xs text-muted-foreground">{n.d}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{n.when}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        ))}
      </div>
    </>
  );
}
