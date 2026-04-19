export function EmptyState({
  icon,
  title,
  description,
  action,
  dashed = false,
  className = "",
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  dashed?: boolean;
  className?: string;
}) {
  const border = dashed
    ? "border-2 border-dashed border-slate-200 dark:border-slate-700"
    : "border border-slate-200 dark:border-slate-800";

  return (
    <div
      className={`rounded ${border} bg-white p-8 text-center dark:bg-slate-900 ${className}`}
    >
      {icon && (
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center text-slate-300 dark:text-slate-700">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
