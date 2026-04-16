import { FileText, MessageSquareText } from "lucide-react";

export function CompanyDemandContext({
  companyName,
  description,
  documents,
  requestedDate,
}: {
  companyName: string;
  description: string;
  documents: { id: string; name: string; url: string }[];
  requestedDate?: Date | null;
}) {
  return (
    <div className="mb-6 rounded-xl bg-gradient-to-br from-amber-50/80 to-orange-50/40 border border-amber-200/60 p-5 dark:from-amber-950/20 dark:to-orange-950/10 dark:border-amber-900/30 shadow-sm">
      <h4 className="text-sm font-bold text-amber-900 dark:text-amber-400 mb-3 flex items-center gap-2">
        <MessageSquareText className="w-4 h-4" />
        Demande initiale — {companyName}
      </h4>
      <div className="whitespace-pre-wrap text-sm text-amber-800 dark:text-amber-300/80 bg-white/60 dark:bg-black/20 p-4 rounded-lg border border-amber-100 dark:border-amber-900/20 leading-relaxed">
        {description}
      </div>

      {requestedDate && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          <span className="font-semibold">Date de réponse souhaitée :</span>
          <span className="font-medium">
            {new Date(requestedDate).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
      )}
      
      {documents.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-amber-900/60 dark:text-amber-500/60 uppercase tracking-wider mb-2">
            Documents joints à la demande
          </p>
          <div className="flex flex-wrap gap-2">
            {documents.map((doc) => (
              <a
                key={doc.id}
                href={`/api/ftm-doc?path=${encodeURIComponent(doc.url)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-100/50 px-2.5 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-900/60"
              >
                <FileText className="w-3 h-3" />
                {doc.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
