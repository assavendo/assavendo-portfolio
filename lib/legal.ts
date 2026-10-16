/** Informations légales lues depuis les variables d'environnement : rien n'est inventé. */
export const legal = {
  name: process.env.LEGAL_NAME, form: process.env.LEGAL_FORM, siret: process.env.LEGAL_SIRET, vat: process.env.LEGAL_VAT,
  address: process.env.LEGAL_ADDRESS, email: process.env.LEGAL_EMAIL ?? process.env.CONTACT_TO_EMAIL, director: process.env.LEGAL_DIRECTOR,
  host: process.env.LEGAL_HOST ?? "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
};
export const missing = Object.entries({ "Dénomination": legal.name, "Forme juridique": legal.form, "SIRET": legal.siret, "Adresse": legal.address, "E-mail": legal.email, "Directeur de la publication": legal.director }).filter(([, v]) => !v).map(([k]) => k);
