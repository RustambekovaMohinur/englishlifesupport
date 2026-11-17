import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { CurrentUser } from "@/types";
import { tokenStorage } from "@/services/api";
import * as authService from "@/services/authService";
import { getMyUnifiedProfile } from "@/services/lmsService";
import { apiCache } from "@/services/apiCache";

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<CurrentUser>;
  register: (
    username: string,
    password: string,
    fullNameOrData: string | { firstName: string; lastName: string; telegram: string; groupId: string },
    phone?: string,
    groupId?: string
  ) => Promise<CurrentUser | null>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<CurrentUser | null>;
  updateUser: (fields: Partial<CurrentUser>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const enrichUser = async (baseUser: CurrentUser): Promise<CurrentUser> => {
    try {
      const profile = await getMyUnifiedProfile();
      return {
        ...baseUser,
        approval_status: profile.approval_status || baseUser.approval_status || "approved",
        full_name: profile.full_name || baseUser.full_name,
        first_name: profile.first_name || baseUser.first_name,
        avatar_url: profile.avatar_url || baseUser.avatar_url || null,
      };
    } catch {
      return baseUser;
    }
  };

  const checkAuth = async (): Promise<CurrentUser | null> => {
    if (!tokenStorage.getAccess()) {
      return null;
    }
    try {
      const me = await authService.fetchCurrentUser();
      const enriched = await enrichUser(me);
      setUser(enriched);
      return enriched;
    } catch (err: any) {
      if (err?.response?.status === 403 && err?.response?.data?.detail?.code === "ACCOUNT_PENDING_APPROVAL") {
        const pending: CurrentUser = {
          id: user?.id || "pending",
          email: user?.email || "",
          username: user?.username || "",
          role: "student",
          is_active: false,
          approval_status: "pending",
          full_name: user?.full_name,
          first_name: user?.first_name,
        };
        setUser(pending);
        return pending;
      }
      // For transient errors (network, 500, cold-start), preserve the existing
      // user state rather than dropping it. Only a 401 means the token is gone.
      if (err?.response?.status === 401) {
        tokenStorage.clear();
        setUser(null);
        return null;
      }
      // Return current cached user state if available
      return user ?? null;
    }
  };

  useEffect(() => {
    async function bootstrap() {
      if (tokenStorage.getAccess()) {
        try {
          const me = await authService.fetchCurrentUser();
          const enriched = await enrichUser(me);
          setUser(enriched);
        } catch (err: any) {
          if (err?.response?.status === 403 && err?.response?.data?.detail?.code === "ACCOUNT_PENDING_APPROVAL") {
            setUser({
              id: "pending",
              email: "",
              username: "",
              role: "student",
              is_active: false,
              approval_status: "pending",
            });
          } else if (err?.response?.status === 401) {
            // Token is definitively invalid/expired and the refresh interceptor
            // already failed — clear storage and let the user log in again.
            tokenStorage.clear();
          }
          // For all other errors (network timeout, 500, Render cold-start, etc.)
          // keep the token intact; the user is still authenticated, the server
          // just had a transient hiccup. The response interceptor will retry with
          // the refresh token when the next protected request is made.
        }
      }
      setIsLoading(false);
    }
    bootstrap();
  }, []);

  const login = async (username: string, password: string) => {
    const res = await authService.login(username, password);
    const token = res?.access_token || res?.token || tokenStorage.getAccess();
    if (token) {
      tokenStorage.setTokens(token, res?.refresh_token || res?.refreshToken);
    }
    const me = await authService.fetchCurrentUser();
    const enriched = await enrichUser(me);
    setUser(enriched);
    return enriched;
  };

  const register = async (
    username: string,
    password: string,
    fullNameOrData: string | { firstName: string; lastName: string; telegram: string; groupId: string },
    phone?: string,
    groupId?: string
  ) => {
    const res = await authService.register(username, password, fullNameOrData, phone, groupId);
    const token = res?.access_token || res?.token || tokenStorage.getAccess();
    if (token) {
      tokenStorage.setTokens(token, res?.refresh_token || res?.refreshToken);
      const me = await authService.fetchCurrentUser();
      const enriched = await enrichUser(me);
      setUser(enriched);
      return enriched;
    }
    // If registration is pending approval without immediate access token
    const firstName = typeof fullNameOrData === "object" ? fullNameOrData.firstName : fullNameOrData.split(" ")[0] || "";
    const fullName = typeof fullNameOrData === "object" ? `${fullNameOrData.firstName} ${fullNameOrData.lastName}`.trim() : fullNameOrData;
    const pendingUser: CurrentUser = {
      id: "pending",
      email: username.includes("@") ? username : "",
      username,
      role: "student",
      is_active: false,
      approval_status: "pending",
      full_name: fullName,
      first_name: firstName,
    };
    setUser(pendingUser);
    return pendingUser;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // ignore network errors on logout
    } finally {
      tokenStorage.clear();
      sessionStorage.clear();
      apiCache.invalidate();
      setUser(null);
    }
  };

  const updateUser = (fields: Partial<CurrentUser>) => {
    setUser((prev) => (prev ? { ...prev, ...fields } : null));
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, checkAuth, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
