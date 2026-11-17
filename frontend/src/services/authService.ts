import { api, tokenStorage } from "./api";
import { CurrentUser } from "@/types";

export interface TeacherPublic {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface GroupPublic {
  id: string;
  name: string;
  english_level: string;
  schedule: string | null;
  teacher_id?: string | null;
  teacher_name?: string | null;
  created_by?: string | null;
  student_count?: number;
}

export async function fetchPublicTeachers(): Promise<TeacherPublic[]> {
  const { data } = await api.get("/auth/teachers/public");
  return data;
}

export async function login(username: string, password: string) {
  // Use relative path – axios baseURL is already /api/v1
  const { data } = await api.post("/auth/login", { username, password });
  const accessToken = data.access_token || data.token;
  const refreshToken = data.refresh_token || data.refreshToken;
  if (accessToken) {
    tokenStorage.setTokens(accessToken, refreshToken);
  }
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

  // Use relative path – axios baseURL is already /api/v1
  const { data } = await api.post("/auth/register", payload);
  const accessToken = data.access_token || data.token;
  const refreshToken = data.refresh_token || data.refreshToken;
  if (accessToken) {
    tokenStorage.setTokens(accessToken, refreshToken);
  }
  return data;
}

export async function fetchPublicGroups(teacherId?: string): Promise<GroupPublic[]> {
  const params = teacherId ? { teacher_id: teacherId } : undefined;
  const { data } = await api.get("/auth/groups/public", { params });
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
  // Use relative path – axios baseURL is already /api/v1
  const token = tokenStorage.getAccess();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const { data } = await api.get("/auth/me", { headers });
  return data;
}
