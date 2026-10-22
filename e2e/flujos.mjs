/**
 * Prueba de punta a punta de los flujos principales.
 * Corre contra una base local con los datos de ejemplo (modifica datos):
 *
 *   npm run db:seed -- --reset && npm run build && npm start   # en otra terminal
 *   npx playwright install chromium                  # solo la primera vez
 *   npm run test:e2e
 *
 * Variables opcionales: E2E_URL (por defecto http://localhost:3000),
 * E2E_PASSWORD (por defecto la APP_PASSWORD del .env), E2E_SHOTS (carpeta para capturas).
 */
import "dotenv/config";
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.E2E_URL ?? "http://localhost:3000";
const CLAVE = process.env.E2E_PASSWORD ?? process.env.APP_PASSWORD;
const SHOTS = process.env.E2E_SHOTS;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const filas = () => page.locator("tbody tr").count();
const empresas = async () => (await page.locator("tbody tr .celda-principal").allTextContents()).map((s) => s.trim());
const ok = (m) => console.log("✓", m);

// 1. Sin sesión → login
await page.goto(BASE + "/");
assert.equal(new URL(page.url()).pathname, "/login");
ok("sin sesión redirige a /login");

// 2. Contraseña incorrecta
await page.fill("#clave", "mala");
await page.click("button[type=submit]");
await page.locator("#error-clave").waitFor();
ok("contraseña incorrecta muestra error");

// 3. Login correcto
await page.fill("#clave", CLAVE);
await page.click("button[type=submit]");
await page.waitForURL(BASE + "/", { waitUntil: "commit" });
await page.getByRole("heading", { name: "Leads del día", level: 1 }).waitFor();
assert.equal(await filas(), 10);
const scores = (await page.locator("tbody .score").allTextContents()).map(Number);
assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
ok(`login correcto, 10 leads ordenados por score (${scores.join(", ")})`);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-leads.png`, fullPage: true });

// 4. Filtros de zona y sector combinados
await page.getByRole("link", { name: /Resto de la provincia/ }).click();
await page.waitForURL(/zona=provincia/, { waitUntil: "commit" }); await page.locator("tbody tr").nth(1).waitFor(); await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2);
assert.deepEqual((await empresas()).sort(), ["Obras Viales Bonaerenses SRL", "Transportes Pampa Sur SA"]);
await page.getByRole("link", { name: /Flotas y transporte/ }).click();
await page.waitForURL(/sector=flotas&zona=provincia/, { waitUntil: "commit" }); await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
assert.deepEqual(await empresas(), ["Transportes Pampa Sur SA"]);
const contadorConstruccion = await page.getByRole("link", { name: /^Construcción/ }).locator(".chip-contador").textContent();
assert.equal(contadorConstruccion, "1");
ok("filtro de zona + sector combinados, contadores coherentes");

// 5. Búsqueda (mantiene filtros, sin acentos)
await page.goto(BASE + "/");
await page.fill("#q", "logistica");
await page.press("#q", "Enter");
await page.waitForURL(/q=logistica/, { waitUntil: "commit" }); await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
assert.deepEqual(await empresas(), ["Logística Atlántica SRL"]);
ok("búsqueda sin acentos");

// 6. Ficha y cambio de estado
await page.getByRole("link", { name: "Ver Logística Atlántica SRL" }).click();
await page.waitForURL(/\/leads\/\d+/, { waitUntil: "commit" });
const urlFicha = page.url();
await page.getByRole("heading", { name: "Logística Atlántica SRL", level: 1 }).waitFor();
if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-ficha.png`, fullPage: true });
await page.getByRole("button", { name: "Llamado" }).click();
await page.waitForFunction(() =>
  document.querySelector('button[value="llamado"]')?.getAttribute("aria-pressed") === "true");
ok("cambio de estado a Llamado");

// 7. Notas y recordatorio persisten
await page.fill("#nota", "Tienen 3 camiones. Volver a llamar.");
await page.fill("#recordatorio", "2026-11-05");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.locator(".mensaje-ok").waitFor();
await page.goto(urlFicha);
assert.equal(await page.inputValue("#nota"), "Tienen 3 camiones. Volver a llamar.");
assert.equal(await page.inputValue("#recordatorio"), "2026-11-05");
ok("nota y recordatorio guardados y persistidos");

// el estado nuevo aparece en la lista
await page.goto(BASE + "/?q=logistica");
assert.equal((await page.locator("tbody .pastilla").first().textContent()).trim(), "Llamado");
ok("la lista refleja el estado nuevo");

// 8. Mis sectores: apagar Salud, Construcción en baja, sin licitaciones nacionales
await page.goto(BASE + "/sectores");
if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-sectores.png`, fullPage: true });
await page.getByRole("switch", { name: "Mostrar Salud" }).uncheck();
await page.locator("label[for=prioridad_construccion_baja]").click();
await page.getByLabel(/Nacionales/).uncheck();
await page.getByRole("button", { name: "Guardar cambios" }).click();
await page.waitForURL(/guardado=1/, { waitUntil: "commit" });
await page.locator(".mensaje-ok").waitFor();
assert.equal(await page.getByRole("switch", { name: "Mostrar Salud" }).isChecked(), false);
assert.equal(await page.locator("#prioridad_construccion_baja").isChecked(), true);
ok("ajustes guardados");

await page.goto(BASE + "/");
const lista = await empresas();
assert.ok(!lista.includes("Consultorio Odontológico Sur"), "salud oculto");
assert.ok(!lista.includes("Transportes Pampa Sur SA"), "nacional oculto");
assert.ok(!lista.includes("Obras Viales Bonaerenses SRL"), "nacional oculto");
const filaPM = page.locator("tbody tr", { hasText: "Construcciones Punta Mogotes SA" });
assert.equal(await filaPM.locator(".score").textContent(), "75"); // 90 - 15
assert.equal(await page.getByRole("link", { name: /^Salud/ }).count(), 0);
ok("la lista aplica sectores, prioridad y alcance de licitaciones");

// 9. Vista de teléfono sin scroll horizontal de página
await page.setViewportSize({ width: 390, height: 844 });
for (const ruta of ["/", urlFicha.replace(BASE, ""), "/sectores"]) {
  await page.goto(BASE + ruta);
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(desborde <= 0, `desborde horizontal en ${ruta}: ${desborde}px`);
}
if (SHOTS) {
  await page.goto(BASE + "/");
  await page.screenshot({ path: `${SHOTS}/4-telefono.png`, fullPage: true });
}
ok("sin desborde horizontal a 390px");

// 10. Cerrar sesión
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(BASE + "/");
await page.getByRole("button", { name: "Cerrar sesión" }).click();
await page.waitForURL(/\/login/, { waitUntil: "commit" });
await page.goto(BASE + "/sectores");
assert.equal(new URL(page.url()).pathname, "/login");
ok("cerrar sesión bloquea el acceso");

await browser.close();
console.log("\nTodo OK");
