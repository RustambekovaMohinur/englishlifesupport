import React from "react";

export function PageLoadingFallback() {
  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center min-h-[45vh] p-6 space-y-3 animate-in fade-in duration-200">
      <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40 shadow-xs">
        <div className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
      </div>
      <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 animate-pulse">
        Loading view...
      </p>
    </div>
  );
}
