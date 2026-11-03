import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Mshahara API client. Talks to the web app's /api/mobile endpoints with a
 * Bearer session token, and keeps the small supabase-like surface the screens
 * were written against (rpc + auth).
 */

const DEFAULT_API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
const SESSION_KEY = "mshahara.session";

/** Server address, fixed at build time (EXPO_PUBLIC_API_URL). */
export async function getApiUrl(): Promise<string> {
  return DEFAULT_API_URL;
}

export type SessionUser = {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

export type Session = {
  access_token: string;
  expires_at: number;
  user: SessionUser;
};

type AuthEvent = "SIGNED_IN" | "SIGNED_OUT";
type Listener = (event: AuthEvent, session: Session | null) => void;

const listeners = new Set<Listener>();
let current: Session | null = null;
let loaded = false;

async function loadSession(): Promise<Session | null> {
  if (loaded) return current;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    current = parsed && parsed.expires_at * 1000 > Date.now() ? parsed : null;
  } catch {
    current = null;
  }
  loaded = true;
  return current;
}

async function setSession(next: Session | null, event: AuthEvent) {
  current = next;
  loaded = true;
  if (next) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
  else await AsyncStorage.removeItem(SESSION_KEY);
  listeners.forEach((fn) => fn(event, next));
}

async function post<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const base = await getApiUrl();
  if (!base) throw new Error("Adresse du serveur non configurée");
  let res: Response;
  try {
    res = await fetch(`${base}/api/mobile/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new Error(`Serveur injoignable (${base}). Vérifiez l’adresse et le Wi-Fi.`);
  }
  const json = (await res.json().catch(() => ({}))) as { message?: string } & T;
  if (!res.ok) {
    if (res.status === 401 && token) await setSession(null, "SIGNED_OUT");
    throw new Error(json.message ?? `Erreur serveur (${res.status})`);
  }
  return json;
}

/** Current bearer token (for authenticated downloads such as payslip PDFs). */
export async function getAccessToken(): Promise<string | null> {
  return (await loadSession())?.access_token ?? null;
}

export const supabase = {
  async rpc<T = unknown>(name: string, args?: Record<string, unknown>) {
    try {
      const session = await loadSession();
      const { data } = await post<{ data: T }>(`rpc/${name}`, args ?? {}, session?.access_token);
      return { data, error: null as { message: string } | null };
    } catch (err) {
      return { data: null as T | null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  },

  auth: {
    async getSession() {
      return { data: { session: await loadSession() } };
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const session = await post<Session>("login", { email, password });
        await setSession(session, "SIGNED_IN");
        return { data: { session, user: session.user }, error: null as { message: string } | null };
      } catch (err) {
        return {
          data: { session: null, user: null },
          error: { message: err instanceof Error ? err.message : String(err) },
        };
      }
    },

    async signOut() {
      const session = await loadSession();
      try {
        if (session) await post("logout", {}, session.access_token);
      } catch {
        // Session already invalid server-side; clear locally anyway.
      }
      await setSession(null, "SIGNED_OUT");
      return { error: null as { message: string } | null };
    },

    onAuthStateChange(fn: Listener) {
      listeners.add(fn);
      return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } };
    },
  },
};

/** Replaces the user's password (checks the current one on the server). */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const session = await loadSession();
  await post("change-password", { current_password: currentPassword, new_password: newPassword }, session?.access_token);
}
