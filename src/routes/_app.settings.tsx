import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Building2, Users, Bell, Lock, Palette } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

const sections = [
  { icon: Building2, t: "Workspace", d: "Company profile, branding, legal info." },
  { icon: Users, t: "Team & roles", d: "Users, permissions, RBAC." },
  { icon: Bell, t: "Notifications", d: "Email, SMS, in-app preferences." },
  { icon: Lock, t: "Security", d: "SSO, MFA, audit logs, IP allow-list." },
  { icon: Palette, t: "Appearance", d: "Theme, density, accent." },
];

function SettingsPage() {
  return (
    <>
      <PageHeader badge="Preferences" title="Settings" description="Manage your workspace, security & appearance." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="space-y-1">
          {sections.map((s, i) => (
            <button key={s.t} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${i === 0 ? "bg-primary-soft text-primary font-medium" : "text-muted-foreground hover:bg-muted"}`}>
              <s.icon className="h-4 w-4" /> {s.t}
            </button>
          ))}
        </nav>
        <div className="space-y-6">
          <SectionCard title="Workspace profile">
            <div className="mb-6 flex items-center gap-4">
              <Avatar className="h-16 w-16"><AvatarFallback className="brand-gradient text-primary-foreground text-lg font-bold">B</AvatarFallback></Avatar>
              <div>
                <Button variant="outline" size="sm">Change logo</Button>
                <p className="mt-1 text-xs text-muted-foreground">PNG or SVG, max 2MB.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><Label>Company name</Label><Input defaultValue="Baobab Financial Group" className="mt-1.5" /></div>
              <div><Label>Country</Label><Input defaultValue="Côte d'Ivoire" className="mt-1.5" /></div>
              <div><Label>Legal number</Label><Input defaultValue="CI-2018-BF-0429" className="mt-1.5" /></div>
              <div><Label>Currency</Label><Input defaultValue="XOF (CFA)" className="mt-1.5" /></div>
            </div>
          </SectionCard>
          <SectionCard title="Preferences">
            {[
              { l: "Dark mode", d: "Follow system unless overridden.", on: false },
              { l: "Email digests", d: "Daily summary of what needs attention.", on: true },
              { l: "AI suggestions", d: "Show inline suggestions from ANKIBAPAY AI.", on: true },
            ].map((p) => (
              <div key={p.l} className="flex items-center justify-between border-b border-border py-3 last:border-0">
                <div><div className="text-sm font-medium">{p.l}</div><div className="text-xs text-muted-foreground">{p.d}</div></div>
                <Switch defaultChecked={p.on} />
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
