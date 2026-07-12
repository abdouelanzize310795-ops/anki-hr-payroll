import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Server, Users, AlertTriangle, Activity } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/admin")({ component: AdminPage });

const logs = [
  { user: "amina@baobab.ci", action: "Approved payroll — Nigeria", ip: "196.245.12.44", when: "2m ago", status: "Approved" },
  { user: "system", action: "Nightly backup completed", ip: "internal", when: "3h ago", status: "Active" },
  { user: "root@ankibapay", action: "Rotated encryption key", ip: "10.0.0.4", when: "yesterday", status: "Active" },
  { user: "unknown", action: "5 failed login attempts", ip: "89.144.12.7", when: "yesterday", status: "Rejected" },
];

function AdminPage() {
  return (
    <>
      <PageHeader badge="Platform" title="Super Admin"
        description="Tenants, infrastructure & audit."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tenants" value="128" icon={ShieldCheck} accent="primary" />
        <StatCard label="Active users" value="4,286" icon={Users} accent="gold" />
        <StatCard label="Uptime" value="99.98%" icon={Server} accent="success" />
        <StatCard label="Security alerts" value="2" icon={AlertTriangle} accent="destructive" />
      </div>
      <div className="mt-6">
        <SectionCard title="Audit log" description="System-wide events (last 24h)" action={<Button variant="outline" size="sm"><Activity className="mr-1.5 h-4 w-4" />Live feed</Button>}>
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>IP</TableHead><TableHead>When</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{l.user}</TableCell>
                  <TableCell className="font-medium">{l.action}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{l.ip}</TableCell>
                  <TableCell className="text-muted-foreground">{l.when}</TableCell>
                  <TableCell><StatusPill status={l.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </>
  );
}
