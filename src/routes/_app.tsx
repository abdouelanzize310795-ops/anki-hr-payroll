import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { isPlatformAdmin, requireAuthSession } from "@/lib/auth/auth.functions";
import type { AuthUser } from "@/lib/auth/types";

export type AppRouteContext = {
  auth: AuthUser;
};

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }): Promise<AppRouteContext> => {
    const auth = await requireAuthSession();

    if (auth.profile && !auth.profile.is_active) {
      throw redirect({ to: "/login" });
    }

    // Super admin can operate without a company
    const needsCompany =
      !isPlatformAdmin(auth) && !auth.profile?.company_id;

    if (needsCompany && !location.pathname.startsWith("/onboarding")) {
      throw redirect({ to: "/onboarding" });
    }

    return { auth };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
