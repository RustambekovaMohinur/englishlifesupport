import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const ACCESS_TOKEN_KEY = "el_access_token";
const REFRESH_TOKEN_KEY = "el_refresh_token";

export const tokenStorage = {
  getAccess: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setTokens: (access: string, refresh: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  setAccess: (access: string) => localStorage.setItem(ACCESS_TOKEN_KEY, access),
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccess();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Default JSON Content-Type (and a manual multipart type without a boundary)
  // prevent the browser from sending a valid FormData body.
  if (typeof FormData !== "undefined" && config.data instanceof FormData && config.headers) {
    if (typeof config.headers.delete === "function") {
      config.headers.delete("Content-Type");
    } else {
      delete (config.headers as Record<string, unknown>)["Content-Type"];
    }
  }
  return config;
});

function toApiPath(fileUrl: string): string {
  if (fileUrl.startsWith("/api/")) return fileUrl.slice(4);
  return fileUrl;
}

export async function downloadAuthenticatedFile(fileUrl: string, filename?: string) {
  const { data } = await api.get<Blob>(toApiPath(fileUrl), { responseType: "blob" });
  const objectUrl = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

export async function fetchAuthenticatedBlobUrl(fileUrl: string): Promise<string> {
  const { data } = await api.get<Blob>(toApiPath(fileUrl), { responseType: "blob" });
  return URL.createObjectURL(data);
}

let isRefreshing = false;
let refreshQueue: ((token: string | null) => void)[] = [];

function onRefreshed(token: string | null) {
  refreshQueue.forEach((callback) => callback(token));
  refreshQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || originalRequest._retry || originalRequest.url?.includes("/auth/")) {
      return Promise.reject(error);
    }

    const refreshToken = tokenStorage.getRefresh();
    if (!refreshToken) {
      tokenStorage.clear();
      window.location.href = "/login";
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push((newToken) => {
          if (newToken && originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          } else {
            reject(error);
          }
        });
      });
    }

    isRefreshing = true;
    try {
      const { data } = await axios.post("/api/auth/refresh", { refresh_token: refreshToken });
      tokenStorage.setAccess(data.access_token);
      onRefreshed(data.access_token);
      isRefreshing = false;
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      }
      return api(originalRequest);
    } catch (refreshError) {
      isRefreshing = false;
      onRefreshed(null);
      tokenStorage.clear();
      window.location.href = "/login";
      return Promise.reject(refreshError);
    }
  }
);
