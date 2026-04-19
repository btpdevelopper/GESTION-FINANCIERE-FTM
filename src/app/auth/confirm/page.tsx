"use client";

/**
 * Hash-fragment auth confirmation page.
 *
 * Links generated via supabase.auth.admin.generateLink() use the token (implicit)
 * flow, not PKCE. Supabase verifies the token server-side, then redirects here
 * with the session in the URL hash (#access_token=...&refresh_token=...&type=recovery|invite).
 *
 * Hash fragments are never sent to the server, so a Route Handler can't read
 * them. Additionally, the @supabase/ssr browser client defaults to flowType
 * "pkce" and will NOT auto-process hash fragments — so detectSessionInUrl
 * silently does nothing here. We must parse the hash and call setSession()
 * explicitly.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { KeyRound, AlertCircle } from "lucide-react";

type Status = "loading" | "error";

export default function AuthConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        // Parse hash fragment: #access_token=...&refresh_token=...&type=recovery
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const params = new URLSearchParams(hash);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");
        const errorCode = params.get("error") ?? params.get("error_code");
        const errorDescription = params.get("error_description");

        if (errorCode || errorDescription) {
          setErrorMsg(
            errorDescription?.replace(/\+/g, " ") ??
              "Le lien est invalide ou a expiré.",
          );
          setStatus("error");
          return;
        }

        if (!accessToken || !refreshToken) {
          setErrorMsg(
            "Lien invalide — aucun jeton de session trouvé. Demandez un nouveau lien depuis la page de connexion.",
          );
          setStatus("error");
          return;
        }

        const supabase = createClient();
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          setErrorMsg(sessionError.message);
          setStatus("error");
          return;
        }

        // Clean the hash from the URL so refreshing doesn't retry a spent token
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );

        // Route based on link type
        if (type === "recovery" || type === "invite" || type === "signup") {
          router.replace("/auth/update-password");
        } else {
          router.replace("/projects");
        }
      } catch (err) {
        console.error("[auth/confirm] unexpected error:", err);
        setErrorMsg("Erreur inattendue lors de la vérification du lien.");
        setStatus("error");
      }
    })();
  }, [router]);

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-red-100 bg-white p-8 text-center shadow-xl dark:border-red-900/30 dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/50">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
            Lien invalide ou expiré
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{errorMsg}</p>
          <a
            href="/login"
            className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Retour à la connexion
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/50">
          <KeyRound className="h-6 w-6 animate-pulse text-indigo-600 dark:text-indigo-400" />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Vérification en cours…
        </p>
      </div>
    </main>
  );
}
