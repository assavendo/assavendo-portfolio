"use client";
import Script from "next/script";
import { useEffect, useRef } from "react";

declare global { interface Window { turnstile?: { render: (container: HTMLElement, options: { sitekey: string; language?: string }) => string; reset: (widgetId?: string) => void } } }

/** Widget anti-robot. Le jeton est à usage unique : il est réinitialisé après chaque réponse du serveur (`resetKey`). */
export function Turnstile({ resetKey, className = "" }: { resetKey?: unknown; className?: string }) {
  const site = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!site) return;
    let timer: number | undefined;
    const render = () => {
      if (!window.turnstile || !containerRef.current || widgetId.current) return Boolean(widgetId.current);
      widgetId.current = window.turnstile.render(containerRef.current, { sitekey: site, language: "fr" });
      return true;
    };
    if (!render()) timer = window.setInterval(() => { if (render() && timer) window.clearInterval(timer); }, 100);
    return () => { if (timer) window.clearInterval(timer); };
  }, [site]);

  useEffect(() => {
    if (widgetId.current) {
      try { window.turnstile?.reset(widgetId.current); } catch { /* widget pas encore chargé */ }
    }
  }, [resetKey]);

  if (!site) return null;
  return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" /><div ref={containerRef} className={`cf-turnstile ${className}`} /></>;
}
