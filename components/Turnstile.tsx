"use client";
import Script from "next/script";
import { useEffect } from "react";

declare global { interface Window { turnstile?: { reset: () => void } } }

/** Widget anti-robot. Le jeton est à usage unique : il est réinitialisé après chaque réponse du serveur (`resetKey`). */
export function Turnstile({ resetKey, className = "" }: { resetKey?: unknown; className?: string }) {
  const site = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => { try { window.turnstile?.reset(); } catch { /* widget pas encore chargé */ } }, [resetKey]);
  if (!site) return null;
  return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" /><div className={`cf-turnstile ${className}`} data-sitekey={site} data-language="fr" /></>;
}
