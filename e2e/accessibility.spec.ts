// Accessibilità di ogni sezione (axe): contrasto, etichette, ruoli, nomi dei pulsanti. Blocca solo i problemi seri e critici.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SECTIONS = ["Panoramica", "Movimenti", "Patrimonio", "Analisi", "Calendario", "Scadenze", "Impostazioni"];

async function go(page: Page, title: string) {
  const side = page.locator(".nav-button", { hasText: title });
  if (await side.isVisible()) return side.click();
  const bottom = page.locator(".bottom-button", { hasText: title });
  if (await bottom.isVisible()) return bottom.click();
  await page.locator(".bottom-button", { hasText: "Altro" }).click();
  await page.locator(".bottom-more button", { hasText: title }).click();
}

for (const section of SECTIONS) {
  test(`accessibilità: ${section}`, async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".stat").first()).toBeVisible();
    await go(page, section);
    await expect(page.locator(".page-heading h1")).toHaveText(section);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const serious = result.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    expect(serious.map((item) => `${item.id}: ${item.help} → ${item.nodes.slice(0, 3).map((node) => node.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
}

async function scan(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  return result.violations.filter((item) => item.impact === "serious" || item.impact === "critical")
    .map((item) => `${item.id}: ${item.help} → ${item.nodes.slice(0, 3).map((node) => node.target.join(" ")).join(" | ")}`);
}

test("accessibilità: editor dell'aspetto", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".stat").first()).toBeVisible();
  await go(page, "Impostazioni");
  await page.locator(".settings-tabs button", { hasText: "Aspetto" }).click();
  for (const part of ["Temi", "Colori", "Sfondo", "Caratteri", "Struttura"]) {
    await page.locator(".look-parts button", { hasText: part }).click();
    expect(await scan(page), part).toEqual([]);
  }
});

test("accessibilità: ricerca e inserimento veloce", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".stat").first()).toBeVisible();
  await page.getByRole("button", { name: "Cerca in tutta l’app" }).click();
  await page.getByRole("dialog").getByRole("combobox").fill("spesa");
  expect(await scan(page), "ricerca").toEqual([]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("v");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await scan(page), "inserimento veloce").toEqual([]);
});
