import { forwardRef } from "react";

const INPUT_CLS =
  "w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className = "", ...props }, ref) => (
  <input ref={ref} className={`${INPUT_CLS} ${className}`} {...props} />
));

Input.displayName = "Input";

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className = "", ...props }, ref) => (
  <select ref={ref} className={`${INPUT_CLS} ${className}`} {...props} />
));

Select.displayName = "Select";

export { INPUT_CLS };
