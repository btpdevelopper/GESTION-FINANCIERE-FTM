"use client";

import { createClient } from "@/lib/supabase/client";
import { sendPasswordResetAction } from "@/server/auth/reset-password-action";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
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
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (signError) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    window.location.href = callbackUrl;
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
        <Alert variant="success" className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          <p className="font-medium">
            Email envoyé à <span className="font-semibold">{email}</span>
          </p>
          <p className="text-xs opacity-80">
            Cliquez sur le lien dans l&apos;email pour définir votre mot de passe. Vérifiez aussi
            vos spams si vous ne le recevez pas dans quelques minutes.
          </p>
        </Alert>
        <Button
          variant="ghost"
          size="lg"
          className="w-full border border-slate-200 dark:border-slate-700"
          onClick={() => {
            setView("login");
            setError(null);
            setIsFirstConnection(false);
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la connexion
        </Button>
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
        <Button type="submit" size="lg" disabled={pending} className="w-full justify-center">
          {pending ? "Envoi en cours…" : "Envoyer le lien"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setView("login");
            setError(null);
            setIsFirstConnection(false);
          }}
          className="flex w-full items-center justify-center gap-2 text-sm text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
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
      <Button type="submit" size="lg" disabled={pending} className="w-full justify-center">
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
