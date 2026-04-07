import { submitGuestEtudesContributionAction } from "@/server/ftm/guest-actions";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  async function submit(formData: FormData) {
    "use server";
    const text = String(formData.get("contribution") ?? "");
    await submitGuestEtudesContributionAction(token, text);
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-lg font-semibold">Contribution aux études (invité)</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Décrivez les modifications attendues. Ce lien est valable 72h.
      </p>
      <form action={submit} className="mt-6 flex flex-col gap-3">
        <textarea
          name="contribution"
          required
          rows={8}
          className="rounded-md border border-slate-300 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-900"
          placeholder="Votre contribution…"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          Envoyer
        </button>
      </form>
    </main>
  );
}
