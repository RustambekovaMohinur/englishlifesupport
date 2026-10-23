import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { apiCache } from "./apiCache";

export { apiCache };

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
    apiCache.invalidate();
  },
};

export const API_URL = "https://englishlifesupport-s3dp.onrender.com";
export const RAW_API_URL = "https://englishlifesupport-s3dp.onrender.com";
export const API_BASE_URL = "https://englishlifesupport-s3dp.onrender.com/api/v1";

console.log("BASE_URL:", API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json", ...(tokenStorage.getAccess() ? { Authorization: `Bearer ${tokenStorage.getAccess()}` } : {}) },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  // Ensure token is attached for all non-public routes
  const isPublicAuthRoute = config.url && (
    config.url.endsWith("/auth/login") ||
    config.url.endsWith("/auth/register") ||
    config.url.endsWith("/auth/groups/public")
  );
  const token = !isPublicAuthRoute ? tokenStorage.getAccess() : null;
  if (token) {
    if (!config.headers) config.headers = {} as any;
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Normalize URL to prevent duplicate /api/v1 or /api prefixes with baseURL
  if (config.url) {
    if (config.url.startsWith("/api/v1/")) {
      config.url = config.url.slice(7);
    } else if (config.url === "/api/v1") {
      config.url = "";
    } else if (config.url.startsWith("/api/")) {
      config.url = config.url.slice(4);
    } else if (config.url === "/api") {
      config.url = "";
    }
  }
  // Existing Content-Type handling unchanged
  if (typeof FormData !== "undefined" && config.data instanceof FormData && config.headers) {
    if (typeof config.headers.delete === "function") {
      config.headers.delete("Content-Type");
    } else {
      delete (config.headers as Record<string, unknown>)["Content-Type"];
    }
  }
  return config;
});

export function getFileUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("blob:") || path.startsWith("data:")) return path;

  let cleanPath = path;
  if (cleanPath.startsWith("/submissions/") || cleanPath.startsWith("/assignments/") || cleanPath.startsWith("/users/")) {
    cleanPath = `/api${cleanPath}`;
  } else if (
    !cleanPath.startsWith("/api/") &&
    !cleanPath.startsWith("/media/") &&
    !cleanPath.startsWith("/static/") &&
    !cleanPath.startsWith("/uploads/")
  ) {
    cleanPath = cleanPath.startsWith("/") ? `/api${cleanPath}` : `/api/${cleanPath}`;
  }

  if (RAW_API_URL && RAW_API_URL.startsWith("http")) {
    const origin = new URL(RAW_API_URL).origin;
    return `${origin}${cleanPath.startsWith("/") ? "" : "/"}${cleanPath}`;
  }
  return cleanPath;
}

export function getAuthenticatedImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;

  if (url.startsWith("http://") || url.startsWith("https://")) {
    if (RAW_API_URL && RAW_API_URL.startsWith("http")) {
      try {
        const backendOrigin = new URL(RAW_API_URL).origin;
        if (!url.startsWith(backendOrigin)) {
          return url;
        }
      } catch {}
    } else {
      try {
        const parsed = new URL(url);
        if (parsed.origin !== window.location.origin) {
          return url;
        }
      } catch {}
    }
  }

  const token = tokenStorage.getAccess();
  const fullUrl = getFileUrl(url);
  if (!token) return fullUrl;
  if (fullUrl.includes("token=")) return fullUrl;
  const separator = fullUrl.includes("?") ? "&" : "?";
  return `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
}

function toApiPath(fileUrl: string): string {
  if (!fileUrl) return "";
  try {
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
      const parsed = new URL(fileUrl);
      fileUrl = parsed.pathname;
    }
  } catch {}
  if (fileUrl.startsWith("/api/")) return fileUrl.slice(4);
  if (fileUrl.startsWith("/")) return fileUrl;
  return `/${fileUrl}`;
}

export async function downloadAuthenticatedFile(fileUrl: string, filename?: string) {
  const path = toApiPath(fileUrl);
  const response = await api.get<Blob>(path, { responseType: "blob" });

  if (response.data.type?.includes("application/json")) {
    const text = await response.data.text();
    try {
      const err = JSON.parse(text);
      throw new Error(err?.detail || err?.message || "Failed to download file");
    } catch (e: any) {
      throw new Error(e?.message || "Failed to download file");
    }
  }

  let downloadFilename = filename;
  const disposition = response.headers?.["content-disposition"] || response.headers?.["Content-Disposition"];
  if (!downloadFilename && disposition) {
    const match = String(disposition).match(/filename[^;=\\n]*=((['"]).*?\\2|[^;\\n]*)/);
    if (match && match[1]) {
      downloadFilename = match[1].replace(/['"]/g, "");
    }
  }

  const objectUrl = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = downloadFilename || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

export async function fetchAuthenticatedBlobUrl(fileUrl: string): Promise<string> {
  if (!fileUrl) throw new Error("Empty file URL");
  if (fileUrl.startsWith("blob:") || fileUrl.startsWith("data:")) return fileUrl;

  // If it's an external URL (e.g. presigned S3 / B2 URL), fetch directly without adding /api or bearer token
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    let isOurBackend = false;
    if (RAW_API_URL && RAW_API_URL.startsWith("http")) {
      try {
        isOurBackend = fileUrl.startsWith(new URL(RAW_API_URL).origin);
      } catch {}
    }
    if (!isOurBackend) {
      try {
        const resp = await axios.get<Blob>(fileUrl, { responseType: "blob" });
        return URL.createObjectURL(resp.data);
      } catch {
        // Direct browser can render external presigned media tag without CORS fetch
        return fileUrl;
      }
    }
  }

  const path = toApiPath(fileUrl);
  // For submission / assignment image & file endpoints, pass redirect=false to stream bytes directly from backend
  const sep = path.includes("?") ? "&" : "?";
  const needsNoRedirect = (path.includes("/images/") || path.includes("/files/") || path.includes("/file")) && !path.includes("redirect=");
  const finalPath = needsNoRedirect ? `${path}${sep}redirect=false` : path;

  const { data, headers } = await api.get<Blob>(finalPath, { responseType: "blob" });
  let blob = data;
  const rawContentType = headers?.["content-type"] || headers?.["Content-Type"] || blob.type;
  const contentType = typeof rawContentType === "string" ? rawContentType : "";
  if (!blob.type || blob.type === "application/octet-stream" || !blob.type.includes("/")) {
    let deducedType = contentType && contentType !== "application/octet-stream" ? contentType : "";
    const disp = typeof headers?.["content-disposition"] === "string" ? headers["content-disposition"] : "";
    const lower = (fileUrl + " " + disp).toLowerCase();
    if (!deducedType) {
      if (lower.includes(".m4a") || lower.includes(".mp4")) deducedType = "audio/mp4";
      else if (lower.includes(".webm")) deducedType = "audio/webm";
      else if (lower.includes(".mp3")) deducedType = "audio/mpeg";
      else if (lower.includes(".wav")) deducedType = "audio/wav";
      else if (lower.includes(".ogg")) deducedType = "audio/ogg";
      else if (lower.includes(".jpg") || lower.includes(".jpeg")) deducedType = "image/jpeg";
      else if (lower.includes(".png")) deducedType = "image/png";
      else if (lower.includes(".webp")) deducedType = "image/webp";
      else if (lower.includes("audio") || fileUrl.includes("/file")) deducedType = "audio/mp4";
    }
    if (deducedType) {
      blob = new Blob([data], { type: deducedType });
    }
  }
  return URL.createObjectURL(blob);
}

let isRefreshing = false;
let refreshQueue: ((token: string | null) => void)[] = [];

function onRefreshed(token: string | null) {
  refreshQueue.forEach((callback) => callback(token));
  refreshQueue = [];
}

api.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toUpperCase();
    if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const url = response.config.url || "";
      if (url.includes("/assignments") || url.includes("/submissions")) {
        apiCache.invalidate("/assignments");
        apiCache.invalidate("/submissions");
        apiCache.invalidate("/dashboard");
      } else if (url.includes("/wordlists")) {
        apiCache.invalidate("/wordlists");
        apiCache.invalidate("/dashboard");
      } else if (url.includes("/groups")) {
        apiCache.invalidate("/groups");
        apiCache.invalidate("/dashboard");
      } else if (url.includes("/students")) {
        apiCache.invalidate("/students");
        apiCache.invalidate("/dashboard");
      } else if (url.includes("/feedback")) {
        apiCache.invalidate("/feedback");
      } else if (url.includes("/gamification")) {
        apiCache.invalidate("/gamification");
      } else {
        apiCache.invalidate(url);
      }
    }
    return response;
  },
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
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
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
