import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSignature, Plus, FileCheck2, FileClock, FileX2 } from "lucide-react";

export const Route = createFileRoute("/_app/contracts")({ component: ContractsPage });

const rows = [
  { emp: "Aisha Bello", type: "Permanent (CDI)", start: "2023-04-01", end: "—", status: "Active" },
  { emp: "Jean-Luc Diop", type: "Fixed-term (CDD)", start: "2025-02-15", end: "2026-08-14", status: "Pending" },
  { emp: "Fatou Ndiaye", type: "Permanent (CDI)", start: "2022-09-10", end: "—", status: "Active" },
  { emp: "Consultant, K. Osei", type: "Consultancy", start: "2026-06-01", end: "2026-11-30", status: "Draft" },
  { emp: "Prior contract, T. Nkosi", type: "Fixed-term (CDD)", start: "2024-01-01", end: "2025-12-31", status: "Expired" },
];

function ContractsPage() {
  return (
    <>
      <PageHeader badge="Legal" title="Contracts"
        description="Employment, fixed-term & consultancy contracts across all entities."
        actions={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New contract</Button>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active" value="221" icon={FileCheck2} accent="success" />
        <StatCard label="Expiring 30d" value="9" icon={FileClock} accent="gold" />
        <StatCard label="Drafts" value="4" icon={FileSignature} accent="primary" />
        <StatCard label="Expired" value="14" icon={FileX2} accent="destructive" />
      </div>
      <div className="mt-6">
        <SectionCard title="All contracts">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.emp}>
                  <TableCell className="font-medium">{r.emp}</TableCell>
                  <TableCell className="text-muted-foreground">{r.type}</TableCell>
                  <TableCell>{r.start}</TableCell>
                  <TableCell>{r.end}</TableCell>
                  <TableCell><StatusPill status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </>
  );
}
