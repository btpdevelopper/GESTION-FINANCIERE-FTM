import { forwardRef } from "react";

type Variant = "primary" | "ghost" | "danger" | "danger-solid";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40";

const VARIANTS: Record<Variant, string> = {
  primary:
    "border border-transparent bg-slate-800 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200",
  ghost:
    "border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
  danger:
    "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50",
  "danger-solid":
    "border border-transparent bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-500",
};

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
  lg: "px-4 py-2 text-sm",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => {
    const cls = [BASE, VARIANTS[variant], SIZES[size], className]
      .filter(Boolean)
      .join(" ");
    return <button ref={ref} className={cls} {...props} />;
  },
);

Button.displayName = "Button";
