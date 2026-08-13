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
// Last-known session user, cached so the app can render (and queue offline
// saves) before the session query resolves — essential for field use offline.
const CACHED_USER_KEY = "fleetcore.cache.sessionUser";

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

/** Short device label stored on the session so admins can see where sessions are. */
function getDeviceLabel(): string {
  try {
    if (typeof navigator === "undefined") return "Browser";
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod|Android/i.test(ua)) return "Mobile";
    if (/Macintosh|Windows|Linux/i.test(ua)) return "Desktop";
    return "Browser";
  } catch {
    return "Browser";
  }
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

  // While the session query is pending (or unreachable because we're offline),
  // fall back to the last-known user so the app shell renders instead of
  // spinning on the splash screen. Once the query resolves, its result wins.
  const [cachedUser, setCachedUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(CACHED_USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  });

  // Write-through / clear as the live session resolves (a resolved null means
  // the session is gone — don't keep serving the cached user). The cached-user
  // state itself is only consulted while the query is pending, so no state
  // update is needed here — the resolved session takes precedence.
  useEffect(() => {
    if (session === undefined) return;
    try {
      if (session.user) {
        window.localStorage.setItem(CACHED_USER_KEY, JSON.stringify(session.user));
      } else {
        window.localStorage.removeItem(CACHED_USER_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [session]);

  const hasToken = !!token;
  const user = hasToken && session === undefined ? cachedUser : (session?.user ?? null);
  const loading = !initialized || (hasToken ? session === undefined && !cachedUser : false);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const newToken = generateToken();
      const res = (await loginAction({
        email,
        password,
        token: newToken,
        device: getDeviceLabel(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      })) as {
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
      window.localStorage.removeItem(CACHED_USER_KEY);
    } catch {
      /* ignore */
    }
    setToken(null);
    setCachedUser(null);
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
