/** Helpers purs du connecteur fournisseur : aucune dépendance Next/Supabase, donc testables directement avec Node. */
export function getByPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split(".").filter(Boolean).reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return (current as Record<string, unknown>)[key];
    }
    if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
    return undefined;
  }, value);
}

export function renderTemplate(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    const pure = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (pure) return getByPath(context, pure[1].trim());
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path: string) => {
      const resolved = getByPath(context, path.trim());
      return resolved === null || resolved === undefined
        ? ""
        : typeof resolved === "object"
          ? JSON.stringify(resolved)
          : String(resolved);
    });
  }
  if (Array.isArray(value)) return value.map((entry) => renderTemplate(entry, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, renderTemplate(entry, context)])
    );
  }
  return value;
}
