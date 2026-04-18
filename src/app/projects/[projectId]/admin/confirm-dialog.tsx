"use client";

import { AlertTriangle } from "lucide-react";
import { useState, useTransition } from "react";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  tone = "danger",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : "bg-indigo-600 hover:bg-indigo-500 text-white";

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          {tone === "danger" && <AlertTriangle className="h-5 w-5 text-red-500" />}
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
        </div>
        <p className="mb-5 text-sm text-slate-600 dark:text-slate-400">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await onConfirm();
                onClose();
              });
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-md transition-all active:scale-95 hover:shadow-lg disabled:opacity-50 ${confirmClass}`}
          >
            {pending ? "Patientez..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    tone?: "danger" | "primary";
    onConfirm: () => void | Promise<void>;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  const ask = (opts: Omit<typeof state, "open">) => setState({ ...opts, open: true });
  const close = () => setState((s) => ({ ...s, open: false }));

  return { state, ask, close };
}
