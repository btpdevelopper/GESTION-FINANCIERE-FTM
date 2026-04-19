type Variant = "error" | "warning" | "success" | "info";

const VARIANTS: Record<Variant, string> = {
  error:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400",
  info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-400",
};

export function Alert({
  variant = "error",
  children,
  className = "",
}: {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded border px-3 py-2 text-sm ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
