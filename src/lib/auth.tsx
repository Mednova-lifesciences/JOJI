/**
 * Mock auth for the JOJI demo.
 *
 * Accounts and the "JWT" live in localStorage. To move to a real provider
 * (Supabase Auth, Clerk, Auth0), replace `signIn` / `signUp` / `signOut` with
 * provider calls — the rest of the app only depends on this context's shape.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type JojiUser = {
  id: string;
  fullName: string;
  email: string;
  orgType: string;
  organization?: string;
  phone: string;
  preferredLanguage: string;
};

type StoredAccount = JojiUser & { password: string };

type AuthState = {
  user: JojiUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: Omit<StoredAccount, "id" | "preferredLanguage"> & { preferredLanguage?: string }) => Promise<void>;
  signOut: () => void;
  updateUser: (patch: Partial<JojiUser>) => void;
};

const ACCOUNTS_KEY = "joji.accounts";
const SESSION_KEY = "joji.session";

const AuthContext = createContext<AuthState | null>(null);

function readAccounts(): StoredAccount[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]") as StoredAccount[];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: StoredAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/** Stand-in for a signed JWT — base64 payload, no verification. */
function mintToken(user: JojiUser) {
  return `joji.${btoa(unescape(encodeURIComponent(JSON.stringify({ sub: user.id, iat: Date.now() }))))}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<JojiUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setUser(JSON.parse(raw).user as JojiUser);
    } catch {
      /* ignore corrupt session */
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: JojiUser | null) => {
    setUser(next);
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify({ token: mintToken(next), user: next }));
    else localStorage.removeItem(SESSION_KEY);
  }, []);

  const signIn = useCallback<AuthState["signIn"]>(
    async (email, password) => {
      const account = readAccounts().find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
      if (!account || account.password !== password) throw new Error("Email or password is incorrect.");
      const { password: _pw, ...safe } = account;
      persist(safe);
    },
    [persist],
  );

  const signUp = useCallback<AuthState["signUp"]>(
    async (input) => {
      const accounts = readAccounts();
      if (accounts.some((a) => a.email.toLowerCase() === input.email.trim().toLowerCase()))
        throw new Error("An account with this email already exists.");
      const account: StoredAccount = {
        ...input,
        email: input.email.trim(),
        id: crypto.randomUUID(),
        preferredLanguage: input.preferredLanguage ?? "yo",
      };
      writeAccounts([...accounts, account]);
      const { password: _pw, ...safe } = account;
      persist(safe);
    },
    [persist],
  );

  const updateUser = useCallback(
    (patch: Partial<JojiUser>) => {
      if (!user) return;
      const next = { ...user, ...patch };
      writeAccounts(readAccounts().map((a) => (a.id === next.id ? { ...a, ...patch } : a)));
      persist(next);
    },
    [persist, user],
  );

  const value = useMemo<AuthState>(
    () => ({ user, ready, signIn, signUp, signOut: () => persist(null), updateUser }),
    [user, ready, signIn, signUp, persist, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
