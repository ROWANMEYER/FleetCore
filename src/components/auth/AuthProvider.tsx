"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const TOKEN_KEY = "fleetcore-session-token";

export type AuthUser = {
  _id: string;
  email: string;
  role: "admin" | "regional";
  region: "garden_route" | "eastern_cape" | null;
};

type LoginResult = { ok: boolean; error?: string };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => ({ ok: false, error: "Auth not ready" }),
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function generateToken(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const loginAction = useAction(api.users.login);
  const logoutMutation = useMutation(api.userSessions.logout);

  useEffect(() => {
    // Defer to a microtask so the state updates aren't synchronous inside the effect.
    const t = readToken();
    Promise.resolve().then(() => {
      setToken(t);
      setInitialized(true);
    });
  }, []);

  const session = useQuery(api.userSessions.getSessionUser, token ? { token } : "skip");
  const user = session?.user ?? null;
  const loading = !initialized || (token ? session === undefined : false);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const newToken = generateToken();
      const res = (await loginAction({ email, password, token: newToken })) as {
        ok?: boolean;
        error?: string;
        user?: AuthUser;
      };
      if (res && res.ok && res.user) {
        try {
          window.localStorage.setItem(TOKEN_KEY, newToken);
        } catch {
          /* ignore */
        }
        setToken(newToken);
        return { ok: true };
      }
      return { ok: false, error: res?.error || "Login failed" };
    },
    [loginAction]
  );

  const logout = useCallback(async () => {
    if (token) {
      try {
        await logoutMutation({ token });
      } catch {
        /* ignore */
      }
    }
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setToken(null);
  }, [token, logoutMutation]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
