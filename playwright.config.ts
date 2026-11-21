// Test dell'interfaccia (npm run test:e2e): l'app con l'archivio simulato, su PC e telefono, in chiaro e in scuro.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:5198", channel: "chrome", trace: "retain-on-failure", locale: "it-IT", timezoneId: "Europe/Rome" },
  projects: [
    { name: "pc-chiaro", use: { viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
    { name: "telefono-scuro", use: { ...devices["Pixel 7"], channel: "chrome", colorScheme: "dark" } },
  ],
  webServer: { command: "npx vite --config e2e/harness/vite.config.ts", url: "http://localhost:5198", reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
