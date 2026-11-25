import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSession, login, logout, request, type AdminSession } from '@/lib/api';

interface AuthContextValue {
  session: AdminSession | null;
  isLoading: boolean;
  isConfigured: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const IDLE_MS = 30 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const expired = () => setSession(null);
    window.addEventListener('admin-session-expired', expired);
    void getSession().then((current) => { if (alive) setSession(current); })
      .catch(() => undefined).finally(() => { if (alive) setIsLoading(false); });
    return () => { alive = false; window.removeEventListener('admin-session-expired', expired); };
  }, []);

  useEffect(() => {
    if (!session) return;
    let lastPing = Date.now();
    let timer: number;
    const expire = () => void logout().catch(() => undefined).finally(() => setSession(null));
    const activity = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(expire, IDLE_MS);
      if (Date.now() - lastPing > 30_000) {
        lastPing = Date.now();
        void request('session', 'PATCH').catch(() => undefined);
      }
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, activity, { passive: true }));
    activity();
    return () => { window.clearTimeout(timer); events.forEach((event) => window.removeEventListener(event, activity)); };
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    session, isLoading, isConfigured: true, isAdmin: session?.user.role === 'admin',
    async signIn(email, password) { setSession(await login(email, password)); },
    async signOut() { await logout(); setSession(null); },
  }), [isLoading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
