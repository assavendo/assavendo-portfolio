import { defineConfig, devices } from "@playwright/test";

// Les tests de bout en bout tournent sur le build de production, avec le contenu local (sans Supabase) :
// ils vérifient les parcours, les formulaires et l'accessibilité, pas la base de données (couverte par scripts/test-db.sh).
export default defineConfig({
  testDir: "./e2e", timeout: 30_000, retries: process.env.CI ? 1 : 0, reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000, env: { NEXT_PUBLIC_SITE_URL: "https://example.com" } },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["Pixel 7"] } }],
});
