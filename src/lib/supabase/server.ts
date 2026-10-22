import { createServerOnlyFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  createSession,
  createUser,
  deleteSession,
  getUserBySessionToken,
  updateUserRecord,
  verifyPassword,
  type AuthUserRecord,
} from "@/lib/db/auth";
import { QueryBuilder, callRpc } from "@/lib/db/query-builder";
import { storageBucket } from "@/lib/db/storage";

/**
 * Server data client for TanStack Start server functions / loaders.
 * Keeps the supabase-js surface the modules were written against
 * (from / rpc / auth / storage) but talks directly to PostgreSQL.
 * Wrapped in createServerOnlyFn so it is pruned from the client bundle.
 */
export const createSupabaseServerClient = createServerOnlyFn(() => createDbClient());

type SessionState = { loaded: boolean; user: AuthUserRecord | null; token: string | null };

function createDbClient() {
  const state: SessionState = { loaded: false, user: null, token: null };

  const loadUser = async (): Promise<AuthUserRecord | null> => {
    if (!state.loaded) {
      state.token = getCookie(SESSION_COOKIE) ?? null;
      state.user = await getUserBySessionToken(state.token);
      state.loaded = true;
    }
    return state.user;
  };
  const resolveUserId = async () => (await loadUser())?.id ?? null;

  const startSession = async (user: AuthUserRecord) => {
    const { token, expiresAt } = await createSession(user.id);
    setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
      path: "/",
      expires: expiresAt,
      maxAge: SESSION_TTL_DAYS * 24 * 3600,
    });
    Object.assign(state, { loaded: true, user, token });
    return { access_token: token, expires_at: Math.floor(expiresAt.getTime() / 1000), user };
  };

  const authError = (message: string) => ({ message, status: 401, name: "AuthError" });

  return {
    from: <T = any[]>(table: string) => new QueryBuilder<T>(table, resolveUserId),

    rpc: <T = any>(fn: string, args?: Record<string, unknown>) => callRpc<T>(fn, args, resolveUserId),

    storage: { from: (bucket: string) => storageBucket(bucket) },

    auth: {
      async getUser() {
        const user = await loadUser();
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: authError("Auth session missing!") };
      },

      async getSession() {
        const user = await loadUser();
        return { data: { session: user ? { access_token: state.token, user } : null }, error: null };
      },

      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const { user, error } = await verifyPassword(email, password);
        if (error || !user) return { data: { user: null, session: null }, error: authError(error?.message ?? "Invalid login credentials") };
        const session = await startSession(user);
        return { data: { user, session }, error: null };
      },

      async signUp({
        email,
        password,
        options,
      }: {
        email: string;
        password: string;
        options?: { data?: Record<string, unknown> };
      }) {
        const { user, error } = await createUser(email, password, options?.data ?? {});
        if (error || !user) return { data: { user: null, session: null }, error: authError(error?.message ?? "Inscription impossible") };
        const session = await startSession(user);
        return { data: { user, session }, error: null };
      },

      async signOut() {
        await loadUser();
        await deleteSession(state.token);
        deleteCookie(SESSION_COOKIE, { path: "/" });
        Object.assign(state, { loaded: true, user: null, token: null });
        return { error: null as { message: string } | null };
      },

      async updateUser(changes: { password?: string; email?: string; data?: Record<string, unknown> }) {
        const current = await loadUser();
        if (!current) return { data: { user: null }, error: authError("Auth session missing!") };
        const { user, error } = await updateUserRecord(current.id, changes);
        if (error) return { data: { user: null }, error: authError(error.message) };
        state.user = user;
        return { data: { user }, error: null };
      },
    },
  };
}

export type DbClient = ReturnType<typeof createDbClient>;
