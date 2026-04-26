"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type SortingState,
  type Column,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { type FtmItem } from "./kanban-board";
import { Badge } from "@/components/ui";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

// ── Types ─────────────────────────────────────────────────────────────────────

type DerivedRow = FtmItem & {
  submittedCount: number;
  approvedCount: number;
  pendingAmt: number | null;
  validatedAmt: number | null;
};

// ── Config ────────────────────────────────────────────────────────────────────

const PHASE_LABEL: Record<string, string> = {
  ETUDES: "Études",
  QUOTING: "Cotation",
  ANALYSIS: "Analyse",
  MOA_FINAL: "Décision MOA",
  ACCEPTED: "Accepté",
  CANCELLED: "Annulé",
};

const PHASE_CLS: Record<string, string> = {
  ETUDES: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  QUOTING: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  ANALYSIS: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  MOA_FINAL: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  ACCEPTED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  CANCELLED: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

const PHASE_ORDER = ["ETUDES", "QUOTING", "ANALYSIS", "MOA_FINAL", "ACCEPTED", "CANCELLED"];

const PENDING_PHASES = new Set(["QUOTING", "ANALYSIS", "MOA_FINAL"]);

// ── Pure helpers ──────────────────────────────────────────────────────────────

function formatAmt(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function getLatestSub(
  subs: FtmItem["quoteSubmissions"],
): FtmItem["quoteSubmissions"][0] | null {
  return subs.reduce<FtmItem["quoteSubmissions"][0] | null>(
    (best, s) => (!best || s.indice > best.indice ? s : best),
    null,
  );
}

function deriveRow(ftm: FtmItem): DerivedRow {
  // Group submissions by org, keep the one with the highest indice per org
  const latestByOrg = new Map<string, FtmItem["quoteSubmissions"][0]>();
  for (const sub of ftm.quoteSubmissions) {
    const existing = latestByOrg.get(sub.organizationId);
    if (!existing || sub.indice > existing.indice) {
      latestByOrg.set(sub.organizationId, sub);
    }
  }

  const latestSubs = [...latestByOrg.values()];
  const submittedCount = latestSubs.length;
  const approvedCount = latestSubs.filter((s) => s.reviews[0]?.decision === "ACCEPT").length;

  const totalCents = latestSubs.reduce((sum, s) => sum + Number(s.amountHtCents), 0);

  return {
    ...ftm,
    submittedCount,
    approvedCount,
    pendingAmt: PENDING_PHASES.has(ftm.phase) ? totalCents : null,
    validatedAmt: ftm.phase === "ACCEPTED" ? totalCents : null,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

const BADGE_BASE = "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium";

function SortHeader({
  column,
  label,
  align = "left",
}: {
  column: Column<DerivedRow, unknown>;
  label: string;
  align?: "left" | "center" | "right";
}) {
  const sorted = column.getIsSorted();
  const justifyCls =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <button
      className={`flex w-full items-center gap-1 ${justifyCls} hover:text-slate-900 dark:hover:text-slate-100`}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sorted === "asc" ? (
        <ChevronUp className="h-3 w-3 shrink-0" />
      ) : sorted === "desc" ? (
        <ChevronDown className="h-3 w-3 shrink-0" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
      )}
    </button>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  return (
    <span className={`${BADGE_BASE} ${PHASE_CLS[phase] ?? "bg-slate-100 text-slate-600"}`}>
      {PHASE_LABEL[phase] ?? phase}
    </span>
  );
}

function CompanyBadges({ orgs }: { orgs: FtmItem["concernedOrgs"] }) {
  const MAX = 2;
  const shown = orgs.slice(0, MAX);
  const extra = orgs.length - MAX;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((o) => (
        <Badge key={o.organizationId}>{o.organization.name}</Badge>
      ))}
      {extra > 0 && (
        <span className={`${BADGE_BASE} bg-slate-100 text-slate-400 dark:bg-slate-800`}>
          +{extra}
        </span>
      )}
    </div>
  );
}

const QUOTE_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ACCEPT: {
    label: "Accepté",
    cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  },
  RESEND_CORRECTION: {
    label: "Correction",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  DECLINE: {
    label: "Refusé",
    cls: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
  },
};

function QuoteStatusBadge({ sub }: { sub: FtmItem["quoteSubmissions"][0] | null }) {
  if (!sub) return <span className="text-slate-400">—</span>;
  const d = sub.reviews[0]?.decision;
  if (!d) {
    return (
      <span className={`${BADGE_BASE} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400`}>
        En attente
      </span>
    );
  }
  const cfg = QUOTE_STATUS_MAP[d] ?? { label: d, cls: "bg-slate-100 text-slate-600" };
  return <span className={`${BADGE_BASE} ${cfg.cls}`}>{cfg.label}</span>;
}

// ── Column definitions ────────────────────────────────────────────────────────

function buildMoaColumns(): ColumnDef<DerivedRow>[] {
  return [
    {
      accessorKey: "number",
      size: 60,
      header: ({ column }) => <SortHeader column={column} label="#" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-500">#{row.original.number}</span>
      ),
    },
    {
      accessorKey: "title",
      header: ({ column }) => <SortHeader column={column} label="Titre" />,
      cell: ({ row }) => (
        <span
          className={`font-medium ${row.original.phase === "CANCELLED" ? "text-slate-400 line-through" : "text-slate-900 dark:text-slate-100"}`}
        >
          {row.original.title}
        </span>
      ),
    },
    {
      id: "companies",
      enableSorting: false,
      header: () => (
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Entreprises
        </span>
      ),
      cell: ({ row }) => <CompanyBadges orgs={row.original.concernedOrgs} />,
    },
    {
      accessorKey: "phase",
      header: ({ column }) => <SortHeader column={column} label="Phase" />,
      sortingFn: (a, b) =>
        PHASE_ORDER.indexOf(a.original.phase) - PHASE_ORDER.indexOf(b.original.phase),
      cell: ({ row }) => <PhaseBadge phase={row.original.phase} />,
    },
    {
      accessorKey: "submittedCount",
      header: ({ column }) => (
        <SortHeader column={column} label="Devis soumis" align="center" />
      ),
      cell: ({ row }) => {
        const total = row.original.concernedOrgs.length;
        const submitted = row.original.submittedCount;
        return (
          <span className="block text-center tabular-nums">
            {total > 0 ? `${submitted}/${total}` : "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "approvedCount",
      header: ({ column }) => (
        <SortHeader column={column} label="Devis approuvés" align="center" />
      ),
      cell: ({ row }) => (
        <span className="block text-center tabular-nums">
          {row.original.approvedCount > 0 ? row.original.approvedCount : "—"}
        </span>
      ),
    },
    {
      accessorKey: "pendingAmt",
      header: ({ column }) => (
        <SortHeader column={column} label="Montant soumis" align="right" />
      ),
      cell: ({ row }) => (
        <span className="block text-right tabular-nums text-slate-700 dark:text-slate-300">
          {row.original.pendingAmt != null ? formatAmt(row.original.pendingAmt) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "validatedAmt",
      header: ({ column }) => (
        <SortHeader column={column} label="Montant validé" align="right" />
      ),
      cell: ({ row }) => (
        <span className="block text-right tabular-nums font-semibold text-green-700 dark:text-green-400">
          {row.original.validatedAmt != null ? formatAmt(row.original.validatedAmt) : "—"}
        </span>
      ),
    },
  ];
}

function buildEntrepriseColumns(): ColumnDef<DerivedRow>[] {
  return [
    {
      accessorKey: "number",
      size: 60,
      header: ({ column }) => <SortHeader column={column} label="#" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-500">#{row.original.number}</span>
      ),
    },
    {
      accessorKey: "title",
      header: ({ column }) => <SortHeader column={column} label="Titre" />,
      cell: ({ row }) => (
        <span
          className={`font-medium ${row.original.phase === "CANCELLED" ? "text-slate-400 line-through" : "text-slate-900 dark:text-slate-100"}`}
        >
          {row.original.title}
        </span>
      ),
    },
    {
      accessorKey: "phase",
      header: ({ column }) => <SortHeader column={column} label="Phase" />,
      sortingFn: (a, b) =>
        PHASE_ORDER.indexOf(a.original.phase) - PHASE_ORDER.indexOf(b.original.phase),
      cell: ({ row }) => <PhaseBadge phase={row.original.phase} />,
    },
    {
      id: "quoteStatus",
      // Sort by a numeric key: none=-1, awaiting=0, correction=1, refused=2, accepted=3
      accessorFn: (row) => {
        const sub = getLatestSub(row.quoteSubmissions);
        if (!sub) return -1;
        const d = sub.reviews[0]?.decision;
        if (!d) return 0;
        if (d === "RESEND_CORRECTION") return 1;
        if (d === "DECLINE") return 2;
        if (d === "ACCEPT") return 3;
        return 0;
      },
      header: ({ column }) => <SortHeader column={column} label="Statut devis" />,
      cell: ({ row }) => (
        <QuoteStatusBadge sub={getLatestSub(row.original.quoteSubmissions)} />
      ),
    },
    {
      id: "quoteAmount",
      accessorFn: (row) => {
        const sub = getLatestSub(row.quoteSubmissions);
        return sub ? Number(sub.amountHtCents) : -1;
      },
      header: ({ column }) => (
        <SortHeader column={column} label="Montant" align="right" />
      ),
      cell: ({ row }) => {
        const sub = getLatestSub(row.original.quoteSubmissions);
        return (
          <span className="block text-right tabular-nums">
            {sub ? formatAmt(Number(sub.amountHtCents)) : "—"}
          </span>
        );
      },
    },
  ];
}

// ── Main component ────────────────────────────────────────────────────────────

export function FtmTableView({
  projectId,
  ftms,
  isCompany = false,
}: {
  projectId: string;
  ftms: FtmItem[];
  isCompany?: boolean;
}) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: "number", desc: false }]);

  const derivedRows = useMemo(() => ftms.map(deriveRow), [ftms]);
  const columns = useMemo(
    () => (isCompany ? buildEntrepriseColumns() : buildMoaColumns()),
    [isCompany],
  );

  // Totals for footer (all rows, unaffected by sort order)
  const totals = useMemo(() => {
    if (isCompany) return null;
    return {
      submittedCount: derivedRows.reduce((s, r) => s + r.submittedCount, 0),
      concernedCount: derivedRows.reduce((s, r) => s + r.concernedOrgs.length, 0),
      approvedCount: derivedRows.reduce((s, r) => s + r.approvedCount, 0),
      pendingAmt: derivedRows.reduce((s, r) => s + (r.pendingAmt ?? 0), 0),
      validatedAmt: derivedRows.reduce((s, r) => s + (r.validatedAmt ?? 0), 0),
    };
  }, [derivedRows, isCompany]);

  const table = useReactTable({
    data: derivedRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded border border-slate-200 dark:border-slate-700">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow
              key={hg.id}
              className="hover:bg-transparent border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
            >
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={header.column.getSize() !== 150 ? { width: header.column.getSize() } : undefined}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-12 text-center text-slate-400"
              >
                Aucun FTM à afficher.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => {
              const isCancelled = row.original.phase === "CANCELLED";
              return (
                <TableRow
                  key={row.id}
                  onClick={() =>
                    router.push(`/projects/${projectId}/ftms/${row.original.id}`)
                  }
                  className={`cursor-pointer ${isCancelled ? "opacity-60" : ""}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>

        {/* Totals footer — MOE/MOA only */}
        {totals && (
          <TableFooter>
            <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-900">
              {/* Span #, Titre, Entreprises, Phase */}
              <TableCell colSpan={4} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total ({derivedRows.length} FTM{derivedRows.length > 1 ? "s" : ""})
              </TableCell>
              <TableCell className="text-center tabular-nums font-semibold">
                {totals.concernedCount > 0 ? `${totals.submittedCount}/${totals.concernedCount}` : "—"}
              </TableCell>
              <TableCell className="text-center tabular-nums font-semibold">
                {totals.approvedCount > 0 ? totals.approvedCount : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                {totals.pendingAmt > 0 ? formatAmt(totals.pendingAmt) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-green-700 dark:text-green-400">
                {totals.validatedAmt > 0 ? formatAmt(totals.validatedAmt) : "—"}
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
