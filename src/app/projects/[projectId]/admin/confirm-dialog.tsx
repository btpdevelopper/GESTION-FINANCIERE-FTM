"use client";

import { AlertTriangle } from "lucide-react";
import { useState, useTransition } from "react";
import { ModalOverlay, ModalContainer } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

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

  return (
    <ModalOverlay>
      <ModalContainer>
        <div className="mb-3 flex items-center gap-2">
          {tone === "danger" && <AlertTriangle className="h-4 w-4 text-red-500" />}
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        </div>
        <p className="mb-5 text-sm text-slate-600 dark:text-slate-400">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger-solid" : "primary"}
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await onConfirm();
                onClose();
              });
            }}
          >
            {pending ? "Patientez..." : confirmLabel}
          </Button>
        </div>
      </ModalContainer>
    </ModalOverlay>
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
