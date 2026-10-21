"use client";
import dynamic from "next/dynamic";
import type { ToolKey } from "@/lib/tool-keys";

const loading = () => <p className="muted">Chargement de l'outil…</p>;
const tools: Record<ToolKey, React.ComponentType> = {
  seo: dynamic(() => import("./tools/SeoTool"), { loading }),
  headers: dynamic(() => import("./tools/HeadersTool"), { loading }),
  "email-auth": dynamic(() => import("./tools/EmailAuthTool"), { loading }),
  roas: dynamic(() => import("./tools/RoasTool"), { loading }),
  cart: dynamic(() => import("./tools/CartTool"), { loading }),
  abtest: dynamic(() => import("./tools/AbTool"), { loading }),
  "password-leak": dynamic(() => import("./tools/PasswordLeakTool"), { loading }),
  "image-compress": dynamic(() => import("./tools/ImageCompressTool"), { loading }),
  pagespeed: dynamic(() => import("./tools/PagespeedTool"), { loading }),
};
export function ToolRunner({ toolKey }: { toolKey: string }) {
  const T = (tools as Record<string, React.ComponentType>)[toolKey];
  return T ? <T /> : <p className="alert alert-err">Cet outil n'est pas encore disponible.</p>;
}
