import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { api } from "../lib/api";
import { User } from "../types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("split_token"));
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("split_user");
    return stored ? JSON.parse(stored) : null;
  });

  const persist = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem("split_token", newToken);
    localStorage.setItem("split_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post("/auth/login", { email, password });
      persist(res.data.token, res.data.user);
    },
    [persist]
  );

  const signup = useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await api.post("/auth/signup", { email, password, displayName });
      persist(res.data.token, res.data.user);
    },
    [persist]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("split_token");
    localStorage.removeItem("split_user");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
