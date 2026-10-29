# Progreso — Validador de pagos v2

Spec: [validador-v2.md](../specs/validador-v2.md). Plan: [PLAN-validador-v2.md](../PLAN-validador-v2.md).
Ramas:
- Las fases 1 a 3 se hicieron en `feat/validador-v2` (sobre `feat/base-agentes`), mergeadas a `main` con los PR #27 y #28.
- La 4a se hizo en `feat/validador-pantalla`, mergeada con el PR #30 y en producción.
- La 4b se hizo en `feat/validador-configuracion`, mergeada con el PR #31.
- La 5 (cierre) está en `feat/validador-cierre`, que sale de `main`.

## Estado
**Fases 1 a 5 hechas** (29/10/2026). Quedan dos pruebas que dependen de Julian: el set real (criterio 14) y la IA real con un PDF (criterios 4 y 12).
- `npm test`: pasan 474 de 479 (9 nuevos en la fase 5). Los 5 que fallan (`catalogo.test.ts`, `menu.test.ts` y `siniestros.test.ts`) son los mismos de antes.
- `npm run lint`: sin errores (las 3 advertencias viejas, en archivos que no se tocaron).
- `npm run build`: OK.
- `npm run test:e2e`: **pasa entero** (23 pasos) contra Postgres 18.6 con el seed.

| Fase | Estado |
|---|---|
| 1. Modelo de datos y reglas (estados, gracia, matching) | Hecha |
| 2. Fuentes (listados, plantillas, credenciales y conectores) | Hecha |
| 3. Corrida y comprobantes | Hecha (las notificaciones se hicieron en la 4b) |
| 4a. Pantalla principal (`/agentes/validador`) | Hecha y en producción (PR #30) |
| 4b. Configuración (4 pestañas) y notificaciones | Hecha y mergeada (PR #31) |
| 5. Seed, evaluación, E2E y PR | Hecha (rama `feat/validador-cierre`). El script está listo y espera el set real |

## Cambios desde la sesión anterior (29/10/2026)
- `feat/base-agentes` y `feat/validador-v2` están mergeadas a `main` (PR #27 y #28). Las migraciones de la 0024 a la 0027 ya se aplicaron en producción.
- En Vercel (producción) están cargadas `CREDENCIALES_PORTAL_KEY` y `COTIZACION_CREDENTIALS_KEY`, con el mismo valor.
- La fase 4 se partió en dos: la **4a** es la pantalla principal y la **4b** es la Configuración, con sus 4 pestañas y las notificaciones.
- **IA prendida en producción** (29/10/2026):
  - `ANTHROPIC_API_KEY` está cargada solo en Production y se hizo el redeploy.
  - En `ia_configuracion` hay una sola fila: agente `*`, operación `*`, activa y con tope de USD 20 por mes. Se insertó a mano desde el SQL Editor de Neon, porque no hay pantalla para eso.
  - La búsqueda de teléfonos de Captación no arranca con la clave sola: desde el PR #29 necesita además `TELEFONOS_IA=1`, que no está cargada. Julian va a rehacer ese agente.

### Criterios de aceptación (sección 8 de la spec)
| Criterio | Estado |
|---|---|
| 1 y 2. Gracia de la 1.ª cuota y de las siguientes | Hecho (fase 1, `estados.test.ts`) |
| 3. Listado con formato guardado, sin IA | Hecho: `procesar.test.ts` y prueba contra Postgres |
| 4. PDF desconocido: la IA lo extrae y queda la plantilla | En código (`manejarExtraerListado()` y `confirmarMapeo()`); falta probarlo con la IA real y un PDF real |
| 5. Comprobante: propone la cuota con su puntaje y no la marca pagada | Hecho: `comprobantes.test.ts` y prueba contra Postgres (sin IA) |
| 6. Totales por moneda | Hecho (fase 1) |
| 7. "Ejecutar validación" crea una corrida en Actividad | Hecho: la pantalla muestra el progreso y Actividad lista las corridas con su estado y sus errores (probado con la app compilada) |
| 8. El cron respeta frecuencia, hora, zona y agente activo | Hecho: `programacion.test.ts` y prueba del endpoint |
| 9. Credenciales nunca en texto plano | Hecho: modelo (`cifrado.test.ts`) y pantalla (4b). Probado contra Postgres: en la base solo queda el secreto cifrado, y editar sin contraseña conserva la anterior |
| 10. "Enviar a Cobranza" | Hecho (4a): deja el borrador del paso que corresponde y nunca lo envía, aunque el paso sea automático (probado contra Postgres) |
| 11. Sin IA funciona y se ocultan los controles | Hecho: en la pantalla principal, sin IA no se ofrece PDF ni la lectura de comprobantes con IA; en la Configuración, los textos del enriquecimiento y del resumen no nombran la IA |
| 12. Conectores simulados: corrida, excepciones explicadas y resumen | Corrida y resumen, sí. La IA explica las excepciones en el enriquecimiento; falta probarlo con la IA real |
| 13. Si un conector falla, vuelve a manual y avisa | En código: error en la corrida, Actividad y `conector_salud`. Desde la 4b, el evento "Errores de la corrida" avisa al productor por WhatsApp o email. El armado del aviso está probado contra Postgres; el envío real no, porque Gmail no estaba conectado. La falla del conector, solo con los tests de canales |
| 14. Set de prueba de Julian (95 % y 90 %) | Script hecho (`npm run evaluar:validador`) y probado con el set de demo. **Falta el set real de Julian** y correrlo con `--ia` |
| 15. E2E | Hecho: paso 13 de `e2e/flujos.mjs`, y la suite completa pasa |

## Hecho (fase 1)
- **Plan:** `docs/PLAN-validador-v2.md` con la tabla "ya existe / falta / cambia", las fases y las preguntas abiertas. Se escribió y se implementó en la misma sesión, porque así lo pidió Julian ("plan corto primero, después implementá").
- **Migración `0025_validador_v2.sql`** (generada con drizzle-kit, solo esto):
  - **`cuotas`:** columnas nuevas `item`, `endoso`, `cupon`, `moneda` (ARS por defecto), `estado_validacion`, `fecha_pago`, `origen_confirmacion`, `ultima_revision`, `cancelada_el` y `motivo_cancelacion`.
  - **Única de `cuotas`:** antes era (póliza, número) y ahora es (póliza, número, ítem, endoso) con `NULLS NOT DISTINCT`, porque en una flota cada ítem tiene su cuota n de N (el conector simulado ya lo devuelve así). Para las cuotas existentes, sin ítem ni endoso, la regla es la misma. Ningún `onConflict` usaba el índice viejo.
  - **Tablas nuevas:** `validador_gracia`, `validador_config`, `validador_corridas`, `validador_fuentes` y `validador_pagos_detectados`, todas con `org_id` y `producer_id`.
  - **Postgres 15 o más:** `NULLS NOT DISTINCT` lo necesita. Neon crea 16 o 17 por defecto, pero hay que confirmar la versión de producción en la consola de Neon.
  - **Probada contra Postgres 17.11** (Docker descartable, 29/10/2026):
    - Con el código de `57cfdee`, la base quedó en la 0024 con los datos de ejemplo (53 cuotas). Después, `db:preparar` de esta rama aplicó la 0025. Las 53 cuotas quedaron idénticas (misma huella md5 antes y después), todas en ARS. El índice viejo se borró y se creó la única nueva.
    - En una transacción deshecha:
      - repetir (póliza, número) sin ítem falla;
      - dos ítems de la misma flota pasan, y repetir un ítem falla;
      - gracia y configuración no aceptan dos filas del mismo alcance, pero sí plataforma más organización;
      - borrar una fuente borra sus pagos, y borrar una cuota deja el pago sin cuota.
    - Una base vacía con la 0000 a la 0025 y el seed nuevo también funciona.
  - **Cómo repetir la prueba:**
    1. `docker run -d --name uniqo-pg-prueba -e POSTGRES_PASSWORD=prueba -e POSTGRES_DB=uniqo -p 55432:5432 postgres:17`.
    2. `DATABASE_URL=postgres://postgres:prueba@127.0.0.1:55432/uniqo npm run db:preparar`.
    3. Para simular producción, correr el paso 2 primero desde un worktree del commit anterior.
  - En producción se aplica en el próximo deploy (`preparar-db`).
- **Reglas** en `src/lib/validador/`, puras y con tests al lado:
  - **`gracia.ts`:**
    - `resolverGracia()`: cascada plataforma → organización → productor y ramo exacto sobre `*`. Compañía y ramo se comparan con `companiaCanonica` y `ramoCanonico`.
    - Sin fila, con la fila deshabilitada o con el interruptor apagado, la gracia es 0.
    - `diasDeGracia()`: días de la 1.ª cuota o de las siguientes.
  - **`estados.ts`:**
    - `calcularEstado()`: pagada > cancelada > vencida > por vencer > pendiente. Devuelve también los días para el vencimiento, el último día de gracia y si la cuota está en gracia.
    - `bloqueDe()`: Esta semana, Próximos o Vencidos.
    - `totalizar()` y `totalesPorBloque()`: una línea por moneda, pagos y asegurados.
    - `cambioPorInforme()`: qué hacer con lo que informa la compañía. Lo que entra en conflicto queda a revisar y no se pisa.
  - **`matching.ts`:**
    - `matchearPago()`, para una fila de listado o de conector contra las cuotas: confirmado, a revisar o no identificado, con candidatos, puntaje y motivos. Contempla flotas por ítem, empates y pagos agrupados.
    - `matchearPagos()`: una cuota no se confirma dos veces en la misma fuente.
    - `cuotasDeCancelacion()`.
    - `proponerCobros()`, para un comprobante contra los cobros abiertos: nunca confirma solo.
  - **`configuracion.ts`:** `resolverConfigValidador()` resuelve la cascada campo por campo, con valores por defecto e ignora los valores inválidos.
- **`importe()`** en `src/lib/formato.ts`: `$ 1.915,61` o `US$ 1.915,61`.
- **Tests:** `gracia.test.ts`, `estados.test.ts` (con los criterios 1 y 2 de la spec y "nunca mezcla ARS con USD"), `matching.test.ts` y `configuracion.test.ts`. Son 52 tests nuevos.

## Decisiones de la fase 1
- Los estados y orígenes nuevos son `text` tipado y no enums de Postgres, como `ia_trabajos`.
- `cuotas.estado` no se toca: Cobranza, Inicio y Estadísticas lo siguen leyendo. Sincronizarlo con `estado_validacion` es de la fase 3.
- No se crea `validador_comprobantes`: en la fase 3 se extiende `comprobantes`, para no duplicar.
- `credenciales_portal` y `plantillas_importacion` pasan a la fase 2, porque dependen del cifrado y de `conector_mapeos`.
- `companias.dias_gracia` (plazo de suspensión que usa Cobranza) sigue igual en la fase 1. Desde el 29/10/2026 está decidido que Cobranza pasa a la gracia del Validador en la fase 3 (ver "Preguntas abiertas").
- Los pesos del matching (30/25/20/15/10 en listados; 40/25/20/10/5 en comprobantes, con mínimo 40) son constantes exportadas. Se calibran con `scripts/evaluar-validador.ts` y el set real de Julian.
- Tolerancia de monto por defecto: $ 1 (la misma que `chequearComprobante()`), configurable en `validador_config`.

## Preguntas del plan: todas decididas (29/10/2026)
Detalle en la sección 4 del plan.
- **Cobranza usa la gracia del Validador** (`validador_gracia`), no `companias.dias_gracia`. Hecho en la fase 3, con la gracia de 30 días copiada por la migración 0027 (ver "Decisiones de las fases 2 y 3").
- **"Esta semana" es la semana calendario**, de lunes a domingo. Ya está hecho: `finDeSemana()` en `src/lib/fechas.ts` y `calcularEstado()`, con tests.
- **Ramos:** una sola lista, la de la cartera (`RAMOS_CARTERA`). No cambia código, porque `gracia.ts` ya usa `ramoCanonico()`.
- **Cobranza lee `estado_validacion`.** Hecho en la fase 3.
- **Plantillas:** se guardan en `conector_mapeos`, con la operación `importar_listado`. No se crea `plantillas_importacion`.

## Subido y probado
- El 29/10/2026 se subieron `feat/base-agentes` y `feat/validador-v2` a GitHub, sin PR. Los deploys de preview no migran la base (`scripts/preparar-db.ts`), así que las migraciones de la 0024 a la 0027 recién se aplican al mergear a `main`.
- **Producción usa Postgres 18.6** (Neon, `SHOW server_version;`), así que `NULLS NOT DISTINCT` funciona.
- **Probado contra Postgres 18.6** (Docker descartable, 29/10/2026):
  - La base quedó en `main` (`dae54c6`, hasta la 0023) con los datos de ejemplo. Después, `db:preparar` de esta rama aplicó la 0024 y la 0025.
  - Las 53 cuotas quedaron idénticas (misma huella md5) y todas en ARS.
  - En una transacción deshecha: repetir (póliza, número) sin ítem falla, dos ítems de la misma cuota pasan y repetir un ítem falla.

## Orden
Julian eligió hacer la importación, los comprobantes y el cron (fases 2 y 3) **antes** que las pantallas (fase 4), para armarlas con datos reales.

## Hecho (fases 2 y 3, 29/10/2026)

### Migraciones (generadas con drizzle-kit)
- **`0026_validador_fuentes.sql`:**
  - `conector_mapeos`: compañía × ramo × operación × versión, mapeo en jsonb, origen (ia o manual) y confirmado. Es única por versión y alcance, con `NULLS NOT DISTINCT`.
  - `credenciales_portal`: compañía, etiqueta, usuario, secreto cifrado, estado y último uso.
  - `validador_fuentes`: nombre, plantilla usada (`mapeo_id`), mapeo propuesto, tabla extraída de un PDF y problemas por fila.
  - `validador_pagos_detectados`: número de fila y la fila original completa.
- **`0027_validador_corrida.sql`:**
  - `comprobantes`: `cuota_id` pasa a opcional (un comprobante subido suelto no tiene cobro hasta que el productor lo confirma). Se suman moneda, referencia, pagador, documento, extracción, candidatos y el motivo de la propuesta.
  - `validador_corridas`: etapa (validación o enriquecimiento), progreso y resumen.
  - `validador_pagos_detectados`: explicación de la IA, acción propuesta y cuota sugerida.
  - **Datos:** copia la gracia a `validador_gracia` (ver "Decisiones").
- **Probadas contra Postgres 18.6** (Docker descartable, 29/10/2026):
  - La base quedó en `main` (`dae54c6`, hasta la 0023) con los datos de ejemplo, más dos pólizas de prueba: una de "Rivadavia" (no está en `companias`) y una de "SANCOR" (en mayúsculas). Después, `db:preparar` de esta rama aplicó de la 0024 a la 0027.
  - Las 53 cuotas quedaron idénticas (misma huella md5).
  - La gracia quedó en 30 días para las 5 compañías y para "Rivadavia", sin duplicar "SANCOR".
  - En una transacción deshecha: repetir la versión de un mapeo falla, y la versión 2 y la de otra organización pasan; un comprobante sin cuota entra.

### Reglas puras (`src/lib/validador/`, con tests)
- **`listados.ts`:**
  - Campos de un listado y sinónimos para proponer el mapeo sin IA.
  - `esquemaMapeoListado` (lo que se guarda en `conector_mapeos`) y `esquemaPropuestaIA` (lo que devuelve la IA, en listas). `mapeoDePropuestaIA()` verifica la propuesta: solo encabezados que existen y cada campo una vez.
  - `plantillaParaTabla()` reconoce la plantilla de la compañía por su huella y elige la versión más alta.
  - `leerListado()` entiende montos argentinos y en dólares, fechas, "4/12", y estados y medios (los conocidos y los propios de la compañía). Cada fila termina leída, en problemas (con número de fila y motivo) o vacía, y la suma da el total. Guarda la fila original completa.
  - "Cancelada" no se interpreta sola: en una cuota puede ser saldada o anulada, así que se aclara en la plantilla.
- **`procesar.ts`:**
  - `planDeFuente()` elige el paso: leer con la plantilla (sin IA, aunque esté disponible), proponer el mapeo (con IA o por sinónimos), extraer un PDF con IA o avisar que sin IA no se puede.
  - `procesarFuente()` cruza con la cartera y aplica `cambioPorInforme()` y las anulaciones. Lo que contradice la cartera queda a revisar.
- **`matching.ts`:** si la compañía no informa el número de cuota, la identifica el vencimiento. Con solo el cupón, ya no dice que la póliza es distinta.
- **`estados.ts`:** `estadoCuotaDe()` sincroniza `cuotas.estado` (una cuota en gracia sigue `pendiente`). También están los nombres de los medios de pago.
- **`comprobantes.ts`:** el esquema de lo que lee la IA, `verificarExtraccion()`, la compañía según la cuenta de destino y los cobros candidatos (sin mezclar monedas).
- **`programacion.ts`:** `tocaEjecutar()` y `proximaEjecucion()` por etapa, con frecuencia, hora y zona horaria. Corre una vez por período, desde la hora del primer día. Si el cron no pasó a esa hora, corre en la próxima pasada del mismo período. Las corridas a mano no cuentan.
- **`corrida.ts`:** el período que se le pide a cada compañía, el estado de la corrida y el resumen sin IA.
- **`src/lib/cifrado.ts`:** AES-256-GCM, compartido con Cotización (mismo formato).

### Agente (`src/agentes/validador/`)
- **`cartera.ts`:**
  - La configuración y la gracia de la cartera, y las cuotas de una compañía para el cruce.
  - `guardarProceso()` guarda los pagos y aplica los cambios en una transacción, sin pisar pagadas ni canceladas. Deja una nota en la ficha y corta la cobranza de los cobros que quedaron cerrados.
  - `recalcularEstados()` es el paso 4: el estado con la gracia y `cuotas.estado` sincronizado.
- **`fuentes.ts`:**
  - `importarListado()` procesa al instante un formato conocido.
  - `avanzarFuente()` y `confirmarMapeo()`: al confirmar, la plantilla queda en una versión nueva.
  - `traerDeConectores()` prueba api → portal. Si fallan, deja el error con el motivo en la corrida y queda la importación manual.
  - Los manejadores de la cola extraen un PDF y proponen el mapeo. Si la IA falla al proponer, quedan los sinónimos.
- **`ia.ts`:** proponer el mapeo y extraer un PDF (Haiku), extraer un comprobante (Haiku), y explicar un caso a revisar y resumir la corrida (Sonnet). Todo pasa por `ejecutarIA()`, y lo que devuelve se verifica: la cuota sugerida tiene que ser una de las candidatas.
- **`comprobantes.ts`:** subir (con IA, a la cola), completar a mano, proponer el cobro, confirmar (recién ahí queda pagada, con origen "comprobante") y descartar.
- **`corrida.ts`:**
  - `iniciarCorrida()` no arranca dos corridas de la misma etapa a la vez.
  - `correrValidacion()`: listados pendientes, conectores, estados y resumen.
  - `correrEnriquecimiento()`: la cola de IA del Validador, la explicación de hasta 20 casos a revisar y el resumen con IA.
  - Cada corrida queda en `validador_corridas` y en Actividad.
- **`trabajos.ts`:** los manejadores, registrados en `src/lib/ia/manejadores.ts`.
- **`/api/cron/validador`:** con `CRON_SECRET`, solo con el agente activo y según la Programación. Está en `vercel.json` a las 08:00 de Argentina (11:00 UTC).
- **"Ejecutar validación"** es el botón del Validador actual (antes "Revisar comprobantes ahora"). Revisa los comprobantes como antes y corre la validación y el enriquecimiento en segundo plano.

### Cobranza
- Usa la gracia del Validador (`graciaDeLaCartera()` y `diasDeGracia()`, por compañía, ramo y número de cuota) en el cron, en los mensajes ("fin de gracia") y en la pantalla.
- Su cron ya no pasa a `vencida` todo lo vencido por fecha: llama a `recalcularEstados()`.
- `confirmarCobro()` también deja el estado del Validador, la fecha de pago y el origen (manual o comprobante). El corte de la secuencia quedó aparte, en `cortarCobranza()`.
- Las cuotas canceladas por la compañía no se cobran ni cuentan como deuda: quedan fuera de las cuotas recientes, de las del mes, de la deuda de Inicio y de Estadísticas.

### Prueba contra Postgres 18.6 (29/10/2026)
Con la base de arriba y `CONECTORES_SIMULADOS=1`:
1. Un CSV de Sancor con formato nuevo, sin IA, queda para confirmar con la propuesta por sinónimos correcta.
2. Al confirmar, se guarda la plantilla y se procesa el listado:
   - la cuota que coincide queda pagada, con la fecha de pago, el medio y el origen "listado";
   - la de otro monto queda a revisar;
   - la impaga queda confirmada sin cambios;
   - la póliza desconocida queda como no identificada;
   - la fila de totales queda en problemas.
3. Reimportar el mismo archivo lo lee con la plantilla y no cambia nada.
4. La validación consulta 4 compañías por la API simulada y termina "ok".
5. Un comprobante cargado a mano propone el cobro correcto (95 puntos) y sigue sin confirmar.
6. Con la app compilada (`next start`):
   - `/api/cron/validador` corre la validación y el enriquecimiento. La segunda llamada solo informa la próxima hora (07:00 y 08:00 del día siguiente), y con el agente apagado no corre.
   - `/api/cron/cobranza` deja "por vencer" (y `pendiente`) las cuotas vencidas por fecha que siguen dentro de los 30 días, y no le prepara mensajes a la cuota que pagó el listado.

Para repetirla: los pasos de "Cómo repetir la prueba" de la fase 1, con `postgres:18.6`. Para correr código del servidor desde un script, `npx tsx --conditions=react-server` (así `server-only` no lo frena).

## Decisiones de las fases 2 y 3
- **Gracia de las compañías sin fila (Julian, 29/10/2026):** se copian los 30 días de `companias.dias_gracia` como fila de plataforma con ramo `*`.
  - Lo hace la migración 0027. También cubre las compañías de las pólizas que no están en `companias`, a las que Cobranza les daba 30.
  - El seed de ejemplo carga lo mismo.
  - Hoy no cambia nada, y se puede editar en Configuración.
  - Una compañía nueva no tiene fila: su gracia es 0 hasta que se cargue. La fase 4 tiene que marcarlo.
- **"Ejecutar validación"** reemplaza al botón actual del Validador, porque la pantalla nueva es la fase 4.
- **`estado_validacion`** lo escriben la corrida y el cron de Cobranza, con `recalcularEstados()`. Lo que confirmó la compañía se ve en `origen_confirmacion` y `ultima_revision`.
- **Un PDF:**
  - la IA transcribe la tabla celda por celda;
  - los montos, las fechas y los estados los lee el código con la plantilla, igual que en un Excel;
  - la próxima vez, la IA solo transcribe.
- **El cron queda diario** (08:00 de Argentina), como los demás. No se pudo confirmar el plan de Vercel, y en Hobby una expresión más frecuente rompe el deploy. Como el endpoint decide si le toca, pasarlo a cada hora es cambiar `vercel.json`.
- **La clave de las credenciales** es `CREDENCIALES_PORTAL_KEY`. Si falta, se usa `COTIZACION_CREDENTIALS_KEY`, porque el formato es el mismo.
- **La cartera todavía no tiene `org_id`:** el Validador trabaja con alcance de plataforma (`ALCANCE_CARTERA`).

## Pendientes y avisos
- **Notificaciones** (WhatsApp y email): hechas en la 4b.
- **"La IA normaliza la salida de cada conector":** los simulados ya devuelven el esquema normalizado. Con una compañía real, la normalización va dentro de su implementación, con `conector_mapeos`.
- **Pagos repetidos:** cada corrida guarda lo que informó cada conector en su período, así que el mismo pago aparece en varias corridas. Resuelto en la 4a: la pantalla muestra solo la última fuente de cada compañía (ver el aviso de la 4a).
- **Seed (fase 5):** las pólizas de los conectores simulados no son las del seed, así que hoy todo lo que traen queda "no identificado". El seed de demo tiene que alinearlas.
- **PDF largo:** un listado de 20 páginas puede superar los 16.000 tokens de salida de Haiku. Si pasa con el set real, hay que partirlo por páginas.
- **Cotización** sigue guardando sus credenciales en `conexiones.datos`. Pasarlas a `credenciales_portal` es un trabajo aparte.
- **Arreglado el 29/10/2026 (venía de antes):** los números de fila de los avisos quedaban corridos después de una línea en blanco de un CSV, o si un Excel empezaba más abajo de la fila 1. Afectaba también a la cartera y a las liquidaciones.
  - Ahora `celdasCsv(…, { conservarVacias: true })` y `leerXlsx()` conservan las filas vacías en su lugar.
  - `ubicarEncabezado()` busca desde la primera fila con datos, y `armarTabla()` saca solo las vacías del final.
  - Tests en `csv.test.ts` e `importacion.test.ts`.

## Hecho (fase 4a, 29/10/2026): la pantalla principal
Rama `feat/validador-pantalla`, commit `209ca7f`. Mergeada a `main` con el PR #30 y en producción.

### Decisiones de Julian (29/10/2026)
- **Cinco pestañas:** Pendientes · Por revisar · Pagadas · Canceladas · Renovaciones.
  - "Por revisar" junta todo lo que espera una decisión: la revisión de comprobantes de siempre (`TablaCobros`, sin cambios de comportamiento), los casos de los listados, los comprobantes sueltos y los listados.
  - La pestaña "Vencidos" anterior es ahora el bloque Vencidos de Pendientes. `?tab=vencidos` lleva ahí y `?tab=pagados` redirige a `?tab=pagadas`.
- **Renovadas:** una póliza vigente cuya vigencia empezó en el plazo elegido (30, 60 o 90 días) y que continúa otra. Puede ser otra póliza del mismo asegurado, ramo y compañía que terminó ese día (5 días de margen, aunque esté dada de baja), o la misma póliza con la vigencia corrida por una reimportación (se creó en UNIQO antes de su vigencia actual).

### Lo que hay
- **Inicio:**
  - las 4 tarjetas (monitoreadas = pendientes + vencidas; pagos confirmados hoy; pendientes; vencidas);
  - los botones Configuración (desde la 4b, va a `/agentes/validador/configuracion`), Actividad, Importar listado y Ejecutar validación;
  - el aviso de conexiones de siempre.
- **Ejecutar validación con progreso:** se ve la barra de cada corrida en curso (`validador_corridas.progreso`). La pantalla consulta `/agentes/validador/progreso` cada 2 segundos y, al terminar, se vuelve a armar. Mientras corre, el botón queda deshabilitado.
- **Actividad:** las últimas 20 corridas con etapa, origen, estado, duración, compañías, cuotas actualizadas, resumen y errores por compañía. Debajo, la bitácora.
- **Pendientes:**
  - **Cobranza:** los tres bloques con `totalesPorBloque()` (una línea por moneda, pagos y asegurados). Cada bloque filtra la lista.
  - La lista va agrupada por asegurado, de a 10 por página ("Mostrando 1–10 de 12 asegurados").
  - Al expandir un asegurado se ve una sub-tabla por cuota: póliza, cuota n/N, ítem, endoso, cupón, monto, vencimiento, medio, estado con punto de color y última revisión.
  - Debajo de cada cuota están sus acciones: marcar pagada (fecha, medio y comprobante opcional), adjuntar comprobante (el formulario de siempre), ver póliza y Enviar a Cobranza. Si el asegurado no tiene contacto, en lugar de Enviar a Cobranza aparece "Completar contacto".
  - **Calendario:** el mes en semanas de lunes a domingo, con lo que vence cada día por moneda. Tocar un día abre la Tabla de ese día.
  - **Tabla:** columnas planas, ordenables por el encabezado, de a 50 por página.
- **Pagadas:** vistas Resumen y Tabla. Este mes y Anteriores filtran la lista. La lista por asegurado muestra la fecha del último pago y, al expandir, el origen de la confirmación.
- **Canceladas:** la tabla de la spec, de la más reciente a la más vieja.
- **Renovaciones:**
  - tarjetas Por renovar y Renovadas (prima y cantidad), con plazos de 30, 60 y 90 días, la lista y el estado vacío "No hay pólizas por renovar";
  - para avisar al asegurado, lleva a Vencimientos;
  - la lista de por renovar sale de `polizasPorVencer()`, que ahora está en `src/lib/vencimientos.ts` y también la usa `/vencimientos`.
- **Filtros y exportar** (Pendientes, Pagadas y Canceladas):
  - buscar por asegurado, póliza o cupón;
  - compañía (por su nombre canónico), ramo, medio de pago y rango de fechas (vencimiento, pago o cancelación, según la pestaña);
  - Exportar baja un CSV con los mismos filtros, bloque, período y orden que la pantalla;
  - **no hay filtro por productor:** la cartera todavía no tiene productor ni `org_id`.
- **Por revisar:**
  - **Comprobantes recibidos:** la revisión de siempre, con todas las filas abiertas. Primero van los que están bien.
  - **Casos de los listados:**
    - qué informó la compañía, el motivo y la explicación de la IA si la hay, con la acción que sugiere;
    - las cuotas candidatas con puntaje y motivos, con la sugerida por la IA marcada;
    - según lo informado: "Marcar pagada esta cuota", "Cancelar esta cuota" o "Enviar a Cobranza". Siempre está "Dejar como está";
    - aplicar usa `guardarProceso()`, el mismo camino que la corrida: no pisa una cuota pagada ni una cancelada. Está en `src/agentes/validador/casos.ts`.
  - **Pagos no identificados:** en una lista plegable, con su fila y su motivo, y "Descartar".
  - **Comprobantes sin asignar:**
    - subir (con IA queda leyéndose; sin IA, para cargar a mano);
    - completar o corregir los datos (`completarComprobante()`);
    - ver los cobros propuestos con su puntaje y confirmar con "Es este cobro: confirmar" (`confirmarComprobante()`), o descartar.
  - **Listados de las compañías:**
    - subir con `importarListado()`;
    - debajo, los últimos 8 listados con su estado y lo que encontró cada uno (coincidieron, a revisar, no identificadas);
    - si es un formato nuevo, se confirman o corrigen las columnas propuestas (`confirmarMapeoElegido()` → `confirmarMapeo()`);
    - los problemas de cada fila se ven con su número ("Fila 6: No tiene vencimiento.").
- **Solo la última fuente de cada compañía:** los casos y los no identificados salen de la última fuente procesada de cada compañía (`ultimasFuentes()`). Así, el mismo pago no aparece una vez por corrida.
- **Sin IA:** el listado acepta solo Excel o CSV y los textos son los de la carga manual (`iaDisponible()` → `estadoIA()`).
- **Con IA:** después de subir un PDF, un formato nuevo o un comprobante, la cola del Validador se procesa enseguida en segundo plano (`after()`), sin esperar al enriquecimiento.

### Código
- **Puro, con tests:**
  - `src/lib/validador/pantalla.ts`: estado con la gracia, tarjetas, filtros, lista por asegurado, calendario, orden, Pagadas, `ultimasFuentes()` y el paso de Cobranza;
  - en `src/lib/vencimientos.ts`, `polizasPorVencer()` y `polizasRenovadas()`.
- **Lecturas:** `src/lib/datos-validador.ts`.
  - Las impagas de los últimos 120 días y los próximos 60 (`VENTANA`, la misma que usan los comprobantes para proponer cobros).
  - Las pagadas y las canceladas de los últimos 12 meses.
  - El estado se calcula al mostrar, con la gracia, así que no depende de que el cron haya corrido ese día.
- **Agente:**
  - `casos.ts` (nuevo);
  - en `fuentes.ts`, `tablaParaConfirmar()` y `confirmarMapeoElegido()`;
  - en Cobranza, `prepararMensaje(…, { soloBorrador })`;
  - `confirmarCobro(…, { fechaPago })`.
- **Pantalla:**
  - nuevos: `Pestanas.tsx`, `Revisar.tsx`, `Actividad.tsx`, `ListaAsegurados.tsx`, `Formularios.tsx`, `vista.ts`, `validador.css` y `progreso/route.ts`;
  - reescritos: `page.tsx` y `exportar/route.ts`;
  - `TablaCobros.tsx` solo cambió para abrir varias filas a la vez y exportar su formulario de comprobante.
- **Compartido:**
  - `src/components/Paginas.tsx`: la paginación que tenía Asegurados, que ahora también la usa;
  - el tipo fecha en `Filtros`, que además vuelve a la página 1 al cambiar un filtro;
  - `.nombre-asegurado` y la paginación pasaron a `globals.css`.
- **Se quitó:** `pestanaDe()` y `montosPorPlazo()` de `src/lib/validador.ts`, con sus tests. Eran las pestañas y los montos de la pantalla anterior y quedaron sin uso.
- **E2E:** `e2e/flujos.mjs` ahora va a `?tab=pagadas` y busca `tbody.grupo-asegurado`. La suite completa no se corrió; su paso del Validador sí, dentro de la prueba de abajo.

### Prueba contra Postgres 18.6 (29/10/2026)
Docker descartable (`postgres:18.6`), `db:preparar` con los datos de ejemplo y la app compilada (`next start`) con `CONECTORES_SIMULADOS=1` y sin `ANTHROPIC_API_KEY`. Un recorrido con Playwright (fuera del repo) pasó estos 18 pasos:
1. Inicio: 4 tarjetas, 5 pestañas, Cobranza con los 3 bloques y la paginación.
2. Al expandir un asegurado, la sub-tabla tiene todas sus columnas.
3. El calendario muestra 7 días con cuotas.
4. La tabla se ordena por monto descendente.
5. El CSV sale con el mismo orden.
6. "Ejecutar validación" muestra la barra de progreso, y Actividad, las 2 corridas (validación y enriquecimiento) en OK.
7. Un CSV de Sancor de formato nuevo queda para confirmar, con la propuesta por sinónimos correcta. Al confirmar, se guarda la plantilla y se lee. La fila de totales queda como "Fila 6: No tiene vencimiento."
8. El pago con otro monto queda como caso a revisar. "Marcar pagada esta cuota" la deja pagada, con origen listado.
9. La póliza desconocida aparece entre los no identificados.
10. Un comprobante suelto sin IA se completa a mano y propone el cobro correcto (80 pts). Al confirmarlo, la cuota queda pagada con origen comprobante.
11. El paso del E2E: "Confirmar pago" en Por revisar, y Acosta aparece en Pagadas (`?tab=pagados` redirige).
12. En Pagadas, al expandir se ve el origen.
13. "Enviar a Cobranza", con el paso 1 marcado como automático, deja un borrador nuevo y no lo envía. Si el cobro ya tenía el borrador de ese paso, devuelve ese y no duplica.
14. "Marcar pagada" con Rapipago deja la cuota pagada, con origen manual y la fecha de pago.
15. Canceladas muestra su tabla.
16. Renovaciones: 16 pólizas por renovar en 60 días. Con una póliza a la que se le corrió la vigencia, aparece 1 renovada.
17. Sin IA no se ofrece PDF.
18. No hay desborde horizontal a 390 px en 6 vistas.

Para repetirla:
1. Los pasos de "Cómo repetir la prueba" de la fase 1, con `postgres:18.6`.
2. `npm run build`.
3. `next start` con `DATABASE_URL`, `CONECTORES_SIMULADOS=1`, `APP_PASSWORD` y `SESSION_SECRET`.

### Avisos de la 4a
- **Última fuente por compañía:** si una compañía tiene listado y conector, la fuente más nueva tapa a la anterior.
  - Un caso de un listado que nadie resolvió deja de verse cuando después corre el conector de esa compañía, aunque no informe ese pago. No se borra: queda en la base.
  - Hoy los conectores simulados no consultan Sancor, así que en la prueba no se vio.
  - Si molesta, la alternativa es mostrar todos los casos sin resolver y juntar los que son el mismo pago.
- **Seed (fase 5):** sigue igual. Los conectores simulados traen pólizas que no están en el seed, y la validación deja unos 96 pagos no identificados.

## Hecho (fase 4b, 29/10/2026): Configuración y notificaciones
Rama `feat/validador-configuracion` (sale de `main` con la 4a ya mergeada), commit `c51bbbb`. Sin subir ni PR.

### Lo que hay (`/agentes/validador/configuracion`, 4 pestañas)
- **Credenciales:**
  - la lista de compañías (las conocidas, las del catálogo y las de la cartera; hoy 21) con su cantidad de credenciales y un punto verde (alguna activa) o naranja (ninguna);
  - el detalle: tipo, "Credenciales 1 (1 activa)", el identificador del proveedor (`sancor`) y si hay conector o es importación manual, más la salud del conector si la hay;
  - la tabla de credenciales (etiqueta, usuario, estado, último uso, creada) con agregar, editar (en una fila debajo; sin contraseña conserva la anterior) y borrar (con confirmación). Usa `guardarCredencial()` y `borrarCredencial()`. Si falta la clave de cifrado, lo dice y no guarda nada;
  - la plantilla de importación de la compañía: versión, si la propuso la IA o se armó a mano, las columnas y "Dejar de usar esta plantilla". Esto último la desconfirma (no la borra), así que el próximo listado se vuelve a confirmar.
- **General:**
  - el interruptor "Habilitar períodos de gracia" (`validador_config.gracia_habilitada`);
  - las pestañas por ramo: "Todos los ramos" más los de `RAMOS_CARTERA`;
  - la grilla compañía × (1.ª cuota, siguientes). Muestra lo heredado de "Todos los ramos", marca "Sin gracia cargada" y avisa cuántas compañías no tienen gracia;
  - con los dos valores vacíos se borra lo cargado (en un ramo, vuelve a heredar);
  - se puede agregar otra compañía;
  - la tolerancia de monto, aparte.
- **Programación:**
  - frecuencia, hora de ejecución, hora de enriquecimiento (tiene que ser después) y zona horaria;
  - la última ejecución de cada etapa, con su estado y sus errores;
  - la próxima ejecución **real**: `proximaPasada()` la calcula sobre las pasadas del cron (`PASADAS_CRON_UTC`, que un test compara con `vercel.json`). Con frecuencia diaria y una hora posterior a las 08:00, avisa que no va a correr;
  - si el agente está inactivo, lo dice.
- **Notificaciones:**
  - WhatsApp y Email, cada uno con su interruptor, sus destinatarios (validados) y el aviso de si la conexión está hecha;
  - qué avisar: pagos confirmados, cuotas que vencen esta semana, vencidas y errores;
  - cómo: resumen diario o evento por evento;
  - "Mandar un aviso de prueba".

### Decisiones
- **Avisos** (`src/lib/validador/notificaciones.ts` y `src/agentes/validador/notificaciones.ts`):
  - van al productor, a los destinatarios que carga, por las conexiones de WhatsApp y Gmail. A los asegurados no se les escribe: eso sigue siendo un borrador de Cobranza;
  - solo salen después de las corridas **automáticas**, no de las que se piden a mano;
  - **resumen diario:** un aviso después del enriquecimiento con el resumen del día, más una línea por cada evento elegido, contado sobre el día (pagos registrados hoy, cuotas por vencer y vencidas, errores de las corridas de hoy);
  - **evento por evento:** después de la validación, un aviso por cada evento elegido que tenga novedades;
  - lo que salió y lo que no queda en Actividad; un aviso que falla no frena la corrida.
- **Alcance:** todo se guarda con el alcance de la cartera (plataforma), como el resto del Validador.

### Arreglos que también tocan la 4a
- `FormConError` envía desde `onSubmit` dentro de una transición: con `<form action>`, React 19 vaciaba los campos al terminar aunque la acción devolviera un error, y el productor perdía lo cargado.
- Los formularios y los filtros se rearman al cambiar de ramo o de pestaña. Antes, al pasar de "Todos los ramos" a "Auto", los campos se quedaban con los valores anteriores y guardar los copiaba al ramo. En el Validador, el buscador mostraba un texto que ya no filtraba.
- "Cuotas vencidas" de la campanita va a `?bloque=vencidos`.

### Prueba contra Postgres 18.6 (29/10/2026)
Base de ejemplo y app compilada con `CONECTORES_SIMULADOS=1`, una `CREDENCIALES_PORTAL_KEY` de prueba y sin IA. El recorrido con Playwright de la Configuración pasó 13 pasos:
1. El botón Configuración lleva a la ruta nueva.
2. Agregar una credencial: en la base solo queda el secreto cifrado, y el punto se pone verde.
3. Editarla sin contraseña conserva la anterior. Pasarla a vencida deja el punto naranja.
4. Borrarla, con confirmación.
5. Después de confirmar un listado de Sancor, la plantilla se ve con sus columnas y se puede dejar de usar.
6. Gracia en "Todos los ramos": cambiar Sancor a 15/5, quitar Mapfre (queda "Sin gracia cargada" y el aviso) y agregar Allianz.
7. Gracia en "Auto": muestra lo heredado y los campos arrancan vacíos. Con un solo valor da error y conserva lo cargado. Guarda 7/0 y el interruptor.
8. La tolerancia guarda 10,50.
9. Programación: rechaza el enriquecimiento antes de la validación y avisa "no va a correr" con las 10:00 diarias.
10. Notificaciones: rechaza un destinatario mal escrito y guarda la configuración.
11. El aviso de prueba queda en Actividad. Sin Gmail autorizado, queda como no enviado.
12. El cron con "evento por evento" arma "Validador: cuotas que vencen esta semana"; con "resumen", "Validador de pagos: resumen del día".
13. No hay desborde a 390 px en las 4 pestañas.

Además:
- el recorrido de 18 pasos de la 4a volvió a pasar sobre una base limpia;
- se comprobó que el buscador queda vacío al cambiar de pestaña.

## Fase 5 (cierre, 29/10/2026)
Rama `feat/validador-cierre`, que sale de `main` con la 4b ya mergeada (PR #31). Julian todavía no tiene el set real: el script se arma con un set de demo y queda listo para correr con el suyo.

### Diseño (decidido al empezar, 29/10/2026)
- **Migración `0028`:** `es_ejemplo` en `validador_fuentes`, `comprobantes` y `conector_mapeos`, para que `borrarEjemplosDeCartera()` se lleve también los listados, los comprobantes sueltos y la plantilla de ejemplo.
- **Arreglo de paso:** la limpieza de archivos de `borrarEjemplosDeCartera()` no miraba `validador_fuentes`, `siniestro_gastos` ni `siniestro_informes`, así que podía borrar un listado, un comprobante de gasto o un informe reales.
- **Seed (`scripts/validador-ejemplo.ts`, lo llama `sembrarCartera()`):**
  - suma San Cristóbal (gracia 15/15) y Rivadavia (30 la 1.ª, 10 las siguientes) a las 4 compañías con pólizas: son las 6 del Validador;
  - las pólizas de cada una son las de `carteraDeEjemplo()` (las que devuelven los conectores simulados), con un asegurado por póliza (29 nuevos; el matching de comprobantes junta en un cobro las cuotas del mismo asegurado que vencen el mismo día) y las cuotas que vencen entre 120 días atrás y 45 adelante: 264, más las 53 de antes;
  - lo pagado hace más de 21 días queda pagado (origen portal; en Sancor, listado). Lo pagado después queda abierto, así "Ejecutar validación" lo confirma;
  - Federación Patronal ya tiene canceladas las cuotas que informa anuladas (Canceladas no arranca vacía); el resto de la anulación, y la de las demás, la descubre la validación;
  - la Vida de Rivadavia no está en la cartera: sus pagos quedan "no identificados";
  - **listado 1:** Sancor, CSV, procesado con su plantilla (coinciden, uno a revisar por monto, uno no identificado y la fila de totales);
  - **listado 2:** La Segunda, CSV de formato nuevo, esperando que se confirmen las columnas;
  - **5 comprobantes sueltos:** uno exacto, uno en USD, uno con dos cobros posibles, uno a una cuenta que no es de la compañía y uno que la IA no pudo leer.
  - **Aviso:** las fechas de los conectores simulados dependen del mes en curso. Si cambió el mes desde que se sembró, hay que volver a sembrar.
- **`scripts/evaluar-validador.ts`:** lee un set (`set.json` con la cartera, los listados y los comprobantes esperados). Sin IA mide la lectura de listados con la plantilla o los sinónimos y el matching; con `--ia` (y una base), la extracción con IA. Set de demo en `scripts/evaluacion-validador/demo/`.
- **E2E:** paso nuevo en `e2e/flujos.mjs` con el criterio 15.

### Hecho en la fase 5
- **Migración `0028_validador_ejemplos.sql`** (generada con drizzle-kit) y la limpieza de `borrarEjemplosDeCartera()`, con el arreglo de los archivos.
- **Seed:** `scripts/validador-ejemplo.ts`, conectado en `scripts/cartera-ejemplo.ts`, que además suma San Cristóbal y Rivadavia a `COMPANIAS`, la gracia por compañía y los acuerdos de los ramos nuevos. Las liquidaciones de ejemplo incluyen lo que el Validador dio por pagado en el período, así el Conciliador sigue mostrando solo sus diferencias de siempre.
  - **La validación ya no deja todo "no identificado":** con la app compilada y `CONECTORES_SIMULADOS=1`, `/api/cron/validador` revisa las 6 compañías, confirma 34 pagos, cancela 22 cuotas y deja 2 casos a revisar (el monto de La Segunda) y 3 no identificados (la Vida de Rivadavia). Las vencidas pasan de 21 a 2: eran cuotas que la compañía ya había cobrado.
  - Probado contra Postgres 18.6 desde cero: 317 cuotas (36 en USD). El listado de Sancor deja 7 pagadas, 1 a revisar, 1 no identificada y la fila de totales en problemas; el de La Segunda queda para confirmar. Los comprobantes proponen 3 cobros (100, 95 y 95 pts), 3 en USD, 3 con la cuota impaga primero, ninguno y "faltan los datos".
- **E2E:** paso 13 de `e2e/flujos.mjs` (los siguientes se corrieron un número). **La suite completa pasa por primera vez** ("Todo OK", 23 pasos) contra Postgres 18.6 y la app compilada con `CONECTORES_SIMULADOS=1`, sin IA ni canales.
  - Para que pase hubo que poner al día selectores viejos (el menú "Asegurados", el PDF de la propuesta, Desempeño, "Cerrar sesión" dentro del menú de la cuenta) y adaptar los pasos que mandan algo: Cobranza, Siniestros y Conciliador ya no tienen envío simulado. Sin WhatsApp o Gmail conectados de verdad, el E2E comprueba que avisan y no sale nada; WhatsApp, que sin el token de Meta no se conecta.
- **Evaluación:** `scripts/evaluar-validador.ts` (`npm run evaluar:validador -- <carpeta> [--ia]`).
  - Lee `set.json`: la cartera (con un id por cuota), las cuentas de cada compañía, cada listado con lo que tiene que salir de cada fila (póliza, monto, vencimiento y la cuota) y cada comprobante con lo que tiene que salir (monto, fecha, póliza si la menciona y la cuota). Un `cuotaId` null quiere decir "no es de la cartera".
  - **Sin IA** mide el código: los listados en Excel o CSV con la plantilla del set (o por sinónimos) y el matching; para los comprobantes usa los `datos` del set. **Con `--ia`** usa las mismas funciones del agente (`ia.ts`) para los PDF, los formatos nuevos y los comprobantes, y queda el costo en `ia_uso`.
  - Sale con código 1 si no se cumple la meta, si el set no tiene 3 compañías y 20 comprobantes, o si se corrió sin `--ia`.
  - **Set de demo** en `scripts/evaluacion-validador/demo/`: ficticio, armado con los conectores simulados al 29/10/2026 (Sancor con ";", La Segunda con "," y otros encabezados, Mapfre con tabulador, sin columna de estado y con su plantilla en el set) y 5 comprobantes en PDF de texto. Sin IA: extracción 95,7 %, matching 88,2 %.
  - Lo único que falla es un caso puesto a propósito: Mapfre pega el ítem a la póliza ("MAP-FL-1222611 / 1") y `leerListado()` no lo separa, así que esas 6 filas no encuentran la póliza. Si aparece en los listados reales, hay que enseñarle a separarlo.
- **Dos bugs reales que encontró el E2E (arreglados):**
  - `src/components/Marco.tsx`: al presionar el mouse en cualquier lado se cerraban **todos** los `<details>` abiertos, no solo los menús. Si arriba había una sección abierta (por ejemplo, "Cargar los datos a mano" de un comprobante sin datos), la página subía y el clic se perdía: "Es este cobro: confirmar" no hacía nada. Ahora solo se cierran `.barra-desplegable` y `.desplegable`.
  - `src/agentes/cotizacion/solicitudes.ts`: crear una cotización desde la ficha de un lead o de un asegurado decía "No hay compañías configuradas para cotizar", porque comparaba "Flota" o "Auto" con "Flotas" o "Automotor". Ahora compara con `ramoCanonico()`.

### Avisos de la fase 5
- **Datos de prueba que no son de ejemplo:** las corridas y lo que traen los conectores simulados (`validador_corridas` y las fuentes `api` o `portal`) no se borran con los ejemplos. Si se vuelve a sembrar sobre una base donde ya se corrió la validación, quedan casos de pólizas que ya no existen. En producción no pasa (no hay conectores simulados); en una base de prueba, borrarlas a mano o empezar de cero.
- **"No se pudo enviar el mensaje. Probá de nuevo en un rato."** es lo que ve el productor en Cobranza cuando no tiene WhatsApp ni Gmail conectados. El motivo real ("WhatsApp Business no está conectado") queda solo en el log. Conviene decirlo en pantalla.
- **`new Date()` al prerenderizar:** `next start` registra errores "Next.js encountered the unstable value `new Date()` while prerendering" en `/asegurados`, `/agentes/validador` y `/agentes/siniestros`. Las páginas se ven bien y el E2E pasa, pero conviene revisarlo (Next 16 con cacheComponents).

## Próximo paso exacto
1. ~~Subir la 4b~~: hecho (PR #31).
2. ~~Fase 5 (cierre)~~: hecha en `feat/validador-cierre`. Falta el PR y el merge (trae la migración 0028, que solo agrega columnas).
3. **Cuando se habilite cada conexión** (decisión de Julian del 29/10/2026: las conexiones reales y la IA se habilitan de a una y se prueban; no son bloqueos):
   - el set real: listados anonimizados de 3 compañías y 20 comprobantes, con su `set.json` como el de `scripts/evaluacion-validador/demo/`. Correr `npm run evaluar:validador -- <carpeta> --ia` y calibrar los pesos del matching con lo que salga;
   - la IA real (criterios 4 y 12): subir un PDF de listado desconocido en la pantalla y ver que la IA lo transcribe y queda la plantilla al confirmarlo; y con `CONECTORES_SIMULADOS=1`, que el enriquecimiento explique los casos a revisar y escriba el resumen. Necesita una `ANTHROPIC_API_KEY` en un entorno que no sea producción (la de producción está solo en Production).

### Lo que se planeó al empezar la fase 5

   - **Seed de demo:**
     - 6 compañías y unas 300 cuotas en ARS y USD, en todos los estados;
     - 2 listados de ejemplo y 5 comprobantes ficticios;
     - pólizas alineadas con las de los conectores simulados, así la validación no deja todo "no identificado".
   - **`scripts/evaluar-validador.ts`:** con el set real de Julian (listados anonimizados de 3 compañías y 20 comprobantes), medir que la extracción de monto, fecha y póliza acierte al menos el 95 % y que el matching sugiera la cuota correcta al menos el 90 %. **Hace falta que Julian pase el set.** Calibrar los pesos del matching con eso.
   - **E2E** del criterio 15: importar un listado → ver los totales → expandir un asegurado → confirmar un comprobante → cuota pagada → enviar una vencida a Cobranza. Sumarlo a `e2e/flujos.mjs`.
   - **Con la IA real**, ya prendida en producción: probar los criterios 4 (un PDF desconocido) y 12 (excepciones explicadas y resumen).
   - **El PR final** y cerrar este progreso.
