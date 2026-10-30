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
await page.getByRole("link", { name: /^Asegurados/ }).click();
await page.getByRole("heading", { name: "Asegurados", level: 1 }).waitFor();
await page.getByRole("searchbox", { name: "Buscar por nombre, DNI, CUIT o número de póliza" }).fill("Gómez, Lucía");
await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "Gómez, Lucía");
await page.getByRole("link", { name: "Gómez, Lucía" }).first().click();
await page.waitForFunction(() => new URL(location.href).searchParams.has("ver"));
await page.getByRole("link", { name: "Abrir ficha completa" }).click();
await page.waitForURL(/\/asegurados\/\d+/, { waitUntil: "commit" });
await page.getByRole("heading", { name: "Gómez, Lucía", level: 1 }).waitFor();
ok("cartera: buscar, abrir panel lateral y entrar a la ficha");

// 5. Importar con una fila con datos inválidos: se importa igual, marcada para corregir
await page.goto(BASE + "/importar");
await page.locator("#archivo-importar").setInputFiles(fileURLToPath(new URL("./fixtures/cartera-importacion.csv", import.meta.url)));
await page.getByRole("button", { name: "Revisar importación" }).waitFor();
await page.getByRole("button", { name: "Revisar importación" }).click();
await page.locator(".lista-problemas li").filter({ hasText: "Fila 3" }).filter({ hasText: "no existe" }).waitFor();
const quitarEjemplos = page.getByLabel("Quitar los datos de ejemplo");
if (await quitarEjemplos.count()) await quitarEjemplos.uncheck();
await page.getByLabel("Combinar").check();
await page.getByRole("button", { name: "Importar 2 pólizas" }).click();
await page.waitForURL(/\/asegurados\?aviso=importado-/);
await page.getByRole("searchbox", { name: "Buscar por nombre, DNI, CUIT o número de póliza" }).fill("Empresa Prueba E2E SA");
await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "Empresa Prueba E2E SA");
await page.getByRole("link", { name: "Empresa Prueba E2E SA" }).first().waitFor();
ok("importación: informa la fila con la fecha inválida y no deja ninguna póliza afuera");

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
await page.getByRole("link", { name: "1042" }).click();
await page.getByRole("link", { name: "Cotizaciones" }).click();
await page.getByRole("button", { name: "Generar propuesta PDF" }).click();
await page.getByText("Borrador · requiere aprobación").waitFor();
await page.getByRole("button", { name: "Aprobar propuesta" }).click();
await page.waitForURL(/aviso=propuesta-aprobada/);
// El de la propuesta, no el del comparativo (que también se llama "Descargar PDF").
const propuestaHref = await page.getByRole("article").getByRole("link", { name: "Descargar PDF" }).getAttribute("href");
const descargaPropuesta = await page.request.get(new URL(propuestaHref, BASE).toString());
assert.equal(descargaPropuesta.status(), 200);
assert.match((await descargaPropuesta.body()).toString("latin1"), /^%PDF-1\.4/);
await page.getByRole("button", { name: "Marcar completada" }).click();
await page.waitForURL(/aviso=completada/);
ok("cotizacion: generar propuesta, aprobarla, descargar el PDF y completar la solicitud");
await page.goto(BASE + "/agentes/cotizacion");
await page.getByRole("link", { name: "Desempeño" }).click();
await page.getByRole("heading", { name: "Desempeño por aseguradora" }).waitFor();
ok("cotización: filtros y pestaña de desempeño");

// 12. Validador: confirmar pago y reflejarlo en Pagadas
await page.goto(BASE + "/agentes/validador?tab=revisar");
await page.getByRole("button", { name: "Confirmar pago" }).first().click();
await page.waitForURL(/aviso=pago-confirmado/);
await page.goto(BASE + "/agentes/validador?tab=pagadas");
await page.locator("tbody.grupo-asegurado", { hasText: "Acosta, Valeria" }).waitFor();
ok("validador: confirmar pago y ver la cuota en Pagadas");

// 13. Validador (criterio 15 de docs/specs/validador-v2.md): importar un listado → ver los totales →
// expandir un asegurado → confirmar un comprobante → cuota pagada → enviar una vencida a Cobranza.
// El listado usa el formato de Sancor que el seed deja como plantilla, así se lee sin preguntar.
const hoyAR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const dia = (d) => {
  const f = new Date(`${hoyAR}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + d);
  const iso = f.toISOString().slice(0, 10);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
};
const listado = [
  "Póliza;Ítem;Endoso;Cuota;Cupón;Vencimiento;Importe;Moneda;Fecha de cobro;Medio de pago;Estado",
  `61-RCP-0332;;;9/12;;${dia(-6)};$ 54.800,00;Pesos;${dia(-1)};Transferencia;COBRADA`,
].join("\r\n");
await page.goto(BASE + "/agentes/validador?tab=revisar");
await page.locator("#listado-compania").selectOption("Sancor");
await page.locator("#listado-archivo").setInputFiles({ name: "cobranzas_sancor_e2e.csv", mimeType: "text/csv", buffer: Buffer.from(listado, "utf8") });
await page.getByRole("button", { name: "Subir listado" }).click();
await page.waitForURL(/aviso=listado-procesado.*#listado-\d+$/);
await page.locator(new URL(page.url()).hash).getByText("1 fila leída: 1 coincidió con la cartera, 0 a revisar y 0 no identificadas.").waitFor();

await page.goto(BASE + "/agentes/validador");
const totales = page.getByRole("region", { name: "Totales por plazo" });
for (const bloque of ["Esta semana", "Próximos", "Vencidos"]) await totales.getByText(bloque, { exact: true }).waitFor();
assert.match(await totales.textContent(), /US\$/, "los totales separan los dólares");
await page.getByRole("button", { name: /^Ver las cuotas de / }).first().click();
await page.locator("table.tabla-subcuotas").first().waitFor();

await page.goto(BASE + "/agentes/validador?tab=revisar");
const comprobante = page.locator("article.caso-revisar", { hasText: "ARIAS BRUNO" });
await comprobante.getByRole("button", { name: "Es este cobro: confirmar" }).first().click();
await page.waitForURL(/aviso=pago-confirmado/);
await page.goto(BASE + "/agentes/validador?tab=pagadas");
for (const asegurado of ["Arias, Bruno", "Clínica Dental Costa Azul SRL"]) await page.locator("tbody.grupo-asegurado", { hasText: asegurado }).waitFor();

await page.goto(BASE + "/agentes/validador?bloque=vencidos");
const vencidos = page.locator("tbody.grupo-asegurado");
let enviada = false;
for (let i = 0; i < Math.min(await vencidos.count(), 10) && !enviada; i++) {
  const grupo = vencidos.nth(i);
  await grupo.getByRole("button", { name: /^Ver las cuotas de / }).click();
  const enviar = grupo.getByRole("button", { name: "Enviar a Cobranza" });
  if (await enviar.count()) {
    await enviar.first().click();
    await page.waitForURL(/aviso=enviado-a-cobranza/);
    enviada = true;
  }
}
assert.ok(enviada, "hay una cuota vencida de un asegurado con contacto");
ok("validador: listado, totales, asegurado expandido, comprobante confirmado y vencida enviada a Cobranza");

// 14. Cobranza: aprobar un borrador de mensaje (el de una tarjeta, no "Aprobar y enviar N mensajes").
// Solo sale con WhatsApp o Gmail conectados de verdad; en una base de prueba avisa que no se pudo.
await page.goto(BASE + "/agentes/cobranza");
await page.getByRole("button", { name: "Aprobar y enviar", exact: true }).first().click();
await page.waitForURL(/aviso=mensaje-(enviado|error)/);
ok(`cobranza: aprobar un mensaje (${/mensaje-enviado/.test(page.url()) ? "enviado" : "sin canal conectado, no salió"})`);

// 15. Siniestros: revisar y aprobar la denuncia armada (sale por email: sin Gmail conectado, avisa que no se pudo)
await page.goto(BASE + "/agentes/siniestros");
await page.getByRole("heading", { name: "Agente de siniestros", level: 1 }).waitFor();
await page.getByRole("button", { name: "Aprobar y enviar denuncia" }).click();
await page.waitForURL(/aviso=(denuncia-enviada|envio-error)/);
const denunciaEnviada = /denuncia-enviada/.test(page.url());
await page.getByText(denunciaEnviada ? "La denuncia se envió a la compañía." : "No se pudo enviar. Revisá la conexión y volvé a intentar.").waitFor();
ok(`siniestros: aprobar la denuncia (${denunciaEnviada ? "enviada" : "sin canal conectado, no salió"})`);

// 16. Conciliador: enviar el reclamo preparado. Sancor tiene diferencias a propósito: "sin diferencia" sería un error del seed.
await page.goto(BASE + "/agentes/conciliador");
await page.getByRole("heading", { name: "Agente conciliador", level: 1 }).waitFor();
await page.getByRole("link", { name: "Sancor", exact: true }).click();
await page.getByRole("button", { name: "Enviar reclamo" }).click();
await page.waitForURL(/aviso=(reclamo-enviado|envio-error)/);
ok(`conciliador: el reclamo preparado (${/reclamo-enviado/.test(page.url()) ? "enviado" : "sin canal conectado, no salió"})`);

// 17. Configuración: WhatsApp se valida contra Meta (ya no hay modo simulado). Sin el token en el
// servidor, "Verificar conexion" lo explica y no queda conectado.
await page.goto(BASE + "/configuracion?panel=whatsapp");
await page.getByRole("heading", { name: "Conectar WhatsApp" }).waitFor();
const verificarWhatsApp = page.getByRole("button", { name: "Verificar conexion" });
if (await verificarWhatsApp.count()) {
  await verificarWhatsApp.click();
  await page.getByRole("alert").first().waitFor();
  ok("configuración: WhatsApp sin el token de Meta avisa y no se conecta");
} else {
  await page.getByRole("status").getByText(/WhatsApp conectado/).waitFor();
  ok("configuración: WhatsApp conectado con Meta");
}

// 17b. Conexiones con las compañías: se llega desde Configuración, se guarda el orden de canales
// de Sancor (solo el portal), un orden con lugares repetidos se rechaza, y vuelve al automático.
await page.goto(BASE + "/configuracion");
await page.getByRole("link", { name: /Administrar las conexiones con las compañías/ }).click();
await page.getByRole("heading", { name: "Conexiones con las compañías", level: 1 }).waitFor();
await page.getByRole("navigation", { name: "Compañías" }).getByRole("link", { name: /^Sancor/ }).click();
await page.getByRole("heading", { name: "Sancor", level: 2 }).waitFor();
const ordenSancor = page.locator("form.cias-orden");
await ordenSancor.getByLabel("En este orden").check();
await ordenSancor.getByLabel("Conexión directa", { exact: true }).selectOption("1");
await ordenSancor.getByLabel("Portal de productores", { exact: true }).selectOption("1");
await ordenSancor.getByRole("button", { name: "Guardar el orden" }).click();
await ordenSancor.getByRole("alert").getByText("Cada canal tiene que ir en un lugar distinto.").waitFor();
await ordenSancor.getByLabel("Conexión directa", { exact: true }).selectOption("");
await ordenSancor.getByLabel("Archivo", { exact: true }).selectOption("");
await ordenSancor.getByRole("button", { name: "Guardar el orden" }).click();
await page.waitForURL(/aviso=canales-guardados/);
await page.getByText("Hoy: Portal de productores. Los demás no se usan.").waitFor();
await page.locator("form.cias-orden").getByLabel("Automático").check();
await page.locator("form.cias-orden").getByRole("button", { name: "Guardar el orden" }).click();
await page.waitForURL(/aviso=canales-guardados/);
await page.getByText(/^Hoy: Automático/).waitFor();
await page.goto(BASE + "/agentes/validador/configuracion?tab=credenciales&cia=Mapfre");
await page.waitForURL(/\/configuracion\/companias\?agente=validador&cia=Mapfre/);
await page.getByRole("heading", { name: "Plantilla de los listados del Validador" }).waitFor();
ok("conexiones con las compañías: orden de canales guardado y las credenciales del Validador llevan acá");

// 18. Vista de teléfono sin scroll horizontal de página
await page.setViewportSize({ width: 390, height: 844 });
for (const ruta of [
  "/asegurados",
  "/leads",
  urlFicha.replace(BASE, ""),
  "/importar",
  "/sectores",
  "/agentes/cotizacion",
  "/agentes/cotizacion?tab=bitacora",
  "/agentes/cotizacion?tab=desempeno",
  "/agentes/cotizacion/configuracion",
  "/agentes/cotizacion/nueva",
  "/agentes/validador",
  "/agentes/cobranza",
  "/agentes/siniestros",
  "/agentes/conciliador",
  "/configuracion/companias",
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

// 19. Cerrar sesión
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(BASE + "/");
await page.locator("summary.barra-perfil-resumen").click();
await page.getByRole("button", { name: "Cerrar sesión" }).click();
await page.waitForURL(/\/login/, { waitUntil: "commit" });
await page.goto(BASE + "/sectores");
assert.equal(new URL(page.url()).pathname, "/login");
ok("cerrar sesión bloquea el acceso");

await browser.close();
console.log("\nTodo OK");
