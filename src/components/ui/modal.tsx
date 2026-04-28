"use client";

import { X } from "lucide-react";

export function ModalOverlay({
  onClose,
  children,
}: {
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex animate-fade-in items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {children}
    </div>
  );
}

export function ModalContainer({
  children,
  maxWidth = "max-w-md",
  className = "",
}: {
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
}) {
  return (
    <div
      className={`w-full ${maxWidth} animate-scale-in rounded border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function ModalHeader({
  title,
  icon,
  onClose,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
        {icon}
        {title}
      </h3>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2">{children}</div>;
}
