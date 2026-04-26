import Link from "next/link";
import * as React from "react";

const ACTIVE_SEG =
  "rounded bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100";
const INACTIVE_SEG =
  "rounded px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200";

export function SegmentedNav({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded bg-slate-100 p-0.5 dark:bg-slate-800/60">
      {children}
    </div>
  );
}

export function SegmentedNavLink({
  active,
  href,
  className = "",
  children,
}: {
  active: boolean;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${active ? ACTIVE_SEG : INACTIVE_SEG} ${className}`}>
      {children}
    </Link>
  );
}
