"use client";

import { createClient } from "@/lib/supabase/client";
import { sendPasswordResetAction } from "@/server/auth/reset-password-action";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

type View = "login" | "reset" | "reset-sent";

const INPUT_CLS =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:focus:border-indigo-400 dark:focus:bg-slate-900 dark:focus:ring-indigo-400/10";

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/projects";

  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isFirstConnection, setIsFirstConnection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // ─── Login ────────────────────────────────────────────────────────────────
  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setPending(false);
    if (signError) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    window.location.href = callbackUrl;
  }

  // ─── Reset ────────────────────────────────────────────────────────────────
  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await sendPasswordResetAction({ email, isFirstConnection });
    setPending(false);
    if (!result.ok) {
      setError("Impossible d'envoyer l'email. Vérifiez l'adresse saisie.");
      return;
    }
    setView("reset-sent");
  }

  // ─── Reset sent ──────────────────────────────────────────────────────────
  if (view === "reset-sent") {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
            Email envoyé à <span className="font-semibold">{email}</span>
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Cliquez sur le lien dans l'email pour définir votre mot de passe.
            Vérifiez aussi vos spams si vous ne le recevez pas dans quelques
            minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setView("login"); setError(null); setIsFirstConnection(false); }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la connexion
        </button>
      </div>
    );
  }

  // ─── Reset form ──────────────────────────────────────────────────────────
  if (view === "reset") {
    return (
      <form className="space-y-5" onSubmit={onReset}>
        <div className="space-y-1">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Entrez votre adresse email et nous vous enverrons un lien pour
            définir ou réinitialiser votre mot de passe.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@entreprise.fr"
              className={`${INPUT_CLS} pl-9`}
            />
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="group relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-indigo-600 dark:hover:bg-indigo-500"
        >
          <span className="relative z-10">
            {pending ? "Envoi en cours…" : "Envoyer le lien"}
          </span>
          <div className="absolute inset-0 -translate-x-[150%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[150%]" />
        </button>
        <button
          type="button"
          onClick={() => { setView("login"); setError(null); setIsFirstConnection(false); }}
          className="flex w-full items-center justify-center gap-2 text-sm text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la connexion
        </button>
      </form>
    );
  }

  // ─── Login form ───────────────────────────────────────────────────────────
  return (
    <form className="space-y-5" onSubmit={onLogin}>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Email
        </label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@entreprise.fr"
          className={INPUT_CLS}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Mot de passe
          </label>
          <button
            type="button"
            onClick={() => { setView("reset"); setError(null); setIsFirstConnection(false); }}
            className="text-xs text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            Mot de passe oublié ?
          </button>
        </div>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className={INPUT_CLS}
        />
      </div>
      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="group relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-indigo-600 dark:hover:bg-indigo-500"
      >
        <span className="relative z-10">
          {pending ? "Connexion en cours…" : "Se connecter"}
        </span>
        <div className="absolute inset-0 -translate-x-[150%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[150%]" />
      </button>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Première connexion ?{" "}
        <button
          type="button"
          onClick={() => { setView("reset"); setError(null); setIsFirstConnection(true); }}
          className="font-medium text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-400"
        >
          Définir mon mot de passe
        </button>
      </p>
    </form>
  );
}
