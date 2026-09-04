import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { CurrentUser } from "@/types";
import { tokenStorage } from "@/services/api";
import * as authService from "@/services/authService";

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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      if (tokenStorage.getAccess()) {
        try {
          const me = await authService.fetchCurrentUser();
          setUser(me);
        } catch {
          tokenStorage.clear();
        }
      }
      setIsLoading(false);
    }
    bootstrap();
  }, []);

  const login = async (username: string, password: string) => {
    await authService.login(username, password);
    const me = await authService.fetchCurrentUser();
    setUser(me);
    return me;
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
      setUser(me);
      return me;
    }
    return null;
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
