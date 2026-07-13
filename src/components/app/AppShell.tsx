import { Link, getRouteApi, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Building2, Users, UserPlus, FileSignature, Clock,
  CalendarDays, Wallet, Calculator, GraduationCap, TrendingUp, ListTodo,
  FolderKanban, Laptop, BarChart3, Bell, Sparkles, Settings, ShieldCheck,
  CreditCard, Search, Command as CommandIcon, Sun, Moon, ChevronRight, LogOut,
  Landmark, Headphones,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnkibaPayLogo } from "@/components/brand/AnkibaPayLogo";
import { brand } from "@/lib/brand";
import { isPlatformAdmin, signOut, subscriptionDaysRemaining } from "@/lib/auth/auth.functions";
import { getUserRole, NAV_BY_ROLE } from "@/lib/auth/roles";
import { listEmployees } from "@/modules/employees/employee.functions";
import { listNotifications } from "@/modules/notifications/notification.functions";
import { AiAssistant } from "./AiAssistant";

const appRouteApi = getRouteApi("/_app");

function useAuthUser() {
  return appRouteApi.useRouteContext().auth;
}

function initialsFromName(name: string | null | undefined, email: string) {
  if (name?.trim()) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }
  return email.slice(0, 2).toUpperCase();
}

const roleLabels: Record<string, string> = {
  platform_admin: "Admin plateforme",
  employer: "Employeur",
  hr: "RH",
  manager: "Manager",
  employee: "Employé",
};

type NavItem = { title: string; url: string; icon: LucideIcon };

const primary: NavItem[] = [
  { title: "Tableau de bord", url: "/", icon: LayoutDashboard },
  { title: "Entreprises", url: "/companies", icon: Building2 },
  { title: "Employés", url: "/employees", icon: Users },
  { title: "Recrutement", url: "/recruitment", icon: UserPlus },
  { title: "Contrats", url: "/contracts", icon: FileSignature },
];

const workforce: NavItem[] = [
  { title: "Pointage", url: "/attendance", icon: Clock },
  { title: "Congés", url: "/leave", icon: CalendarDays },
  { title: "Helpdesk", url: "/helpdesk", icon: Headphones },
  { title: "Paie", url: "/payroll", icon: Wallet },
  { title: "Comptabilité", url: "/accounting", icon: Calculator },
  { title: "Virements", url: "/transfers", icon: Landmark },
];

const growth: NavItem[] = [
  { title: "Formation", url: "/training", icon: GraduationCap },
  { title: "Performance", url: "/performance", icon: TrendingUp },
  { title: "Tâches", url: "/tasks", icon: ListTodo },
];

const ops: NavItem[] = [
  { title: "Documents", url: "/documents", icon: FolderKanban },
  { title: "Actifs", url: "/assets", icon: Laptop },
  { title: "Rapports", url: "/reports", icon: BarChart3 },
  { title: "Notifications", url: "/notifications", icon: Bell },
];

const system: NavItem[] = [
  { title: "Assistant IA", url: "/ai", icon: Sparkles },
  { title: "Abonnements", url: "/subscriptions", icon: CreditCard },
  { title: "Super Admin", url: "/admin", icon: ShieldCheck },
  { title: "Paramètres", url: "/settings", icon: Settings },
];

/** Console SaaS — distinct from tenant RH workspace */
const consoleOverview: NavItem[] = [
  { title: "Vue plateforme", url: "/", icon: LayoutDashboard },
  { title: "Console admin", url: "/admin", icon: ShieldCheck },
];

const consoleTenants: NavItem[] = [
  { title: "Entreprises", url: "/companies", icon: Building2 },
];

const consoleAccount: NavItem[] = [
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Paramètres", url: "/settings", icon: Settings },
];

const allNav = [...primary, ...workforce, ...growth, ...ops, ...system, ...consoleOverview, ...consoleTenants, ...consoleAccount];

const PLAN_SEAT_LIMIT = 100;

function filterNav(items: NavItem[], allowed: Set<string>): NavItem[] {
  return items.filter((i) => allowed.has(i.url));
}

function NavSection({ label, items, currentPath }: { label: string; items: NavItem[]; currentPath: string }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  if (items.length === 0) return null;
  return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/50">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = item.url === "/" ? currentPath === "/" : currentPath.startsWith(item.url);
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                  <Link to={item.url} className="group">
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function BrandMark({ consoleMode }: { consoleMode?: boolean }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      {collapsed ? (
        <AnkibaPayLogo variant="icon" className="h-9 w-9" />
      ) : (
        <div className="min-w-0">
          <AnkibaPayLogo variant="full-dark" className="h-11 w-auto max-w-[190px]" />
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-gold">
            {consoleMode ? "Console plateforme" : brand.tagline}
          </div>
        </div>
      )}
    </div>
  );
}

function AppSidebar({ currentPath }: { currentPath: string }) {
  const auth = useAuthUser();
  const role = getUserRole(auth);
  const admin = isPlatformAdmin(auth);
  const companyId = auth.profile?.company_id ?? undefined;
  const [headcount, setHeadcount] = useState<number | null>(null);
  const allowed = NAV_BY_ROLE[role];

  const primaryItems = filterNav(primary, allowed);
  const workforceItems = filterNav(workforce, allowed);
  const growthItems = filterNav(growth, allowed);
  const opsItems = filterNav(ops, allowed);
  const systemItems = filterNav(system, allowed);
  const consoleOverviewItems = filterNav(consoleOverview, allowed);
  const consoleTenantItems = filterNav(consoleTenants, allowed);
  const consoleAccountItems = filterNav(consoleAccount, allowed);

  useEffect(() => {
    if (admin || role === "employee") {
      setHeadcount(null);
      return;
    }
    void (async () => {
      try {
        if (companyId) {
          const emps = await listEmployees({
            data: { companyId, status: "active" },
          });
          setHeadcount(emps.length);
        } else {
          setHeadcount(0);
        }
      } catch {
        setHeadcount(null);
      }
    })();
  }, [admin, companyId, role]);

  const seatPct = headcount == null
    ? 0
    : Math.min(100, Math.round((headcount / PLAN_SEAT_LIMIT) * 100));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader><BrandMark consoleMode={admin} /></SidebarHeader>
      <SidebarContent className="gap-0">
        {admin ? (
          <>
            <NavSection label="Console" items={consoleOverviewItems} currentPath={currentPath} />
            <NavSection label="Tenants" items={consoleTenantItems} currentPath={currentPath} />
            <NavSection label="Compte ops" items={consoleAccountItems} currentPath={currentPath} />
          </>
        ) : (
          <>
            <NavSection label="Vue d'ensemble" items={primaryItems} currentPath={currentPath} />
            <NavSection label="Effectif & paie" items={workforceItems} currentPath={currentPath} />
            <NavSection label="Développement" items={growthItems} currentPath={currentPath} />
            <NavSection label="Opérations" items={opsItems} currentPath={currentPath} />
            <NavSection label="Système" items={systemItems} currentPath={currentPath} />
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        {admin ? (
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3 text-xs text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-sidebar-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-gold" /> Ops AnkibaPay
            </div>
            <div className="text-sidebar-foreground/60">
              Validation tenants · supervision plateforme
            </div>
          </div>
        ) : role !== "employee" ? (
          <Link
            to="/subscriptions"
            className="block rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3 text-xs text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
          >
            <div className="mb-1 flex items-center gap-1.5 font-medium text-sidebar-foreground">
              <Sparkles className="h-3.5 w-3.5 text-gold" /> Plan Pro
            </div>
            <div className="text-sidebar-foreground/60">
              {headcount == null
                ? "Chargement…"
                : `${headcount} / ${PLAN_SEAT_LIMIT} employés`}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sidebar-border">
              <div
                className="h-full rounded-full bg-gold transition-all duration-500"
                style={{ width: `${seatPct}%` }}
              />
            </div>
          </Link>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}

function useBreadcrumbs(pathname: string) {
  if (pathname === "/") return [{ label: "Tableau de bord", href: "/" }];
  const item = allNav.find((i) => i.url !== "/" && pathname.startsWith(i.url));
  return [
    { label: "Tableau de bord", href: "/" },
    { label: item?.title ?? "Page", href: item?.url ?? pathname },
  ];
}

function TopBar({ onOpenCommand }: { onOpenCommand: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crumbs = useBreadcrumbs(pathname);
  const auth = useAuthUser();
  const admin = isPlatformAdmin(auth);
  const companyId = admin ? undefined : auth.profile?.company_id ?? undefined;
  const displayName = auth.profile?.full_name ?? auth.email;
  const roleLabel = roleLabels[auth.profile?.role ?? "employee"] ?? "Employé";
  const [isDark, setIsDark] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    setIsDark(dark);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        let read = new Set<string>();
        try {
          const raw = localStorage.getItem("ap_notif_read");
          if (raw) read = new Set(JSON.parse(raw) as string[]);
        } catch {
          /* ignore */
        }
        const items = await listNotifications({ data: { companyId } });
        setUnread(items.filter((i) => i.unread && !read.has(i.id)).length);
      } catch {
        setUnread(0);
      }
    })();
  }, [companyId, pathname]);

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setIsDark(document.documentElement.classList.contains("dark"));
  };
  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      /* session may already be gone — still leave the app shell */
    } finally {
      // Full navigation so router/auth context reset without a manual refresh
      window.location.assign("/login");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl md:px-6">
      <SidebarTrigger className="-ml-1" />
      <nav className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
        {crumbs.map((c, i) => (
          <div key={c.href} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
            <Link
              to={c.href}
              className={
                i === crumbs.length - 1
                  ? "truncate font-medium text-foreground"
                  : "truncate text-muted-foreground hover:text-foreground"
              }
            >
              {c.label}
            </Link>
          </div>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenCommand}
          className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-muted md:flex md:w-72"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Rechercher…</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <CommandIcon className="h-3 w-3" />K
          </kbd>
        </button>
        <Button variant="ghost" size="icon" onClick={onOpenCommand} className="md:hidden" aria-label="Rechercher">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Basculer le thème">
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" asChild>
          <Link to="/notifications" className="relative" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 font-mono text-[9px] font-bold text-gold-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-muted"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                  {initialsFromName(auth.profile?.full_name, auth.email)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left leading-tight md:block">
                <div className="max-w-[140px] truncate text-xs font-semibold">{displayName}</div>
                <div className="text-[10px] text-muted-foreground">{roleLabel}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/settings">Profil & paramètres</Link></DropdownMenuItem>
            {!admin && (
              <DropdownMenuItem asChild><Link to="/subscriptions">Abonnement</Link></DropdownMenuItem>
            )}
            {admin ? (
              <DropdownMenuItem asChild><Link to="/admin">Console admin</Link></DropdownMenuItem>
            ) : (
              <DropdownMenuItem asChild><Link to="/ai">Assistant IA</Link></DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              disabled={signingOut}
              onSelect={(e) => {
                e.preventDefault();
                void handleSignOut();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {signingOut ? "Déconnexion…" : "Se déconnecter"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function GlobalCommand({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const navigate = useNavigate();
  const auth = useAuthUser();
  const role = getUserRole(auth);
  const allowed = NAV_BY_ROLE[role];

  const navItems = useMemo(
    () => allNav.filter((i) => allowed.has(i.url)),
    [allowed],
  );

  const go = (url: string) => {
    setOpen(false);
    void navigate({ to: url as "/" });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Aller à une page ou lancer une action…" />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem key={item.url} onSelect={() => go(item.url)}>
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions rapides">
          {allowed.has("/admin") && (
            <CommandItem onSelect={() => go("/admin")}>
              <ShieldCheck className="mr-2 h-4 w-4" />File de validation
            </CommandItem>
          )}
          {allowed.has("/companies") && role === "platform_admin" && (
            <CommandItem onSelect={() => go("/companies")}>
              <Building2 className="mr-2 h-4 w-4" />Liste des tenants
            </CommandItem>
          )}
          {allowed.has("/employees") && (
            <CommandItem onSelect={() => go("/employees")}>
              <UserPlus className="mr-2 h-4 w-4" />Ajouter un employé
            </CommandItem>
          )}
          {allowed.has("/payroll") && (
            <CommandItem onSelect={() => go("/payroll")}>
              <Wallet className="mr-2 h-4 w-4" />Ouvrir la paie
            </CommandItem>
          )}
          {allowed.has("/attendance") && (
            <CommandItem onSelect={() => go("/attendance")}>
              <Clock className="mr-2 h-4 w-4" />Pointage
            </CommandItem>
          )}
          {allowed.has("/leave") && (
            <CommandItem onSelect={() => go("/leave")}>
              <CalendarDays className="mr-2 h-4 w-4" />Congés
            </CommandItem>
          )}
          {allowed.has("/helpdesk") && (
            <CommandItem onSelect={() => go("/helpdesk")}>
              <Headphones className="mr-2 h-4 w-4" />Helpdesk
            </CommandItem>
          )}
          {allowed.has("/ai") && (
            <CommandItem onSelect={() => go("/ai")}>
              <Sparkles className="mr-2 h-4 w-4" />Assistant IA
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const auth = useAuthUser();
  const admin = isPlatformAdmin(auth);
  const daysLeft = subscriptionDaysRemaining(auth);
  const showExpiryBanner =
    !admin && daysLeft != null && daysLeft <= 5 && pathname !== "/subscriptions";
  const [cmdOpen, setCmdOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar currentPath={pathname} />
        <div className="flex min-h-screen flex-1 flex-col">
          <TopBar onOpenCommand={() => setCmdOpen(true)} />
          <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
            <div className="mx-auto w-full max-w-[1400px] animate-in fade-in-50 duration-300">
              {showExpiryBanner && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
                  <p>
                    Abonnement bientôt terminé —{" "}
                    <span className="font-medium">
                      {daysLeft} jour{daysLeft! > 1 ? "s" : ""} restant
                      {daysLeft! > 1 ? "s" : ""}
                    </span>
                    . Employeur et RH ont été notifiés. Aucune donnée ne sera supprimée.
                  </p>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/subscriptions">Renouveler</Link>
                  </Button>
                </div>
              )}
              {children}
            </div>
          </main>
        </div>
        <GlobalCommand open={cmdOpen} setOpen={setCmdOpen} />
        {!admin && <AiAssistant />}
      </div>
    </SidebarProvider>
  );
}

export function PageHeader({
  title, description, actions, badge,
}: { title: string; description?: string; actions?: ReactNode; badge?: string }) {
  return (
    <div className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0">
        {badge && (
          <Badge variant="secondary" className="mb-2 border-0 bg-primary-soft font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
            {badge}
          </Badge>
        )}
        <h1 className="truncate font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        <div className="ridge-divider mt-3" aria-hidden />
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}
