import { type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label, value, delta, trend = "up", icon: Icon, accent,
}: {
  label: string; value: string; delta?: string; trend?: "up" | "down";
  icon: any; accent?: "primary" | "gold" | "success" | "destructive";
}) {
  const accentBg = {
    primary: "bg-primary-soft text-primary",
    gold: "bg-gold/15 text-gold-foreground",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
  }[accent ?? "primary"];
  return (
    <Card className="card-elevated group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-glow">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
          <div className={cn("grid h-9 w-9 place-items-center rounded-xl", accentBg)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-4 font-display text-3xl font-bold tracking-tight">{value}</div>
        {delta && (
          <div className="mt-2 flex items-center gap-1 text-xs">
            <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
              trend === "up" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
              {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {delta}
            </span>
            <span className="text-muted-foreground">vs last month</span>
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

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Active: "bg-success/10 text-success border-success/20",
    Pending: "bg-gold/15 text-gold-foreground border-gold/30",
    Draft: "bg-muted text-muted-foreground border-border",
    Approved: "bg-success/10 text-success border-success/20",
    Rejected: "bg-destructive/10 text-destructive border-destructive/20",
    Paid: "bg-success/10 text-success border-success/20",
    "On Leave": "bg-gold/15 text-gold-foreground border-gold/30",
    Expired: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return (
    <Badge variant="outline" className={cn("font-medium border", map[status] ?? "bg-muted text-muted-foreground")}>
      {status}
    </Badge>
  );
}

export function EmptyPlaceholder({ title, description, icon: Icon }: { title: string; description: string; icon: any }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-muted/30 p-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary mb-4">
        <Icon className="h-6 w-6" />
      </div>
      <div className="font-display text-lg font-semibold">{title}</div>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
