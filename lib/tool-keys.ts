/** Identifiants des outils interactifs disponibles (à tenir synchronisé avec components/ToolRunner.tsx). */
export const toolKeys = ["seo", "headers", "email-auth", "roas", "cart", "abtest", "password-leak", "image-compress"] as const;
export type ToolKey = (typeof toolKeys)[number];
