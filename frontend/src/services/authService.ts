import { api, tokenStorage } from "./api";
import { CurrentUser } from "@/types";

export async function login(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  tokenStorage.setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function register(email: string, password: string, full_name: string, phone?: string) {
  const { data } = await api.post("/auth/register", { email, password, full_name, phone });
  tokenStorage.setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function logout() {
  const refreshToken = tokenStorage.getRefresh();
  try {
    if (refreshToken) await api.post("/auth/logout", { refresh_token: refreshToken });
  } finally {
    tokenStorage.clear();
  }
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const { data } = await api.get("/auth/me");
  return data;
}
