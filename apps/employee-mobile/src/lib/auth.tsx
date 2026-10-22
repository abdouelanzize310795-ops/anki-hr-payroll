import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase, type Session } from "@/lib/supabase";

type AuthCtx = {
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthCtx>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const finish = (next: Session | null) => {
      if (!mounted) return;
      setSession(next);
      setLoading(false);
    };

    const timeout = setTimeout(() => {
      // Avoid infinite spinner if storage/network stalls
      if (mounted) setLoading(false);
    }, 5000);

    supabase.auth
      .getSession()
      .then(({ data }) => finish(data.session))
      .catch((err) => {
        console.warn("[auth] getSession failed", err);
        finish(null);
      })
      .finally(() => clearTimeout(timeout));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      finish(next);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ session, loading }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
