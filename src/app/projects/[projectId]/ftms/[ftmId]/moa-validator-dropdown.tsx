"use client";

import { useState, useRef, useEffect } from "react";
import { UserCheck, Check } from "lucide-react";
import { setDesignatedMoaValidatorAction } from "@/server/ftm/ftm-actions";

export function MoaValidatorDropdown({
  projectId,
  ftmId,
  currentValidatorId,
  moaMembers,
}: {
  projectId: string;
  ftmId: string;
  currentValidatorId: string | null;
  moaMembers: any[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 focus:outline-none"
        title="Validateur MOA"
      >
        <UserCheck className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-64 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Validateur MOA</h3>
            <p className="text-[10px] text-slate-500">Sélectionnez le responsable final.</p>
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
             <button
               onClick={async () => {
                 setOpen(false);
                 setIsPending(true);
                 await setDesignatedMoaValidatorAction({ projectId, ftmId, designatedMoaValidatorId: null });
                 setIsPending(false);
               }}
               className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 text-left"
             >
               <span>Aucun spécifique</span>
               {!currentValidatorId && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
             </button>
             {moaMembers.map((m) => (
               <button
                 key={m.id}
                 onClick={async () => {
                   setOpen(false);
                   setIsPending(true);
                   await setDesignatedMoaValidatorAction({ projectId, ftmId, designatedMoaValidatorId: m.id });
                   setIsPending(false);
                 }}
                 className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 text-left"
               >
                 <span className="truncate pr-2">{m.user.name ?? m.user.email} ({m.organization.name})</span>
                 {currentValidatorId === m.id && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
               </button>
             ))}
          </div>
        </div>
      )}
    </div>
  );
}
