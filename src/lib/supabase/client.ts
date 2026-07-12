import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const env = getPublicEnv();
  browserClient = createBrowserClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  return browserClient;
}
