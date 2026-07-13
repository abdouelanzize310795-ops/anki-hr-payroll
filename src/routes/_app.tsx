import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import {
  isCompanyApproved,
  isPlatformAdmin,
  requireAuthSession,
} from "@/lib/auth/auth.functions";
import { PLATFORM_ADMIN_ROUTES } from "@/lib/auth/roles";
import type { AuthUser } from "@/lib/auth/types";

export type AppRouteContext = {
  auth: AuthUser;
};

const ACCESS_ALLOWED = new Set([
  "/onboarding",
  "/subscriptions",
  "/company-access",
  "/settings",
  "/notifications",
]);

function pathAllowed(pathname: string, allowed: Set<string>): boolean {
  if (allowed.has(pathname)) return true;
  for (const route of allowed) {
    if (route !== "/" && pathname.startsWith(`${route}/`)) return true;
  }
  return false;
}

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }): Promise<AppRouteContext> => {
    const auth = await requireAuthSession();

    if (auth.profile && !auth.profile.is_active) {
      throw redirect({ to: "/login" });
    }

    // Provisioned accounts must change temporary password before anything else
    if (auth.profile?.must_change_password) {
      throw redirect({ to: "/change-password" });
    }

    const needsCompany =
      !isPlatformAdmin(auth) && !auth.profile?.company_id;

    if (needsCompany && !location.pathname.startsWith("/onboarding")) {
      throw redirect({ to: "/onboarding" });
    }

    // Platform admin = console SaaS only (not tenant RH workspace)
    if (isPlatformAdmin(auth)) {
      const path = location.pathname;
      if (!pathAllowed(path, PLATFORM_ADMIN_ROUTES) && path !== "/company-access") {
        throw redirect({ to: "/admin" });
      }
      return { auth };
    }

    // Unpaid, pending validation, or expired subscription → block workspace (data kept)
    if (auth.company && !isCompanyApproved(auth)) {
      const path = location.pathname;
      const allowed =
        ACCESS_ALLOWED.has(path) ||
        path.startsWith("/onboarding") ||
        path.startsWith("/subscriptions") ||
        path.startsWith("/company-access") ||
        path.startsWith("/settings") ||
        path.startsWith("/notifications");

      if (!allowed) {
        if (auth.company.subscription_status === "expired") {
          throw redirect({ to: "/subscriptions" });
        }
        if (auth.company.approval_status === "pending_payment") {
          throw redirect({ to: "/subscriptions" });
        }
        throw redirect({ to: "/company-access" });
      }
    }

    return { auth };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
