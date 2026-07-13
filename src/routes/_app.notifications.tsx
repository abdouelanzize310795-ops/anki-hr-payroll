import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, SectionCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  Bell, CheckCheck, Wallet, FileSignature, CalendarDays, Flag, Building2, Headphones,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listCompanies } from "@/modules/companies/company.functions";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/modules/notifications/notification.functions";
import type { CompanyWithMeta } from "@/modules/companies/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

const appRouteApi = getRouteApi("/_app");

const kindIcon = {
  payroll: Wallet,
  leave: CalendarDays,
  contract: FileSignature,
  attendance: Bell,
  task: Flag,
  helpdesk: Headphones,
} as const;

const kindTint = {
  payroll: "bg-primary-soft text-primary",
  leave: "bg-gold/15 text-gold-foreground",
  contract: "bg-primary-soft text-primary",
  attendance: "bg-success/10 text-success",
  task: "bg-destructive/10 text-destructive",
  helpdesk: "bg-primary-soft text-primary",
} as const;

function NotificationsPage() {
  const { auth } = appRouteApi.useRouteContext();
  const admin = isPlatformAdmin(auth);
  const profileCompanyId = auth.profile?.company_id ?? null;

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [companyFilter, setCompanyFilter] = useState(profileCompanyId ?? "all");
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ap_notif_read");
      if (raw) setReadIds(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listNotifications({ data: { companyId: effectiveCompanyId } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      if (admin) setCompanies(await listCompanies());
    })();
  }, [admin]);

  useEffect(() => {
    void load();
  }, [companyFilter, lockedCompanyId]);

  const markAllRead = () => {
    const next = new Set(items.map((i) => i.id));
    setReadIds(next);
    localStorage.setItem("ap_notif_read", JSON.stringify([...next]));
    void markAllNotificationsRead();
  };

  const markOneRead = (id: string) => {
    const next = new Set(readIds);
    next.add(id);
    setReadIds(next);
    localStorage.setItem("ap_notif_read", JSON.stringify([...next]));
    if (!id.startsWith("pay-") && !id.startsWith("ctr-") && !id.startsWith("task-")) {
      void markNotificationRead({ data: { id } });
    }
  };

  const visible = items.map((i) => ({
    ...i,
    unread: i.unread && !readIds.has(i.id),
  }));

  return (
    <>
      <PageHeader
        badge="Boîte"
        title="Notifications"
        description="Paie, congés, contrats et tâches prioritaires."
        actions={
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="mr-1.5 h-4 w-4" />
            Tout marquer lu
          </Button>
        }
      />

      {admin && (
        <div className="mb-4">
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les entreprises</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : visible.length === 0 ? (
        <EmptyPlaceholder
          title="Aucune notification"
          description="Les demandes de congé, cycles de paie à approuver et contrats apparaissent ici."
          icon={Bell}
        />
      ) : (
        <SectionCard title="À traiter" description={`${visible.filter((v) => v.unread).length} non lu(s)`}>
          <div className="divide-y divide-border">
            {visible.map((n) => {
              const Icon = kindIcon[n.kind];
              return (
                <div key={n.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${kindTint[n.kind]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.unread && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{n.description}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{n.when}</div>
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <a href={n.href} onClick={() => markOneRead(n.id)}>Ouvrir</a>
                  </Button>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
    </>
  );
}
