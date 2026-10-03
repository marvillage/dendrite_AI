import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { KEYCLOAK_TIMEOUT_MS } from "../config";
import { keycloak, type UserProfile } from "./keycloak";

// "checking"      Keycloak is configured and we are briefly waiting for it.
// "guest"         No Keycloak, Keycloak unreachable, or simply not signed in.
// "authenticated" Signed in via Keycloak.
export type AuthStatus = "checking" | "guest" | "authenticated";

export type AuthContextValue = {
  status: AuthStatus;
  isAuthenticated: boolean;
  // True once Keycloak has answered, so the sign-in buttons will work.
  canSignIn: boolean;
  profile: UserProfile | null;
  login: () => void;
  register: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>(
    keycloak ? "checking" : "guest"
  );
  const [canSignIn, setCanSignIn] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const initPromiseRef = useRef<Promise<boolean> | null>(null);

  const loadProfile = useCallback(async () => {
    if (!keycloak?.authenticated) {
      setProfile(null);
      return;
    }
    try {
      const userProfile = await keycloak.loadUserProfile();
      setProfile(userProfile as UserProfile);
    } catch {
      // Account endpoint unavailable (e.g. CORS): fall back to token claims.
      const claims = keycloak.tokenParsed as
        | { preferred_username?: string; given_name?: string }
        | undefined;
      setProfile({
        username: claims?.preferred_username,
        firstName: claims?.given_name
      });
    }
  }, []);

  useEffect(() => {
    const kc = keycloak;
    if (!kc) {
      return undefined;
    }
    let active = true;

    if (!initPromiseRef.current) {
      initPromiseRef.current = kc.init({
        onLoad: "check-sso",
        pkceMethod: "S256",
        checkLoginIframe: false,
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
        // If third-party cookies are blocked, skip the silent check instead of
        // redirecting the whole page to Keycloak.
        silentCheckSsoFallback: false
      });
    }

    // Never block on Keycloak: if it has not answered in time, carry on as a
    // guest. A late answer still upgrades the session below.
    const fallback = window.setTimeout(() => {
      if (active) {
        setStatus((current) => (current === "checking" ? "guest" : current));
      }
    }, KEYCLOAK_TIMEOUT_MS);

    initPromiseRef.current
      .then(async (authenticated) => {
        if (!active) {
          return;
        }
        setCanSignIn(true);
        setStatus(authenticated ? "authenticated" : "guest");
        if (authenticated) {
          await loadProfile();
        }
      })
      .catch(() => {
        if (active) {
          console.info("Keycloak unavailable, continuing as guest.");
          setStatus("guest");
        }
      })
      .finally(() => {
        window.clearTimeout(fallback);
      });

    return () => {
      active = false;
      window.clearTimeout(fallback);
    };
  }, [loadProfile]);

  useEffect(() => {
    const kc = keycloak;
    if (!kc || status !== "authenticated") {
      return undefined;
    }

    const refresh = window.setInterval(() => {
      kc.updateToken(60).catch(() => {
        // Session expired or Keycloak went away: drop back to guest instead
        // of redirecting to a Keycloak that may not be reachable.
        kc.clearToken();
        setProfile(null);
        setStatus("guest");
      });
    }, 30_000);

    return () => {
      window.clearInterval(refresh);
    };
  }, [status]);

  const login = useCallback(() => {
    void keycloak?.login({ redirectUri: window.location.href });
  }, []);

  const register = useCallback(() => {
    void keycloak?.register({ redirectUri: window.location.href });
  }, []);

  const logout = useCallback(() => {
    void keycloak?.logout({ redirectUri: window.location.origin });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      isAuthenticated: status === "authenticated",
      canSignIn,
      profile,
      login,
      register,
      logout
    }),
    [status, canSignIn, profile, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
