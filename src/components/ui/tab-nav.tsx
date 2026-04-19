"use client";

const ACTIVE =
  "border-b-2 border-slate-800 px-3 py-2.5 text-sm font-medium text-slate-900 dark:border-slate-100 dark:text-slate-100";
const INACTIVE =
  "border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200";

export function TabNav({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-0 border-b border-slate-200 dark:border-slate-800">
      {children}
    </div>
  );
}

export function TabNavButton({
  active,
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      className={`${active ? ACTIVE : INACTIVE} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabNavLink({
  active,
  children,
  className = "",
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { active: boolean }) {
  return (
    <a className={`${active ? ACTIVE : INACTIVE} ${className}`} {...props}>
      {children}
    </a>
  );
}

export { ACTIVE as TAB_ACTIVE_CLS, INACTIVE as TAB_INACTIVE_CLS };
