import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatusPill, StatCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Building2, Plus, Search, Users, Globe2, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_app/companies")({
  component: CompaniesPage,
});

const companies = [
  { name: "Baobab Financial Group", country: "Côte d'Ivoire", employees: 128, plan: "Enterprise", status: "Active", growth: "+12%" },
  { name: "Sahara Logistics", country: "Morocco", employees: 64, plan: "Pro", status: "Active", growth: "+4%" },
  { name: "Kilimanjaro Tech", country: "Kenya", employees: 42, plan: "Pro", status: "Active", growth: "+18%" },
  { name: "Zambezi Health", country: "Zambia", employees: 14, plan: "Starter", status: "Pending", growth: "—" },
];

function CompaniesPage() {
  return (
    <>
      <PageHeader
        badge="Multi-company"
        title="Companies"
        description="Manage the entities under your ANKIBAPAY workspace."
        actions={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Add company</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Companies" value="4" icon={Building2} accent="primary" />
        <StatCard label="Total employees" value="248" icon={Users} accent="gold" />
        <StatCard label="Countries" value="4" icon={Globe2} accent="success" />
      </div>

      <div className="mt-6">
        <SectionCard
          title="All companies"
          action={
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search…" className="pl-8 h-9 w-56" />
            </div>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Growth</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.name} className="cursor-pointer">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary text-primary-foreground text-xs">{c.name.split(" ").map(w => w[0]).slice(0,2).join("")}</AvatarFallback></Avatar>
                      <div className="font-medium">{c.name}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.country}</TableCell>
                  <TableCell>{c.employees}</TableCell>
                  <TableCell><span className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">{c.plan}</span></TableCell>
                  <TableCell className="text-success font-medium">{c.growth}</TableCell>
                  <TableCell><StatusPill status={c.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </>
  );
}
