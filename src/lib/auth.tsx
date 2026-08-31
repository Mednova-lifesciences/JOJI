/**
 * Supabase-backed auth for JOJI. Session state comes from Supabase Auth;
 * profile fields (name, phone, preferred language) live in the `profiles`
 * table, and organization/org_type are read-only, joined from `profiles.
 * organization_id -> organizations` (see supabase/migrations) since an
 * organization is now shared across everyone on the same work email domain.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "./supabase";

export type JojiUser = {
  id: string;
  fullName: string;
  email: string;
  orgType: string;
  organization: string;
  phone: string;
  preferredLanguage: string;
};

type ProfileRow = {
  id: string;
  full_name: string;
  phone: string;
  preferred_language: string;
  organizations: { name: string; org_type: string } | null;
};

type SignUpInput = {
  fullName: string;
  email: string;
  password: string;
  orgType: string;
  organization?: string;
  phone: string;
  preferredLanguage?: string;
};

type AuthState = {
  user: JojiUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Returns needsEmailConfirmation: true when the project requires the user to click a confirmation link before a session exists. */
  signUp: (input: SignUpInput) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => void;
  updateUser: (patch: Partial<Pick<JojiUser, "fullName" | "phone" | "preferredLanguage">>) => void;
};

const AuthContext = createContext<AuthState | null>(null);

function toJojiUser(session: Session, profile: ProfileRow): JojiUser {
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    fullName: profile.full_name,
    orgType: profile.organizations?.org_type ?? "Hospital",
    organization: profile.organizations?.name ?? "",
    phone: profile.phone,
    preferredLanguage: profile.preferred_language,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<JojiUser | null>(null);
  const [ready, setReady] = useState(false);

  const loadUser = useCallback(async (session: Session | null) => {
    if (!session) {
      setUser(null);
      return;
    }
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone, preferred_language, organizations(name, org_type)")
      .eq("id", session.user.id)
      .single<ProfileRow>();
    if (error || !profile) {
      setUser(null);
      return;
    }
    setUser(toJojiUser(session, profile));
  }, []);

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void loadUser(session).finally(() => {
        if (active) setReady(true);
      });
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadUser]);

  const signIn = useCallback<AuthState["signIn"]>(
    async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw new Error(error.message);
      await loadUser(data.session);
    },
    [loadUser],
  );

  const signUp = useCallback<AuthState["signUp"]>(
    async (input) => {
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          data: {
            full_name: input.fullName,
            org_type: input.orgType,
            organization: input.organization ?? "",
            phone: input.phone,
            preferred_language: input.preferredLanguage ?? "yo",
          },
        },
      });
      if (error) throw new Error(error.message);
      if (!data.session) return { needsEmailConfirmation: true };
      await loadUser(data.session);
      return { needsEmailConfirmation: false };
    },
    [loadUser],
  );

  const signOut = useCallback(() => {
    void supabase.auth.signOut();
  }, []);

  const updateUser = useCallback<AuthState["updateUser"]>((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      void supabase
        .from("profiles")
        .update({
          full_name: next.fullName,
          phone: next.phone,
          preferred_language: next.preferredLanguage,
        })
        .eq("id", next.id)
        .then(({ error }) => {
          if (error) toast.error(`Could not save changes: ${error.message}`);
        });
      return next;
    });
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, ready, signIn, signUp, signOut, updateUser }),
    [user, ready, signIn, signUp, signOut, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
