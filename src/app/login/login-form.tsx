"use client";

import { signInAction } from "@/server/auth/sign-in-action";
import { sendPasswordResetAction } from "@/server/auth/reset-password-action";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type View = "login" | "reset" | "reset-sent";

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/projects";

  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isFirstConnection, setIsFirstConnection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await signInAction({ email, password, callbackUrl });
    // signInAction redirects on success; this branch is only reached on error.
    setPending(false);
    if (!result.ok) {
      setError(result.error);
    }
  }

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

  if (view === "reset-sent") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 rounded border border-teal-200 bg-teal-50 px-4 py-5 text-center dark:border-teal-800 dark:bg-teal-950/30">
          <CheckCircle2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          <p className="text-sm font-medium text-teal-800 dark:text-teal-300">
            Email envoyé à <span className="font-semibold">{email}</span>
          </p>
          <p className="text-xs text-teal-700 dark:text-teal-400">
            Cliquez sur le lien dans l&apos;email pour définir votre mot de passe. Vérifiez aussi
            vos spams si vous ne le recevez pas dans quelques minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setView("login");
            setError(null);
            setIsFirstConnection(false);
          }}
          className="flex w-full items-center justify-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-800 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour à la connexion
        </button>
      </div>
    );
  }

  if (view === "reset") {
    return (
      <form className="space-y-4" onSubmit={onReset}>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Entrez votre adresse email et nous vous enverrons un lien pour définir ou réinitialiser
          votre mot de passe.
        </p>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@entreprise.fr"
              className="pl-9"
            />
          </div>
        </div>
        {error && <Alert variant="error">{error}</Alert>}
        <Button type="submit" size="md" disabled={pending} className="w-full justify-center">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Envoi en cours…" : "Envoyer le lien"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setView("login");
            setError(null);
            setIsFirstConnection(false);
          }}
          className="flex w-full items-center justify-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-800 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour à la connexion
        </button>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onLogin}>
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@entreprise.fr"
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Mot de passe
          </label>
          <button
            type="button"
            onClick={() => {
              setView("reset");
              setError(null);
              setIsFirstConnection(false);
            }}
            className="text-xs text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Mot de passe oublié ?
          </button>
        </div>
        <Input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <Button type="submit" size="md" disabled={pending} className="w-full justify-center">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {pending ? "Connexion en cours…" : "Se connecter"}
      </Button>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Première connexion ?{" "}
        <button
          type="button"
          onClick={() => {
            setView("reset");
            setError(null);
            setIsFirstConnection(true);
          }}
          className="font-medium text-slate-700 underline transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
        >
          Définir mon mot de passe
        </button>
      </p>
    </form>
  );
}
