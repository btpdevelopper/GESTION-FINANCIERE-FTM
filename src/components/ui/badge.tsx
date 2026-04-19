const BASE = "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium";

const ROLE_VARIANTS: Record<string, string> = {
  MOA: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  MOE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  ENTREPRISE: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const STATUS_VARIANTS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  SUBMITTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  MOE_CORRECTION: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  MOE_APPROVED: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  MOA_APPROVED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  MOE_REFUSED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  MOA_REFUSED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const NEUTRAL = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

export function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_VARIANTS[role] ?? NEUTRAL;
  return <span className={`${BASE} ${cls} uppercase tracking-wide`}>{role}</span>;
}

export function StatusBadge({
  status,
  label,
  icon,
}: {
  status: string;
  label: string;
  icon?: React.ReactNode;
}) {
  const cls = STATUS_VARIANTS[status] ?? NEUTRAL;
  return (
    <span className={`${BASE} ${cls}`}>
      {icon}
      {label}
    </span>
  );
}

export function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`${BASE} ${NEUTRAL} ${className}`}>{children}</span>;
}

export function roleBadgeClass(role: string): string {
  return `${BASE} ${ROLE_VARIANTS[role] ?? NEUTRAL} uppercase tracking-wide`;
}

export function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded bg-amber-500 px-1 text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
