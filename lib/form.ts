/** Valeurs texte d'un formulaire (sans le jeton Turnstile ni le champ piège), renvoyées au client pour ne rien perdre en cas d'erreur. */
export function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && k !== "cf-turnstile-response" && k !== "website") out[k] = v.slice(0, 4000);
  return out;
}
