import { useEffect, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, X, XCircle } from "lucide-react";

export type StatusTone = "success" | "warning" | "danger" | "neutral";

/**
 * Zero-pill semantic status indicator: pairs color with icon + explicit text label.
 */
export function StatusText({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: StatusTone;
}) {
  const colorMap: Record<StatusTone, string> = {
    success: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-rose-700 dark:text-rose-400",
    neutral: "text-slate-600 dark:text-slate-400",
  };

  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning"
        ? Clock
        : tone === "danger"
          ? XCircle
          : AlertTriangle;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${colorMap[tone]}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  note,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: StatusTone;
  onClick?: () => void;
}) {
  const valueColor: Record<StatusTone, string> = {
    success: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-rose-700 dark:text-rose-400",
    neutral: "text-slate-900 dark:text-slate-100",
  };

  const baseClass =
    "w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-4 transition-colors duration-150";
  const interactiveClass = onClick
    ? "hover:border-teal-500/60 dark:hover:border-teal-500/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
    : "";

  const Content = (
    <>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div
        className={`mt-1.5 font-display text-2xl font-semibold tracking-tight tabular-nums ${valueColor[tone]}`}
      >
        {value}
      </div>
      {note && (
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
          {note}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${baseClass} ${interactiveClass}`}>
        {Content}
      </button>
    );
  }
  return <div className={baseClass}>{Content}</div>;
}

export function Modal({
  open,
  onClose,
  title,
  maxWidthClass = "max-w-lg",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  maxWidthClass?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E29] p-5 sm:p-6 shadow-xl text-slate-900 dark:text-slate-100`}
      >
        {title && (
          <div className="no-print flex items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-md p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidthClass="max-w-md">
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
        {description}
      </p>
      <div className="mt-6 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors whitespace-nowrap disabled:opacity-50 ${
            tone === "danger"
              ? "bg-rose-600 hover:bg-rose-700"
              : "bg-teal-600 hover:bg-teal-700"
          }`}
        >
          {busy ? "Working..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading table data">
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div key={rIdx} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((__, cIdx) => (
            <div
              key={cIdx}
              className="h-5 rounded bg-slate-100 dark:bg-slate-800/80 animate-pulse"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="py-12 px-6 text-center">
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
