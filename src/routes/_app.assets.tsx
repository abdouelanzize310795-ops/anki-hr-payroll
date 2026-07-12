import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Laptop, Plus, Smartphone, Monitor, Package } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/assets")({ component: AssetsPage });

const assets = [
  { asset: "MacBook Pro 14 M3", sn: "MBP-2401", to: "Kwame Mensah", since: "2024-03-14", status: "Active" },
  { asset: "iPhone 15", sn: "IPH-1187", to: "Aisha Bello", since: "2024-06-02", status: "Active" },
  { asset: "Dell Ultrasharp 27", sn: "DUS-0892", to: "Nia Wanjiru", since: "2023-11-20", status: "Active" },
  { asset: "MacBook Air 13 M2", sn: "MBA-1104", to: "—", since: "—", status: "Pending" },
];

function AssetsPage() {
  return (
    <>
      <PageHeader badge="Inventory" title="Assets"
        description="Company equipment allocated to employees."
        actions={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Add asset</Button>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Laptops" value="196" icon={Laptop} accent="primary" />
        <StatCard label="Phones" value="128" icon={Smartphone} accent="gold" />
        <StatCard label="Monitors" value="112" icon={Monitor} accent="success" />
        <StatCard label="Unassigned" value="14" icon={Package} accent="destructive" />
      </div>
      <div className="mt-6">
        <SectionCard title="Asset registry">
          <Table>
            <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Serial</TableHead><TableHead>Assigned to</TableHead><TableHead>Since</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {assets.map((a) => (
                <TableRow key={a.sn}>
                  <TableCell className="font-medium">{a.asset}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{a.sn}</TableCell>
                  <TableCell>{a.to}</TableCell>
                  <TableCell className="text-muted-foreground">{a.since}</TableCell>
                  <TableCell><StatusPill status={a.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </>
  );
}
