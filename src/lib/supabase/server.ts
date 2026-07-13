import { createServerClient } from "@supabase/ssr";
import { createServerOnlyFn } from "@tanstack/react-start";
import { getCookies, setCookie } from "@tanstack/react-start/server";
import { getPublicEnv } from "./env";

/**
 * Supabase server client for TanStack Start server functions / loaders.
 * Wrapped in createServerOnlyFn so `@tanstack/react-start/server` is pruned
 * from the client bundle (import protection).
 */
export const createSupabaseServerClient = createServerOnlyFn(() => {
  const env = getPublicEnv();

  return createServerClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookies) {
        for (const cookie of cookies) {
          setCookie(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });
});
