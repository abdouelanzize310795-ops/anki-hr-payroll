import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, CreditCard, Download } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/subscriptions")({ component: SubscriptionsPage });

const plans = [
  { name: "Starter", price: "$4", per: "employee / month", features: ["Up to 25 employees", "Core HR", "Basic payroll", "Community support"], cta: "Downgrade" },
  { name: "Pro", price: "$8", per: "employee / month", featured: true, features: ["Up to 500 employees", "Full HR + payroll", "AI assistant", "Priority support", "Multi-country"], cta: "Current plan" },
  { name: "Enterprise", price: "Custom", per: "annual license", features: ["Unlimited employees", "Dedicated CSM", "SSO / SAML", "Custom integrations", "SLA 99.9%"], cta: "Contact sales" },
];

const invoices = [
  { id: "INV-2026-07", date: "Jul 01, 2026", amount: "$1,984", status: "Paid" },
  { id: "INV-2026-06", date: "Jun 01, 2026", amount: "$1,872", status: "Paid" },
  { id: "INV-2026-05", date: "May 01, 2026", amount: "$1,760", status: "Paid" },
];

function SubscriptionsPage() {
  return (
    <>
      <PageHeader badge="Billing" title="Subscriptions"
        description="Manage your ANKIBAPAY plan, invoices and licenses."
        actions={<Button size="sm"><CreditCard className="mr-1.5 h-4 w-4" />Payment method</Button>}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.name} className={`relative rounded-2xl border p-6 ${p.featured ? "border-primary bg-primary-soft/40 shadow-glow" : "border-border bg-card"}`}>
            {p.featured && <Badge className="absolute right-4 top-4 bg-gold text-gold-foreground border-0"><Sparkles className="mr-1 h-3 w-3" />Current</Badge>}
            <div className="font-display text-lg font-bold">{p.name}</div>
            <div className="mt-3 flex items-baseline gap-1"><span className="font-display text-3xl font-bold">{p.price}</span><span className="text-xs text-muted-foreground">{p.per}</span></div>
            <ul className="mt-5 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{f}</span></li>
              ))}
            </ul>
            <Button className="mt-6 w-full" variant={p.featured ? "outline" : "default"}>{p.cta}</Button>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <SectionCard title="Invoices" action={<Button variant="outline" size="sm"><Download className="mr-1.5 h-4 w-4" />Download all</Button>}>
          <Table>
            <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.id}</TableCell>
                  <TableCell>{i.date}</TableCell>
                  <TableCell className="font-semibold">{i.amount}</TableCell>
                  <TableCell><StatusPill status={i.status} /></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm">Download</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </>
  );
}
