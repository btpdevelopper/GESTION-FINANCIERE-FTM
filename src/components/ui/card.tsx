export function Card({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardSubsection({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
