import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import { supabase } from "../lib/supabaseClient";
import type { PharmacySettings, UserProfile, UserRole } from "../types/pharmacy";

interface AuthContextValue {
  profile: UserProfile | null;
  settings: PharmacySettings;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<UserProfile>;
  signInDemoRole: (role: UserRole) => Promise<UserProfile>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  updateSettings: (patch: Partial<PharmacySettings>) => Promise<void>;
}

const DEFAULT_SETTINGS: PharmacySettings = {
  pharmacy_name: "PharmaSys Community Pharmacy",
  pharmacy_address: "",
  receipt_footer: "THANK YOU!",
  expiring_soon_days: 30,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<PharmacySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const loadContext = useCallback(async () => {
    try {
      const p = await api.getSessionProfile();
      setProfile(p);
      if (p && p.status === "Active" && p.role) {
        try {
          const s = await api.getSettings();
          setSettings(s);
        } catch {
          // Keep default settings if unreadable
        }
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContext();
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setProfile(null);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        loadContext();
      }
    });
    return () => subscription.unsubscribe();
  }, [loadContext]);

  const signIn = async (email: string, password: string) => {
    const p = await api.signIn(email, password);
    setProfile(p);
    if (p.status === "Active" && p.role) {
      const s = await api.getSettings().catch(() => DEFAULT_SETTINGS);
      setSettings(s);
    }
    return p;
  };

  const signInDemoRole = async (role: UserRole) => {
    const p = await api.signInDemoRole(role);
    setProfile(p);
    const s = await api.getSettings().catch(() => DEFAULT_SETTINGS);
    setSettings(s);
    return p;
  };

  const signOut = async () => {
    await api.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    const p = await api.getSessionProfile();
    setProfile(p);
  };

  const refreshSettings = async () => {
    const s = await api.getSettings();
    setSettings(s);
  };

  const updateSettings = async (patch: Partial<PharmacySettings>) => {
    const s = await api.updateSettings(patch);
    setSettings(s);
  };

  return (
    <AuthContext.Provider
      value={{
        profile,
        settings,
        loading,
        signIn,
        signInDemoRole,
        signOut,
        refreshProfile,
        refreshSettings,
        updateSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
