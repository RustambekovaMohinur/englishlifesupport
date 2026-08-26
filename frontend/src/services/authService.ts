import { api, tokenStorage } from "./api";
import { CurrentUser } from "@/types";

export interface GroupPublic {
  id: string;
  name: string;
  english_level: string;
  schedule: string | null;
}

export async function login(username: string, password: string) {
  const { data } = await api.post("/auth/login", { username, password });
  tokenStorage.setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function register(
  username: string,
  password: string,
  full_name: string,
  phone: string | undefined,
  group_id: string
) {
  const { data } = await api.post("/auth/register", {
    username,
    password,
    full_name,
    phone,
    group_id,
  });
  tokenStorage.setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function fetchPublicGroups(): Promise<GroupPublic[]> {
  const { data } = await api.get("/auth/groups/public");
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
