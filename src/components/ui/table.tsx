import * as React from "react";

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={`w-full caption-bottom text-sm ${className ?? ""}`} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={`[&_tr]:border-b ${className ?? ""}`} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={`[&_tr:last-child]:border-0 ${className ?? ""}`} {...props} />;
}

export function TableFooter({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      className={`border-t border-slate-200 bg-slate-50 font-medium dark:border-slate-700 dark:bg-slate-900 ${className ?? ""}`}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/50 ${className ?? ""}`}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`h-9 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${className ?? ""}`}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={`px-3 py-2 align-middle text-sm text-slate-700 dark:text-slate-300 ${className ?? ""}`}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption
      className={`mt-4 text-sm text-slate-500 dark:text-slate-400 ${className ?? ""}`}
      {...props}
    />
  );
}
