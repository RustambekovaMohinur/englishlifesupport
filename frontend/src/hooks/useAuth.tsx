import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { CurrentUser } from "@/types";
import { tokenStorage } from "@/services/api";
import * as authService from "@/services/authService";

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  register: (email: string, password: string, fullName: string, phone?: string) => Promise<CurrentUser>;
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

  const login = async (email: string, password: string) => {
    await authService.login(email, password);
    const me = await authService.fetchCurrentUser();
    setUser(me);
    return me;
  };

  const register = async (email: string, password: string, fullName: string, phone?: string) => {
    await authService.register(email, password, fullName, phone);
    const me = await authService.fetchCurrentUser();
    setUser(me);
    return me;
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
