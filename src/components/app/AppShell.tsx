import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Building2, Users, UserPlus, FileSignature, Clock,
  CalendarDays, Wallet, Calculator, GraduationCap, TrendingUp, ListTodo,
  FolderKanban, Laptop, BarChart3, Bell, Sparkles, Settings, ShieldCheck,
  CreditCard, Search, Command as CommandIcon, Sun, Moon, ChevronRight, LogOut,
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
import { AiAssistant } from "./AiAssistant";

type NavItem = { title: string; url: string; icon: any };

const primary: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Companies", url: "/companies", icon: Building2 },
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Recruitment", url: "/recruitment", icon: UserPlus },
  { title: "Contracts", url: "/contracts", icon: FileSignature },
];

const workforce: NavItem[] = [
  { title: "Attendance", url: "/attendance", icon: Clock },
  { title: "Leave", url: "/leave", icon: CalendarDays },
  { title: "Payroll", url: "/payroll", icon: Wallet },
  { title: "Accounting", url: "/accounting", icon: Calculator },
];

const growth: NavItem[] = [
  { title: "Training", url: "/training", icon: GraduationCap },
  { title: "Performance", url: "/performance", icon: TrendingUp },
  { title: "Tasks", url: "/tasks", icon: ListTodo },
];

const ops: NavItem[] = [
  { title: "Documents", url: "/documents", icon: FolderKanban },
  { title: "Assets", url: "/assets", icon: Laptop },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Notifications", url: "/notifications", icon: Bell },
];

const system: NavItem[] = [
  { title: "AI Assistant", url: "/ai", icon: Sparkles },
  { title: "Subscriptions", url: "/subscriptions", icon: CreditCard },
  { title: "Super Admin", url: "/admin", icon: ShieldCheck },
  { title: "Settings", url: "/settings", icon: Settings },
];

const allNav = [...primary, ...workforce, ...growth, ...ops, ...system];

function NavSection({ label, items, currentPath }: { label: string; items: NavItem[]; currentPath: string }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">{label}</SidebarGroupLabel>}
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

function BrandMark() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl brand-gradient shadow-glow">
        <span className="font-display text-lg font-bold text-primary-foreground">A</span>
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="font-display text-sm font-bold tracking-tight text-sidebar-foreground">ANKIBAPAY</div>
          <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Smart HR • Payroll</div>
        </div>
      )}
    </div>
  );
}

function AppSidebar({ currentPath }: { currentPath: string }) {
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader><BrandMark /></SidebarHeader>
      <SidebarContent className="gap-0">
        <NavSection label="Overview" items={primary} currentPath={currentPath} />
        <NavSection label="Workforce" items={workforce} currentPath={currentPath} />
        <NavSection label="Growth" items={growth} currentPath={currentPath} />
        <NavSection label="Operations" items={ops} currentPath={currentPath} />
        <NavSection label="System" items={system} currentPath={currentPath} />
      </SidebarContent>
      <SidebarFooter>
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3 text-xs text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-sidebar-foreground">
            <Sparkles className="h-3.5 w-3.5 text-gold" /> Pro plan
          </div>
          <div className="text-sidebar-foreground/60">248 / 500 employees</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sidebar-border">
            <div className="h-full w-[50%] rounded-full bg-gold" />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function useBreadcrumbs(pathname: string) {
  if (pathname === "/") return [{ label: "Dashboard", href: "/" }];
  const item = allNav.find((i) => i.url !== "/" && pathname.startsWith(i.url));
  return [
    { label: "Dashboard", href: "/" },
    { label: item?.title ?? "Page", href: item?.url ?? pathname },
  ];
}

function TopBar({ onOpenCommand }: { onOpenCommand: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crumbs = useBreadcrumbs(pathname);
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    setIsDark(dark);
  }, []);
  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setIsDark(document.documentElement.classList.contains("dark"));
  };
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur-xl md:px-6">
      <SidebarTrigger className="-ml-1" />
      <nav className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => (
          <div key={c.href} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
            <Link to={c.href} className={i === crumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}>
              {c.label}
            </Link>
          </div>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onOpenCommand}
          className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted md:flex md:w-72"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search anything…</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <CommandIcon className="h-3 w-3" />K
          </kbd>
        </button>
        <Button variant="ghost" size="icon" onClick={onOpenCommand} className="md:hidden">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" asChild>
          <Link to="/notifications" className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-gold" />
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-muted transition-colors">
              <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">AK</AvatarFallback></Avatar>
              <div className="hidden text-left leading-tight md:block">
                <div className="text-xs font-semibold">Amina Kouassi</div>
                <div className="text-[10px] text-muted-foreground">HR Director</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/settings">Profile & settings</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/subscriptions">Billing</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function GlobalCommand({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search employees, payslips, documents or navigate…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {allNav.map((item) => (
            <CommandItem key={item.url} onSelect={() => { setOpen(false); window.location.assign(item.url); }}>
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Quick actions">
          <CommandItem><UserPlus className="mr-2 h-4 w-4" />Add new employee</CommandItem>
          <CommandItem><Wallet className="mr-2 h-4 w-4" />Run payroll simulation</CommandItem>
          <CommandItem><FileSignature className="mr-2 h-4 w-4" />Generate contract</CommandItem>
          <CommandItem><Sparkles className="mr-2 h-4 w-4" />Ask AI assistant</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
          <main className="flex-1 p-4 md:p-8">
            <div className="mx-auto w-full max-w-[1400px] animate-in fade-in-50 duration-300">
              {children}
            </div>
          </main>
        </div>
        <GlobalCommand open={cmdOpen} setOpen={setCmdOpen} />
        <AiAssistant />
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
        {badge && <Badge variant="secondary" className="mb-2 bg-primary-soft text-primary border-0">{badge}</Badge>}
        <h1 className="truncate font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
