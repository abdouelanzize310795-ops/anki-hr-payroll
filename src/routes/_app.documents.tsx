import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { FolderKanban, Upload, FileText, Folder, HardDrive } from "lucide-react";

export const Route = createFileRoute("/_app/documents")({ component: DocumentsPage });

const folders = [
  { name: "Contracts", count: 248, size: "142 MB" },
  { name: "Payslips", count: 1_680, size: "412 MB" },
  { name: "Policies", count: 34, size: "18 MB" },
  { name: "IDs & Compliance", count: 496, size: "224 MB" },
];
const recent = [
  { name: "Employment_Contract_A_Bello.pdf", size: "412 KB", by: "Amina K.", when: "1h ago" },
  { name: "Payslip_July_2026_K_Mensah.pdf", size: "108 KB", by: "Payroll bot", when: "3h ago" },
  { name: "Remote_Work_Policy_v2.pdf", size: "1.2 MB", by: "Zanele K.", when: "yesterday" },
];

function DocumentsPage() {
  return (
    <>
      <PageHeader badge="Vault" title="Documents"
        description="Employee & company documents, encrypted at rest."
        actions={<Button size="sm"><Upload className="mr-1.5 h-4 w-4" />Upload</Button>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Files" value="2,458" icon={FileText} accent="primary" />
        <StatCard label="Folders" value="42" icon={Folder} accent="gold" />
        <StatCard label="Storage" value="796 MB" icon={HardDrive} accent="success" />
        <StatCard label="Shared" value="184" icon={FolderKanban} accent="primary" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {folders.map((f) => (
          <div key={f.name} className="card-elevated group cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:shadow-glow">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-gold/15 text-gold-foreground group-hover:bg-gold group-hover:text-gold-foreground"><Folder className="h-5 w-5" /></div>
            <div className="font-medium">{f.name}</div>
            <div className="text-xs text-muted-foreground">{f.count} files • {f.size}</div>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <SectionCard title="Recent files">
          <div className="divide-y divide-border">
            {recent.map((r) => (
              <div key={r.name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary"><FileText className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.by} • {r.when}</div>
                </div>
                <div className="text-xs text-muted-foreground">{r.size}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
