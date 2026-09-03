import { ReactNode, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { downloadAuthenticatedFile, fetchAuthenticatedBlobUrl } from "@/services/api";

export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <div className={`flex ${className} items-center justify-center rounded-xl bg-brand-500 font-extrabold text-white`}>
      AK
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-neutral-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  submitted: "bg-blue-50 text-blue-700",
  late: "bg-amber-50 text-amber-700",
  graded: "bg-green-50 text-green-700",
  active: "bg-green-50 text-green-700",
  inactive: "bg-neutral-100 text-neutral-500",
  published: "bg-emerald-50 text-emerald-700",
  draft: "bg-amber-50 text-amber-700",
  pending: "bg-neutral-100 text-neutral-600",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusStyles[status] ?? "bg-neutral-100 text-neutral-600"}`}>{status}</span>;
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className} text-brand-500`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
      <p className="text-base font-semibold text-neutral-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FileDownloadButton({
  url,
  filename,
  className,
  children,
}: {
  url: string;
  filename?: string | null;
  className?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await downloadAuthenticatedFile(url, filename ?? undefined);
    } catch {
      toast.error("Failed to download file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={className} onClick={handleClick} disabled={busy}>
      {busy ? "Downloading..." : children}
    </button>
  );
}

export function AuthenticatedAudio({ url, className }: { url: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchAuthenticatedBlobUrl(url)
      .then((blobUrl) => {
        objectUrl = blobUrl;
        if (!cancelled) setSrc(blobUrl);
        else URL.revokeObjectURL(blobUrl);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load audio");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (!src) return <p className="text-xs text-neutral-400">Loading audio...</p>;
  return <audio controls src={src} className={className} />;
}

export function useConfirm() {
  const [state, setState] = useState<{ open: boolean; message: string; onConfirm: () => void }>({
    open: false,
    message: "",
    onConfirm: () => {},
  });

  const confirm = (message: string, onConfirm: () => void) => setState({ open: true, message, onConfirm });
  const close = () => setState((s) => ({ ...s, open: false }));

  const ConfirmDialog = () =>
    state.open ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <p className="text-sm text-neutral-700">{state.message}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-secondary" onClick={close}>
              Cancel
            </button>
            <button
              className="btn-danger"
              onClick={() => {
                state.onConfirm();
                close();
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return { confirm, ConfirmDialog };
}
