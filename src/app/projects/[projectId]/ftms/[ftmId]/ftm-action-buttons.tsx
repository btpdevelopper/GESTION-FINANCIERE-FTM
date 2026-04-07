"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function FtmActionButton({
  label,
  action,
  variant = "primary",
}: {
  label: string;
  action: () => Promise<unknown>;
  variant?: "primary" | "danger";
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const cls =
    variant === "danger"
      ? "rounded bg-red-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
      : "rounded bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900";
  return (
    <button
      type="button"
      disabled={pending}
      className={cls}
      onClick={() =>
        start(async () => {
          await action();
          router.refresh();
        })
      }
    >
      {pending ? "…" : label}
    </button>
  );
}
