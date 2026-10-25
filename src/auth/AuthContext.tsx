import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, setToken, clearToken, getToken } from "../api/client";

export type User = {
  id: string;
  email: string;
  display_name: string | null;
  has_avatar?: boolean;
  avatar_version?: string | null;
};

type AuthValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On load: if a token exists, validate it by fetching the current user.
    async function bootstrap() {
      if (!getToken()) { setLoading(false); return; }
      try {
        const data = await api<{ user: User }>("/auth/me");
        setUser(data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();

    // Any request that 401s fires this, so we drop the user everywhere.
    const onLogout = () => setUser(null);
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  async function login(email: string, password: string) {
    const data = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setUser(data.user);
  }

  async function register(email: string, password: string, displayName?: string) {
    const data = await api<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    });
    setToken(data.token);
    setUser(data.user);
  }

  // Re-fetch the current user (after an email change or avatar upload).
  async function refreshUser() {
    try {
      const data = await api<{ user: User }>("/auth/me");
      setUser(data.user);
    } catch {
      // leave the current user as-is on a transient failure
    }
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
