import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { CurrentUser } from "@/types";
import { tokenStorage } from "@/services/api";
import * as authService from "@/services/authService";
import { getMyUnifiedProfile } from "@/services/lmsService";

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
      return null;
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
          } else {
            tokenStorage.clear();
          }
        }
      }
      setIsLoading(false);
    }
    bootstrap();
  }, []);

  const login = async (username: string, password: string) => {
    await authService.login(username, password);
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
    if (res.access_token) {
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
      localStorage.removeItem("el_access_token");
      localStorage.removeItem("el_refresh_token");
      sessionStorage.clear();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
