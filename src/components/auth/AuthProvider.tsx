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

export type RegionFilter = "garden_route" | "eastern_cape" | "all";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  /** Admin-only region override ("all" = no filter). Regional users are never overridable. */
  regionFilter: RegionFilter;
  setRegionFilter: (region: RegionFilter) => void;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  login: async () => ({ ok: false, error: "Auth not ready" }),
  logout: async () => {},
  regionFilter: "all",
  setRegionFilter: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Stage 4: derive the `region` query arg from the auth state.
 * - admin + filter "all" -> undefined (no server filter)
 * - admin + specific region -> that region
 * - regional -> undefined (server always forces their own region)
 */
export function useRegionArg(): "garden_route" | "eastern_cape" | undefined {
  const { user, regionFilter } = useAuth();
  if (user?.role !== "admin") return undefined;
  return regionFilter === "all" ? undefined : regionFilter;
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
  const [regionFilter, setRegionFilter] = useState<RegionFilter>("all");

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
    setRegionFilter("all");
  }, [token, logoutMutation]);

  // When the signed-in user changes, reset the admin override to "All" (Stage 4).
  const userId = user?._id ?? null;
  useEffect(() => {
    Promise.resolve().then(() => setRegionFilter("all"));
  }, [userId]);

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, logout, regionFilter, setRegionFilter }}
    >
      {children}
    </AuthContext.Provider>
  );
}
