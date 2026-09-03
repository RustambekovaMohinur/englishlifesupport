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
  full_name_or_data: string | { firstName: string; lastName: string; telegram: string; groupId: string },
  phone?: string,
  group_id?: string
) {
  let payload: any;
  if (typeof full_name_or_data === "object") {
    payload = {
      username,
      password,
      first_name: full_name_or_data.firstName,
      last_name: full_name_or_data.lastName,
      full_name: `${full_name_or_data.firstName} ${full_name_or_data.lastName}`.trim(),
      telegram_username: full_name_or_data.telegram,
      phone: full_name_or_data.telegram,
      group_id: full_name_or_data.groupId,
    };
  } else {
    payload = {
      username,
      password,
      full_name: full_name_or_data,
      phone,
      group_id,
    };
  }

  const { data } = await api.post("/auth/register", payload);
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
