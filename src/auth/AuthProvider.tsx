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
import { keycloak, type UserProfile } from "./keycloak";

export type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  profile: UserProfile | null;
  login: () => void;
  register: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const initPromiseRef = useRef<Promise<boolean> | null>(null);

  const loadProfile = useCallback(async () => {
    if (!keycloak.authenticated) {
      setProfile(null);
      return;
    }
    const userProfile = await keycloak.loadUserProfile();
    setProfile(userProfile as UserProfile);
  }, []);

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        if (!initPromiseRef.current) {
          initPromiseRef.current = keycloak.init({
            onLoad: "check-sso",
            pkceMethod: "S256",
            checkLoginIframe: false,
            silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`
          });
        }

        const authenticated = await initPromiseRef.current;

        if (!active) {
          return;
        }

        setIsAuthenticated(authenticated);
        await loadProfile();
      } catch (error) {
        if (active) {
          console.error("Keycloak init failed", error);
          setIsAuthenticated(false);
          setProfile(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      active = false;
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const refresh = window.setInterval(() => {
      keycloak.updateToken(60).catch(() => {
        keycloak.logout();
      });
    }, 30_000);

    return () => {
      window.clearInterval(refresh);
    };
  }, [isAuthenticated]);

  const login = useCallback(() => {
    void keycloak.login({ redirectUri: window.location.href });
  }, []);

  const register = useCallback(() => {
    void keycloak.register({ redirectUri: window.location.href });
  }, []);

  const logout = useCallback(() => {
    void keycloak.logout({ redirectUri: window.location.origin });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      profile,
      login,
      register,
      logout
    }),
    [isAuthenticated, isLoading, profile, login, register, logout]
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