import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = ["/", "/services", "/categorie/electronique", "/categorie/smartphones", "/numerique", "/promotions", "/aide", "/problemes", "/problemes/site-invisible-sur-google", "/offres", "/methode", "/contact", "/boutique", "/conditions-de-vente"];

for (const path of pages) {
  test(`accessibilité (axe) : ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ') + ' => ' + (n.any[0]?.message ?? '')).join(' | ')}`)).toEqual([]);
  });
}

test("canoniques propres à chaque page, jamais localhost", async ({ page }) => {
  for (const path of ["/", "/services", "/boutique", "/aide", "/categorie/electronique", "/problemes", "/contact", "/offres", "/mentions-legales", "/conditions-de-vente", "/problemes/site-invisible-sur-google"]) {
    await page.goto(path);
    const href = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(href, path).toBe(`https://example.com${path === "/" ? "" : path}`);
  }
});

test("icônes, manifeste et aperçu de partage existent", async ({ request }) => {
  for (const url of ["/icon.svg", "/apple-icon", "/manifest.webmanifest", "/opengraph-image", "/robots.txt", "/sitemap.xml"]) expect((await request.get(url)).status(), url).toBe(200);
});

test("badge « Outil à tester » : présent si et seulement si l'outil s'affiche sur la fiche", async ({ page }) => {
  await page.goto("/problemes");
  const cards = page.locator("article.card");
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    const badge = (await card.locator(".tag-tool").count()) > 0;
    const href = await card.locator("h3 a").getAttribute("href");
    await page.goto(href!);
    expect((await page.locator("#outil").count()) > 0, href!).toBe(badge);
    await page.goto("/problemes");
  }
});

test("aucun numéro dans les adresses du catalogue", async ({ page }) => {
  await page.goto("/problemes");
  for (const href of await page.locator("article.card h3 a").evaluateAll((a) => a.map((x) => x.getAttribute("href") ?? ""))) expect(href).not.toMatch(/\/p\d{1,3}-/);
});

test("formulaire de contact : la saisie est conservée après une erreur", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel("Nom", { exact: true }).fill("Awa Test");
  await page.getByLabel("Adresse e-mail").fill("pas-un-email");
  await page.getByLabel("Votre besoin").fill("Mon site est très lent depuis une semaine.");
  await page.getByLabel(/J'accepte que mes informations/).check();
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.locator("p.alert-err")).toBeVisible();
  await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("Awa Test");
  await expect(page.getByLabel("Votre besoin")).toHaveValue("Mon site est très lent depuis une semaine.");
});

test("menu mobile : Échap le referme", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile uniquement");
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Menu" })).toBeFocused();
});

test("la boutique est l'accueil et les services restent accessibles par le menu", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Des produits clairs");
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click();
  await page.getByText("Services & solutions", { exact: true }).first().click();
  await page.getByRole("link", { name: "Problèmes résolus" }).first().click();
  await expect(page).toHaveURL(/\/problemes$/);
});

test("recherche : un terme sans résultat affiche un état vide honnête, une catégorie inconnue donne 404", async ({ page }) => {
  await page.goto("/boutique?q=zzzzqqq");
  await expect(page.locator("p.result-count")).toContainText("0 produit");
  expect((await page.goto("/categorie/inexistante"))?.status()).toBe(404);
});
