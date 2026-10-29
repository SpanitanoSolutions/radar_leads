# Progreso — Validador de pagos v2

Spec: [validador-v2.md](../specs/validador-v2.md). Plan: [PLAN-validador-v2.md](../PLAN-validador-v2.md).
Rama: `feat/validador-v2`, que sale de `feat/base-agentes` (necesita sus tipos y tablas).

## Estado
**Fases 1, 2 y 3 hechas** (29/10/2026). Falta la UI (fase 4) y el cierre (fase 5).
- `npm test`: pasan 429 de 434 (38 nuevos en esta sesión). Los 5 que fallan (`catalogo.test.ts`, `menu.test.ts` y `siniestros.test.ts`) ya fallaban antes de la base común.
- `npm run lint`: sin errores (3 advertencias viejas en archivos que no se tocaron).
- `npm run build`: OK.

| Fase | Estado |
|---|---|
| 1. Modelo de datos y reglas (estados, gracia, matching) | Hecha |
| 2. Fuentes (listados, plantillas, credenciales y conectores) | Hecha |
| 3. Corrida y comprobantes | Hecha (sin notificaciones: pasan a la fase 4) |
| 4. UI | Pendiente |
| 5. Seed, evaluación, E2E y PR | Pendiente (el README ya está actualizado) |

### Criterios de aceptación (sección 8 de la spec)
| Criterio | Estado |
|---|---|
| 1 y 2. Gracia de la 1.ª cuota y de las siguientes | Hecho (fase 1, `estados.test.ts`) |
| 3. Listado con formato guardado, sin IA | Hecho: `procesar.test.ts` y prueba contra Postgres |
| 4. PDF desconocido: la IA lo extrae y queda la plantilla | En código (`manejarExtraerListado()` y `confirmarMapeo()`); falta probarlo con la IA real y un PDF real |
| 5. Comprobante: propone la cuota con su puntaje y no la marca pagada | Hecho: `comprobantes.test.ts` y prueba contra Postgres (sin IA) |
| 6. Totales por moneda | Hecho (fase 1) |
| 7. "Ejecutar validación" crea una corrida en Actividad | Hecho con el botón actual del Validador; la pantalla nueva es la fase 4 |
| 8. El cron respeta frecuencia, hora, zona y agente activo | Hecho: `programacion.test.ts` y prueba del endpoint |
| 9. Credenciales nunca en texto plano | Hecho en el modelo (`cifrado.test.ts`); la UI es la fase 4 |
| 10. "Enviar a Cobranza" | Fase 4 |
| 11. Sin IA funciona y se ocultan los controles | El servidor, sí; ocultar los controles es la fase 4 |
| 12. Conectores simulados: corrida, excepciones explicadas y resumen | Corrida y resumen, sí. La IA explica las excepciones en el enriquecimiento; falta probarlo con la IA real |
| 13. Si un conector falla, vuelve a manual y avisa | En código (error en la corrida, Actividad y `conector_salud`); probado solo con los tests de canales |
| 14. Set de prueba de Julian (95 % y 90 %) | Fase 5 |
| 15. E2E | Fase 5 |

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
- **Notificaciones** (WhatsApp y email): pasan a la fase 4, con su pantalla de Configuración.
- **"La IA normaliza la salida de cada conector":** los simulados ya devuelven el esquema normalizado. Con una compañía real, la normalización va dentro de su implementación, con `conector_mapeos`.
- **Pagos repetidos:** cada corrida guarda lo que informó cada conector en su período, así que el mismo pago aparece en varias corridas. La UI tiene que mostrar la última fuente de cada compañía.
- **Seed (fase 5):** las pólizas de los conectores simulados no son las del seed, así que hoy todo lo que traen queda "no identificado". El seed de demo tiene que alinearlas.
- **PDF largo:** un listado de 20 páginas puede superar los 16.000 tokens de salida de Haiku. Si pasa con el set real, hay que partirlo por páginas.
- **Cotización** sigue guardando sus credenciales en `conexiones.datos`. Pasarlas a `credenciales_portal` es un trabajo aparte.
- **Arreglado el 29/10/2026 (venía de antes):** los números de fila de los avisos quedaban corridos después de una línea en blanco de un CSV, o si un Excel empezaba más abajo de la fila 1. Afectaba también a la cartera y a las liquidaciones.
  - Ahora `celdasCsv(…, { conservarVacias: true })` y `leerXlsx()` conservan las filas vacías en su lugar.
  - `ubicarEncabezado()` busca desde la primera fila con datos, y `armarTabla()` saca solo las vacías del final.
  - Tests en `csv.test.ts` e `importacion.test.ts`.

## Próximo paso exacto
Fase 4, la UI de `/agentes/validador` (sección 5 de la spec), sobre lo que ya existe en `src/agentes/validador/`:
- Inicio con las 4 tarjetas, "Ejecutar validación" con progreso (`validador_corridas.progreso`) y Actividad con las corridas y sus errores.
- Pestañas Pendientes (vistas Cobranza, Calendario y Tabla, con `totalesPorBloque()`), Pagadas, Canceladas y Renovaciones.
- Importar un listado y confirmar el mapeo (`importarListado()` y `confirmarMapeo()`), y los casos a revisar con la explicación de la IA.
- Comprobantes sueltos: subir, completar, confirmar o descartar.
- Configuración en 4 pestañas: credenciales (`src/lib/conectores/credenciales.ts`) con la plantilla de cada compañía, gracia (marcando las compañías sin fila), programación (`proximaEjecucion()`) y notificaciones.
- "Enviar a Cobranza" y ocultar los controles de IA cuando no hay IA.
