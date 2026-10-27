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
import { fileURLToPath } from "node:url";

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
await page.getByRole("heading", { name: "Resumen general", level: 1 }).waitFor();
await page.getByText("Prima anual vigente").waitFor();
await page.getByRole("heading", { name: "Cartera por aseguradora" }).waitFor();
await page.getByRole("heading", { name: "Próximos vencimientos" }).waitFor();
await page.getByRole("heading", { name: "Actividad reciente" }).waitFor();
ok("login correcto, inicio en el dashboard general");
if (SHOTS) await page.screenshot({ path: `${SHOTS}/0-dashboard.png`, fullPage: true });

// 4. Búsqueda en cartera, panel lateral y ficha completa
await page.getByRole("link", { name: "Asegurados" }).click();
await page.getByRole("heading", { name: "Asegurados", level: 1 }).waitFor();
await page.getByRole("searchbox", { name: "Buscar por nombre, DNI, CUIT o número de póliza" }).fill("Gómez, Lucía");
await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "Gómez, Lucía");
await page.getByRole("link", { name: "Gómez, Lucía" }).first().click();
await page.waitForFunction(() => new URL(location.href).searchParams.has("ver"));
await page.getByRole("link", { name: "Abrir ficha completa" }).click();
await page.waitForURL(/\/asegurados\/\d+/, { waitUntil: "commit" });
await page.getByRole("heading", { name: "Gómez, Lucía", level: 1 }).waitFor();
ok("cartera: buscar, abrir panel lateral y entrar a la ficha");

// 5. Importar con una fila inválida, conservar la cartera y combinar la válida
await page.goto(BASE + "/importar");
await page.locator("#archivo-importar").setInputFiles(fileURLToPath(new URL("./fixtures/cartera-importacion.csv", import.meta.url)));
await page.getByRole("button", { name: "Revisar importación" }).waitFor();
await page.getByRole("button", { name: "Revisar importación" }).click();
await page.locator(".lista-problemas li").filter({ hasText: "Fila 3" }).filter({ hasText: "no existe" }).waitFor();
const quitarEjemplos = page.getByLabel("Quitar los datos de ejemplo");
if (await quitarEjemplos.count()) await quitarEjemplos.uncheck();
await page.getByLabel("Combinar").check();
await page.getByRole("button", { name: "Importar 1 póliza" }).click();
await page.waitForURL(/\/asegurados\?aviso=importado-/);
await page.getByRole("searchbox", { name: "Buscar por nombre, DNI, CUIT o número de póliza" }).fill("Empresa Prueba E2E SA");
await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "Empresa Prueba E2E SA");
await page.getByRole("link", { name: "Empresa Prueba E2E SA" }).first().waitFor();
ok("importación: informa la fila inválida y combina la póliza válida");

// 6. Leads: filtros de zona y sector combinados
await page.goto(BASE + "/leads");
await page.getByRole("heading", { name: "Leads del día", level: 1 }).waitFor();
assert.equal(await filas(), 10);
const scores = (await page.locator("tbody .score").allTextContents()).map(Number);
assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-leads.png`, fullPage: true });
await page.getByRole("link", { name: /Resto de la provincia/ }).click();
await page.waitForURL(/zona=provincia/, { waitUntil: "commit" }); await page.locator("tbody tr").nth(1).waitFor(); await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2);
assert.deepEqual((await empresas()).sort(), ["Obras Viales Bonaerenses SRL", "Transportes Pampa Sur SA"]);
await page.getByRole("link", { name: /Flotas y transporte/ }).click();
await page.waitForURL(/sector=flotas&zona=provincia/, { waitUntil: "commit" }); await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
assert.deepEqual(await empresas(), ["Transportes Pampa Sur SA"]);
const contadorConstruccion = await page.getByRole("link", { name: /^Construcción/ }).locator(".chip-contador").textContent();
assert.equal(contadorConstruccion, "1");
ok("filtro de zona + sector combinados, contadores coherentes");

// 7. Búsqueda (mantiene filtros, sin acentos)
await page.goto(BASE + "/leads");
await page.fill("#q", "logistica");
await page.press("#q", "Enter");
await page.waitForURL(/q=logistica/, { waitUntil: "commit" }); await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
assert.deepEqual(await empresas(), ["Logística Atlántica SRL"]);
ok("búsqueda sin acentos");

// 8. Ficha y cambio de estado
await page.getByRole("link", { name: "Ver Logística Atlántica SRL" }).click();
await page.waitForURL(/\/leads\/\d+/, { waitUntil: "commit" });
const urlFicha = page.url();
await page.getByRole("heading", { name: "Logística Atlántica SRL", level: 1 }).waitFor();
if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-ficha.png`, fullPage: true });
await page.getByRole("button", { name: "Crear solicitud" }).click();
await page.waitForURL(/\/leads\/\d+\?cotizacion=\d+/);
await page.getByRole("link", { name: /Ver en Cotización/ }).waitFor();
ok("lead: crear solicitud de cotización vinculada");
await page.getByRole("button", { name: "Llamado" }).click();
await page.waitForFunction(() =>
  document.querySelector('button[value="llamado"]')?.getAttribute("aria-pressed") === "true");
ok("cambio de estado a Llamado");

// 9. Notas y recordatorio persisten
await page.fill("#nota", "Tienen 3 camiones. Volver a llamar.");
await page.fill("#recordatorio", "2026-11-05");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.locator(".mensaje-ok").waitFor();
await page.goto(urlFicha);
assert.equal(await page.inputValue("#nota"), "Tienen 3 camiones. Volver a llamar.");
assert.equal(await page.inputValue("#recordatorio"), "2026-11-05");
ok("nota y recordatorio guardados y persistidos");

// el estado nuevo aparece en la lista
await page.goto(BASE + "/leads?q=logistica");
assert.equal((await page.locator("tbody .pastilla").first().textContent()).trim(), "Llamado");
ok("la lista refleja el estado nuevo");

// 10. Mis sectores: apagar Salud, Construcción en baja, sin licitaciones nacionales
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

await page.goto(BASE + "/leads");
const lista = await empresas();
assert.ok(!lista.includes("Consultorio Odontológico Sur"), "salud oculto");
assert.ok(!lista.includes("Transportes Pampa Sur SA"), "nacional oculto");
assert.ok(!lista.includes("Obras Viales Bonaerenses SRL"), "nacional oculto");
const filaPM = page.locator("tbody tr", { hasText: "Construcciones Punta Mogotes SA" });
assert.equal(await filaPM.locator(".score").textContent(), "75"); // 90 - 15
assert.equal(await page.getByRole("link", { name: /^Salud/ }).count(), 0);
ok("la lista aplica sectores, prioridad y alcance de licitaciones");

// 11. Cotización: filtrar, cambiar estado y consultar desempeño
await page.goto(BASE + "/agentes/cotizacion");
await page.getByRole("heading", { name: "Agente de cotización", level: 1 }).waitFor();
await page.getByRole("searchbox", { name: "Buscar cliente o número" }).fill("1042");
await page.getByRole("button", { name: "Filtrar" }).click();
await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "1042");
await page.getByText("Gómez, Lucía").waitFor();
await page.getByRole("link", { name: "Desempeño" }).click();
await page.getByText("Solicitudes ganadas").waitFor();
ok("cotización: filtros y pestaña de desempeño");

// 12. Validador: confirmar pago y reflejarlo en Pagados
await page.goto(BASE + "/agentes/validador?tab=revisar");
await page.getByRole("button", { name: "Confirmar pago" }).first().click();
await page.waitForURL(/aviso=pago-confirmado/);
await page.goto(BASE + "/agentes/validador?tab=pagados");
await page.locator("tbody.cobro", { hasText: "Acosta, Valeria" }).waitFor();
ok("validador: confirmar pago y ver la cuota en Pagados");

// 13. Cobranza: aprobar un borrador de mensaje
await page.goto(BASE + "/agentes/cobranza");
await page.getByRole("button", { name: "Aprobar y enviar" }).first().click();
await page.waitForURL(/aviso=mensaje-enviado/);
ok("cobranza: aprobar y enviar un mensaje");

// 14. Siniestros: revisar y aprobar la denuncia armada
await page.goto(BASE + "/agentes/siniestros");
await page.getByRole("heading", { name: "Agente de siniestros", level: 1 }).waitFor();
await page.getByRole("button", { name: "Aprobar y enviar denuncia" }).click();
await page.waitForURL(/aviso=denuncia-enviada/);
await page.getByRole("status").getByText("La denuncia se envió a la compañía.").waitFor();
ok("siniestros: aprobar y enviar la denuncia simulada");

// 15. Conciliador: enviar un reclamo preparado
await page.goto(BASE + "/agentes/conciliador");
await page.getByRole("heading", { name: "Agente conciliador", level: 1 }).waitFor();
await page.getByRole("link", { name: "Sancor", exact: true }).click();
await page.getByRole("button", { name: "Enviar reclamo" }).click();
await page.waitForURL(/aviso=reclamo-enviado/);
ok("conciliador: enviar el reclamo preparado");

// 16. Configuración: conectar WhatsApp en modo simulado
await page.goto(BASE + "/configuracion?panel=whatsapp");
const codigoPendiente = page.getByLabel("Código que te llegó por SMS");
if (await codigoPendiente.count()) {
  await codigoPendiente.fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();
  await page.getByRole("status").getByText(/WhatsApp conectado/).waitFor();
}
const whatsappPrevio = page.getByRole("button", { name: "Desconectar" });
if (await whatsappPrevio.count()) {
  await whatsappPrevio.click();
  await page.waitForURL(/aviso=desconectada/);
  await page.goto(BASE + "/configuracion?panel=whatsapp");
}
await page.getByLabel("Número de WhatsApp").fill("+54 9 223 555 0199");
await page.getByRole("button", { name: "Continuar con Meta" }).click();
await page.getByLabel("Código que te llegó por SMS").fill("123456");
await page.getByRole("button", { name: "Verificar" }).click();
await page.getByRole("status").getByText(/WhatsApp conectado/).waitFor();
ok("configuración: conectar WhatsApp simulado");

// 17. Vista de teléfono sin scroll horizontal de página
await page.setViewportSize({ width: 390, height: 844 });
for (const ruta of [
  "/asegurados",
  "/leads",
  urlFicha.replace(BASE, ""),
  "/importar",
  "/sectores",
  "/agentes/cotizacion",
  "/agentes/validador",
  "/agentes/cobranza",
  "/agentes/siniestros",
  "/agentes/conciliador",
]) {
  await page.goto(BASE + ruta);
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(desborde <= 0, `desborde horizontal en ${ruta}: ${desborde}px`);
}
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(BASE + "/configuracion?panel=whatsapp");
const desconectarWhatsApp = page.getByRole("button", { name: "Desconectar" });
if (await desconectarWhatsApp.count()) {
  await desconectarWhatsApp.click();
  await page.waitForURL(/aviso=desconectada/);
}
if (SHOTS) {
  await page.goto(BASE + "/leads");
  await page.screenshot({ path: `${SHOTS}/4-telefono.png`, fullPage: true });
}
ok("sin desborde horizontal a 390px");

// 18. Cerrar sesión
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(BASE + "/");
await page.getByRole("button", { name: "Cerrar sesión" }).click();
await page.waitForURL(/\/login/, { waitUntil: "commit" });
await page.goto(BASE + "/sectores");
assert.equal(new URL(page.url()).pathname, "/login");
ok("cerrar sesión bloquea el acceso");

await browser.close();
console.log("\nTodo OK");
