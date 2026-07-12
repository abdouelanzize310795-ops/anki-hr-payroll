import { type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label, value, delta, trend = "up", icon: Icon, accent, deltaLabel = "vs mois dernier",
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down";
  icon: LucideIcon;
  accent?: "primary" | "gold" | "success" | "destructive";
  deltaLabel?: string;
}) {
  const accentBg = {
    primary: "bg-primary-soft text-primary",
    gold: "bg-gold/20 text-gold-foreground",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
  }[accent ?? "primary"];
  return (
    <Card className="card-elevated group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-glow">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <div className={cn("grid h-9 w-9 place-items-center rounded-xl", accentBg)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-4 font-display text-3xl font-bold tracking-tight">{value}</div>
        {delta && (
          <div className="mt-2 flex items-center gap-1 text-xs">
            <span className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
              trend === "up" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
            )}>
              {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {delta}
            </span>
            <span className="text-muted-foreground">{deltaLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SectionCard({
  title, action, children, description,
}: { title: string; action?: ReactNode; description?: string; children: ReactNode }) {
  return (
    <Card className="card-elevated">
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-4 pb-4">
        <div className="min-w-0">
          <CardTitle className="font-display text-base font-semibold">{title}</CardTitle>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const statusMap: Record<string, { label: string; className: string }> = {
  Active: { label: "Actif", className: "bg-success/10 text-success border-success/20" },
  Actif: { label: "Actif", className: "bg-success/10 text-success border-success/20" },
  Pending: { label: "En attente", className: "bg-gold/20 text-gold-foreground border-gold/30" },
  "En attente": { label: "En attente", className: "bg-gold/20 text-gold-foreground border-gold/30" },
  Draft: { label: "Brouillon", className: "bg-muted text-muted-foreground border-border" },
  Brouillon: { label: "Brouillon", className: "bg-muted text-muted-foreground border-border" },
  Approved: { label: "Approuvé", className: "bg-success/10 text-success border-success/20" },
  Approuvé: { label: "Approuvé", className: "bg-success/10 text-success border-success/20" },
  Rejected: { label: "Refusé", className: "bg-destructive/10 text-destructive border-destructive/20" },
  Refusé: { label: "Refusé", className: "bg-destructive/10 text-destructive border-destructive/20" },
  Paid: { label: "Payé", className: "bg-success/10 text-success border-success/20" },
  Payé: { label: "Payé", className: "bg-success/10 text-success border-success/20" },
  "On Leave": { label: "En congé", className: "bg-gold/20 text-gold-foreground border-gold/30" },
  "En congé": { label: "En congé", className: "bg-gold/20 text-gold-foreground border-gold/30" },
  Expired: { label: "Expiré", className: "bg-destructive/10 text-destructive border-destructive/20" },
  Expiré: { label: "Expiré", className: "bg-destructive/10 text-destructive border-destructive/20" },
  Annulé: { label: "Annulé", className: "bg-muted text-muted-foreground border-border" },
  Cancelled: { label: "Annulé", className: "bg-muted text-muted-foreground border-border" },
  Présent: { label: "Présent", className: "bg-success/10 text-success border-success/20" },
  Absent: { label: "Absent", className: "bg-destructive/10 text-destructive border-destructive/20" },
  Retard: { label: "Retard", className: "bg-gold/20 text-gold-foreground border-gold/30" },
  "Demi-journée": { label: "Demi-journée", className: "bg-muted text-muted-foreground border-border" },
  Télétravail: { label: "Télétravail", className: "bg-primary-soft text-primary border-primary/20" },
  Calculé: { label: "Calculé", className: "bg-primary-soft text-primary border-primary/20" },
  Ouvert: { label: "Ouvert", className: "bg-success/10 text-success border-success/20" },
  Fermé: { label: "Fermé", className: "bg-muted text-muted-foreground border-border" },
  Pourvu: { label: "Pourvu", className: "bg-primary-soft text-primary border-primary/20" },
  "En pause": { label: "En pause", className: "bg-gold/20 text-gold-foreground border-gold/30" },
  Inscrit: { label: "Inscrit", className: "bg-muted text-muted-foreground border-border" },
  "En cours": { label: "En cours", className: "bg-primary-soft text-primary border-primary/20" },
  Terminé: { label: "Terminé", className: "bg-success/10 text-success border-success/20" },
  Archivé: { label: "Archivé", className: "bg-muted text-muted-foreground border-border" },
  Soumis: { label: "Soumis", className: "bg-gold/20 text-gold-foreground border-gold/30" },
  Finalisé: { label: "Finalisé", className: "bg-success/10 text-success border-success/20" },
  Disponible: { label: "Disponible", className: "bg-muted text-muted-foreground border-border" },
  Affecté: { label: "Affecté", className: "bg-success/10 text-success border-success/20" },
  Maintenance: { label: "Maintenance", className: "bg-gold/20 text-gold-foreground border-gold/30" },
  Retiré: { label: "Retiré", className: "bg-muted text-muted-foreground border-border" },
  Inactif: { label: "Inactif", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export function StatusPill({ status }: { status: string }) {
  const entry = statusMap[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={cn("border font-medium", entry.className)}>
      {entry.label}
    </Badge>
  );
}

export function EmptyPlaceholder({
  title, description, icon: Icon,
}: { title: string; description: string; icon: LucideIcon }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-muted/30 p-12 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <div className="font-display text-lg font-semibold">{title}</div>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** Formats amounts with IBM Plex Mono tabular figures (charter rule). */
export function Money({
  value,
  currency = "KMF",
  className,
}: {
  value: string | number;
  currency?: string;
  className?: string;
}) {
  const display = typeof value === "number"
    ? new Intl.NumberFormat("fr-KM", { maximumFractionDigits: 0 }).format(value)
    : value;
  return (
    <span className={cn("amount", className)}>
      {display} {currency}
    </span>
  );
}
