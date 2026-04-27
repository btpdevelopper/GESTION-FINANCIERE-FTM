"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
    }
  ) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({ onVerify }: { onVerify: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    function tryRender() {
      if (cancelled || !containerRef.current) return;
      const t = window.turnstile;
      if (!t) {
        window.setTimeout(tryRender, 100);
        return;
      }
      widgetIdRef.current = t.render(containerRef.current, {
        sitekey: siteKey!,
        callback: (token: string) => onVerify(token),
        "error-callback": () => onVerify(""),
        "expired-callback": () => onVerify(""),
        theme: "auto",
      });
    }

    tryRender();
    return () => {
      cancelled = true;
      const t = window.turnstile;
      if (t && widgetIdRef.current) {
        try {
          t.remove(widgetIdRef.current);
        } catch {
          // widget already gone
        }
      }
    };
  }, [siteKey, onVerify]);

  if (!siteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
        strategy="afterInteractive"
      />
      <div ref={containerRef} />
    </>
  );
}
