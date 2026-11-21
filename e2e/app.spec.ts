// Percorsi principali dell'app, con i dati di esempio, su PC (chiaro) e telefono (scuro).
import { expect, test, type Page } from "@playwright/test";

const SECTIONS: [string, string][] = [
  ["Panoramica", "Panoramica"], ["Movimenti", "Movimenti"], ["Patrimonio", "Patrimonio"], ["Analisi", "Analisi"],
  ["Calendario", "Calendario"], ["Scadenze", "Scadenze"], ["Impostazioni", "Impostazioni"],
];

/** Apre una sezione dal menu laterale (PC) o dalla barra in basso / «Altro» (telefono). */
async function go(page: Page, title: string) {
  const side = page.locator(".nav-button", { hasText: title });
  if (await side.isVisible()) return side.click();
  const bottom = page.locator(".bottom-button", { hasText: title });
  if (await bottom.isVisible()) return bottom.click();
  await page.locator(".bottom-button", { hasText: "Altro" }).click();
  await page.locator(".bottom-more button", { hasText: title }).click();
}

async function open(page: Page, query = "") {
  await page.goto(`/${query}`);
  await expect(page.locator(".stat").first()).toBeVisible();
}

/** La pagina non deve mai essere più larga dello schermo. */
async function expectNoSideScroll(page: Page) {
  const [content, screen] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(content, "pagina più larga dello schermo").toBeLessThanOrEqual(screen + 1);
}

type StoredRecord = { kind: string; id: string; value: Record<string, unknown> };
async function store(page: Page): Promise<StoredRecord[]> {
  return page.evaluate(() => (window as unknown as { e2eStore: () => StoredRecord[] }).e2eStore());
}

const lookTheme = async (page: Page) => (await store(page)).find((record) => record.kind === "setting" && record.id === "look")?.value.theme;

test("ogni sezione si apre senza errori e senza scorrimento laterale", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await open(page);
  for (const [menu, heading] of SECTIONS) {
    await go(page, menu);
    await expect(page.locator(".page-heading h1")).toHaveText(heading);
    await expectNoSideScroll(page);
  }
  expect(errors).toEqual([]);
});

test("registra una spesa veloce", async ({ page }) => {
  await open(page);
  const before = (await store(page)).filter((record) => record.kind === "movement").length;
  const fab = page.locator(".fab");
  if (await fab.isVisible()) await fab.click(); else await page.keyboard.press("v");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Importo in euro (anche come operazione)").fill("12,50");
  await dialog.locator(".quick-choices button").first().click();
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog).toBeHidden();
  const movements = (await store(page)).filter((record) => record.kind === "movement");
  expect(movements).toHaveLength(before + 1);
  expect(movements.some((record) => record.value.amount === 1250 && record.value.type === "expense")).toBe(true);
});

test("simula l'estinzione di un prestito", async ({ page }) => {
  await open(page);
  await go(page, "Patrimonio");
  await page.locator(".patrimonio-tabs button", { hasText: "Debiti" }).click();
  await page.getByRole("button", { name: "Simula estinzione" }).first().click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: /Simula estinzione/ })).toBeVisible();
  await expectNoSideScroll(page);
});

test("scarica il backup completo", async ({ page }) => {
  await open(page, "?empty");
  await go(page, "Impostazioni");
  await page.locator(".settings-tabs button", { hasText: "Dati e backup" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Backup completo" }).click();
  expect((await download).suggestedFilename()).toMatch(/^expense-tracking-backup-\d{4}-\d{2}-\d{2}\.zip$/);
});

test("cambia tema e sfondo e li salva nell'archivio", async ({ page }) => {
  await open(page);
  await go(page, "Impostazioni");
  await page.locator(".settings-tabs button", { hasText: "Aspetto" }).click();
  await page.locator(".theme-card", { hasText: "Oceano" }).click();
  await page.locator(".look-parts button", { hasText: "Sfondo" }).click();
  await page.getByRole("group", { name: "Tipo di sfondo" }).getByRole("button", { name: "Scena" }).click();
  await expect(page.locator("html")).toHaveClass(/bg-custom/);
  await expectNoSideScroll(page);
  await expect.poll(() => lookTheme(page)).toMatchObject({ id: "oceano" });
});

test("l'aspetto scelto su un dispositivo arriva sull'altro", async ({ page, browser }) => {
  // Primo «dispositivo»: sceglie Sabbia.
  await open(page, "?shared");
  await go(page, "Impostazioni");
  await page.locator(".settings-tabs button", { hasText: "Aspetto" }).click();
  await page.locator(".theme-card", { hasText: "Sabbia" }).click();
  await expect.poll(() => lookTheme(page)).toMatchObject({ id: "sabbia" });
  const archive = await page.evaluate(() => localStorage.getItem("e2e-store"));
  // Secondo «dispositivo»: stesso archivio online, nessuna copia locale dell'aspetto.
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await other.addInitScript((saved) => { if (!localStorage.getItem("e2e-store")) localStorage.setItem("e2e-store", saved ?? "[]"); }, archive);
  const second = await other.newPage();
  await open(second, "?shared");
  await expect.poll(() => second.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())).toMatch(/^#(a3592a|dc9060)$/);
  await other.close();
});

test("?aspetto=reset riporta l'aspetto originale", async ({ page }) => {
  await open(page);
  await go(page, "Impostazioni");
  await page.locator(".settings-tabs button", { hasText: "Aspetto" }).click();
  await page.locator(".theme-card", { hasText: "Lavanda" }).click();
  await open(page, "?aspetto=reset");
  await expect(page).toHaveURL(/\/$/);
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  expect(["#106a56", "#5cd0a8"]).toContain(accent);
});

test("la ricerca globale trova un movimento e lo apre", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Cerca in tutta l’app" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").fill("supermercato");
  await expect(dialog.getByRole("option").first()).toContainText("Supermercato");
  await dialog.getByRole("combobox").press("Enter");
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Modifica movimento" })).toBeVisible();
});

test("«Da fare oggi» compare in Panoramica e una scadenza si segna come fatta", async ({ page }) => {
  await open(page);
  const panel = page.getByRole("region", { name: "Da fare oggi" });
  await expect(panel).toBeVisible();
  const done = panel.getByRole("button", { name: "Fatta" }).first();
  if (await done.count()) {
    const before = await panel.locator(".today-list li").count();
    await done.click();
    await expect(panel.locator(".today-list li")).toHaveCount(before - 1);
  }
  await expectNoSideScroll(page);
});

test("il registro dei movimenti sta nello schermo, importo compreso", async ({ page }) => {
  await open(page);
  await go(page, "Movimenti");
  const table = page.locator(".movements-panel .table-scroll");
  await expect(table).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) <= 600) {
    const [content, box] = await table.evaluate((element) => [element.scrollWidth, element.clientWidth]);
    expect(content).toBeLessThanOrEqual(box + 1);
  }
  await expect(page.locator(".movements-panel td.number").first()).toBeInViewport();
});
