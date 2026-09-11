import { useState } from "react";
import { getFileUrl } from "@/services/api";

export interface UserAvatarProps {
  src?: string | null;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  showBorder?: boolean;
}

const sizeClasses = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm font-semibold",
  lg: "h-12 w-12 text-base font-bold",
  xl: "h-16 w-16 text-xl font-bold",
};

export function getInitials(name?: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (name[0] || "U").toUpperCase();
}

export function UserAvatar({
  src,
  name = "User",
  size = "md",
  className = "",
  showBorder = true,
}: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const resolvedUrl = src ? getFileUrl(src) : null;
  const initials = getInitials(name);

  const baseSize = sizeClasses[size] || sizeClasses.md;
  const borderStyle = showBorder ? "ring-1 ring-black/10 dark:ring-white/10" : "";

  if (resolvedUrl && !hasError) {
    return (
      <div
        className={`relative shrink-0 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 ${baseSize} ${borderStyle} ${className}`}
        title={name}
      >
        <img
          src={resolvedUrl}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setHasError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`shrink-0 rounded-full flex items-center justify-center select-none bg-gradient-to-br from-indigo-500/15 to-brand-500/20 dark:from-indigo-900/40 dark:to-brand-900/40 text-indigo-700 dark:text-indigo-300 font-bold ${baseSize} ${borderStyle} ${className}`}
      title={name}
      aria-label={name}
    >
      <span>{initials}</span>
    </div>
  );
}
