"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { CountBadge } from "@/components/ui";

type ProjectCard = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
};

export function ProjectGrid({
  projects,
  countMap,
}: {
  projects: ProjectCard[];
  countMap: Record<string, number>;
}) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? projects.filter((p) => {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.code?.toLowerCase().includes(q) ?? false) ||
          (p.city?.toLowerCase().includes(q) ?? false)
        );
      })
    : projects;

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Rechercher un projet ou une ville…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">
          Aucun projet ne correspond à « {search} ».
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const total = countMap[p.id] ?? 0;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex flex-col justify-between rounded border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.code && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {p.code}
                      </span>
                    )}
                    {p.city && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {p.city}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {total > 0 && <CountBadge count={total} />}
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </div>
                </div>
                <div className="mt-3">
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {p.name}
                  </p>
                  {(p.startDate || p.endDate) && (
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      {p.startDate &&
                        new Date(p.startDate).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      {p.startDate && p.endDate && " → "}
                      {p.endDate &&
                        new Date(p.endDate).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">Accéder au projet →</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
