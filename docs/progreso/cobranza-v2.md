# Progreso — Cobranza v2

Spec: [cobranza-v2.md](../specs/cobranza-v2.md). Plan: [PLAN-cobranza-v2.md](../PLAN-cobranza-v2.md).
Rama: `feat/cobranza-v2`, sale de `main` en `4b8762a` (PR #38), con `main` mergeado después del #39. Un commit por fase. **PR #40.**

## Estado

**Fases 1 a 9 hechas** (31/10/2026). El criterio de aceptación de la spec se cumple con una API de Anthropic falsa local; falta probarlo con la IA real y con Gmail o WhatsApp conectados (van de a una, decisión del 29/10/2026).


| Fase | Estado |
|---|---|
| 1. Plan y spec | Hecha |
| 2. Modelo de datos y reglas | Hecha |
| 3. Casos (sincronización, acciones, Validador) | Hecha |
| 4. Tablero y detalle | Hecha |
| 5. Configuración y demo | Hecha |
| 6. Motor, corridas, Instrucciones y Ejecuciones | Hecha |
| 7. Entrantes y avisos | Hecha |
| 8. API | Hecha |
| 9. Cron, menú, E2E, README y verificación | Hecha |

## Hecho

### Fase 2 — modelo de datos y reglas
- **Migración `0031_cobranza_v2.sql`** (drizzle-kit, solo agrega): `cobranza_config`, `cobranza_casos`, `cobranza_eventos`, `cobranza_corridas`, `cobranza_no_contactar` y `api_claves`. Al final, la copia de la v1: cada `seguimientos_cobranza` pasa a ser un caso (terminado → pagado; pausado con promesa → promesa; pausado sin promesa → escalado con el motivo; activo → sin_respuesta si tenía pasos, si no pendiente), con un evento "Venía de la Cobranza anterior", y los mensajes de cobranza ya enviados entran como eventos. `seguimientos_cobranza` no se toca.
- **Probada contra Postgres 18.6** (contenedor descartable `uniqo-cobranza-prueba`, puerto 55440): base en la 0030 con la cartera de ejemplo de `main` → `db:preparar` de esta rama. Los 10 seguimientos quedaron como 10 casos con el estado esperado y los mensajes enviados en la línea de tiempo.
- **`src/lib/cobranza/`** (puro, con tests): `tipos.ts`, `configuracion.ts` (valores de la spec, lectura de la fila, validación con zod de cambios parciales), `tramos.ts`, `estados.ts` (etiquetas, pestañas y los 5 KPIs por moneda) y `reglas.ts` (reglas duras, momento del día, canales y destinos, sincronización con la cartera). 40 tests.

### Fases 3 y 4 — casos, tablero y detalle (un solo commit: la pantalla de la v1 dependía de lo que se reemplazó)
- **`src/agentes/cobranza/casos.ts`:** configuración (leer y guardar), eventos, `sincronizarCasos()` (crea los casos de los cobros impagos de −60 a +30 días, pasa a pagado, aplica filtros, falta de contacto y bajas de póliza, retoma promesas vencidas; cada cambio deja su evento), `casosDeCuotas()` y `asegurarCaso()` (un caso apunta a la cuota de menor id de todo el cobro, pagadas incluidas), `cerrarPorPago()`, `pausarCaso()`, `reactivarCaso()`, `cambiarNoContactar()`, `actualizarContacto()` y `despuesDeEnviarMensaje()`.
- **Validador:** `cortarCobranza()` y `pausarCobranza()` (antes `pausarSeguimiento`) cambian el estado del caso. Sus borradores siguen igual (`prepararMensaje`, plantillas de la v1) y dejan un evento "Para aprobar" con el id del mensaje. `soloBorrador` ya no existe: todo pedido queda para aprobar.
- **Se sacó de la v1:** `generarBorradores`, `marcarPaso`, la configuración de pasos y reglas (`ConfigCobranza`), la pestaña Secuencia y las funciones de `src/lib/cobranza.ts` que solo usaba la pantalla vieja. `src/lib/cobranza.ts` quedó con las referencias y etiquetas de "Para aprobar" (suma `agente` y `llamada`).
- **Seed base:** los 10 seguimientos de ejemplo son casos con su línea de tiempo (mensajes enviados, borradores, promesa y escalados).
- **Pantallas:** `/agentes/cobranza` (5 KPIs, pestañas Activos, Sin datos de contacto, Excluidas por reglas y Para aprobar, filtros, tabla y paginación) y `/agentes/cobranza/[id]` (Detalle con el recibo y "Qué hace el agente hoy", Seguimiento con la línea de tiempo, Estatus, Contacto editable, Marcar como pagado, Reactivar y No contactar). Estilos en `cobranza.css`, con los tokens del tema.
- **Probado** contra Postgres 18.6 con la app (worktree aparte en el scratchpad, `next dev --webpack` en el puerto 3217, porque en el repo ya corre otro `next dev` en el 3100): la migración desde la 0030 con el seed de `main`, el tablero, "Para aprobar" con los borradores de la v1 (llamada incluida) y el detalle.
- Tests: 664 de 667 (los 3 que fallan son los de antes). Lint sin errores en lo tocado.

### Fase 5 — configuración y demo
- **`/agentes/cobranza/configuracion`:** pestaña General con navegación vertical (Estrategia con reglas generales, reglas de re-contacto y tramos editables en un panel lateral, que se suben, bajan, agregan y borran; Filtros; Horario con la próxima ejecución real según el cron diario; Información; Notificaciones; Pruebas con el modo prueba y "Pedirme aprobación"; Demo) y pestaña Canales (habilitado, instrucciones, remitente con "Verificar" contra la conexión real y bloque de Test). Cada sección guarda por separado y valida con `aplicarCambios()`; si algo no cierra, vuelve con el primer error.
- **Canales** (`src/agentes/cobranza/canales.ts`): real si la conexión anda (Gmail, WhatsApp Business); simulado solo en modo prueba; en modo real sin conexión, error. El teléfono no tiene proveedor: simulado en prueba y tarea para el productor en modo real.
- **Programación** (`src/lib/cobranza/programacion.ts`, con tests): pasada diaria del cron a las 10:00 de Argentina; corre si el día está permitido, ya es la hora y no corrió hoy.
- **Demo** (`src/db/demo-cobranza.ts`, botón y `npm run db:seed:cobranza`): 100 asegurados ficticios con una póliza y un recibo cada uno, 7 aseguradoras, vencimientos de −40 a +30, 10 sin contacto, 5 excluidos (uno pidió la baja), escalados, promesas, rechazos, consultas, pagos informados y pagados, y la línea de tiempo con todos los tipos de evento. Los asegurados llevan la nota de la demo y son ejemplo: recargarla reemplaza la anterior y "Borrar datos de ejemplo" la limpia.

### Fase 6 — motor, corridas, Instrucciones y Ejecuciones
- **IA con herramientas** (`src/lib/ia`): `ProveedorClaude.conversar()` (único lugar con el SDK; sistema y herramientas en caché, `cache_control` general, `effort`), `conversarConHerramientas()` en `motor.ts` (turnos con tope, cada turno en `ia_uso`, nunca lanza y devuelve cuántas herramientas ya ejecutó) y `ejecutarAgenteIA()` en `ejecutar.ts` (mismo interruptor y tope de USD 20 que `ejecutarIA()`). Tarea nueva `actuar`: Haiku 5.5, esfuerzo medio, 4.000 tokens. Tests con proveedor falso.
- **`src/lib/cobranza/`:** `herramientas.ts` (las 7 herramientas con su esquema y validación zod), `prompt.ts` (las instrucciones de la spec armadas desde la configuración, con trato digno y modo prueba) y `plantillas.ts` (mensajes sin IA por tramo y el texto del intento, "Cuarto intento. Póliza vencida hace 11 días, $ 14.974,43.").
- **`src/agentes/cobranza/motor.ts`:** `iniciarCorrida()` con lock (`pg_advisory_xact_lock`; una corrida colgada más de 15 min se cierra como error) y `correrCobranza()`: sincroniza, escala por máximo de intentos, respeta días y ventana (modo real), elige los recibos que pasan las reglas (en modo prueba, con el filtro y el máximo de Pruebas), los agrupa por asegurado y conversa con la IA (3 en paralelo, 240 s de presupuesto). Cada herramienta pasa por `crearEjecutor()`: casos del asegurado, reglas, canal habilitado y con dato, destino de prueba, aprobación, ejemplos simulados en modo real, errores registrados. Sin IA (o si falla), el mismo ejecutor manda la plantilla. Avisos al productor (`avisos.ts`) al final.
- **Pantallas:** "Ejecutar ahora" en el tablero, Ejecuciones (lista y detalle que se actualiza solo, con por qué no le escribió a cada uno) y la vista del agente (`/agentes/cobranza/instrucciones`) con Instrucciones, Herramientas, Triggers, Ejecuciones, Detalles y Settings, y los botones Probar y ▶ Ejecutar.
- **Probado con la app compilada** (`next build --webpack` en el worktree y `next start`; en dev webpack tardaba minutos en compilar la página): sin IA, la corrida tomó 3 recibos de la demo en modo prueba y los contactó con las plantillas (simulado), con los omitidos explicados. Con una API de Anthropic falsa local (`ANTHROPIC_BASE_URL`), la IA pidió `enviar_whatsapp`/`enviar_email` y `terminar` para 3 asegurados: 6 turnos en `ia_uso` (Haiku 5.5), sistema y herramientas con `cache_control`, esfuerzo `medium`, intentos, estados, KPIs y línea de tiempo actualizados. **Criterio de aceptación de la spec cumplido** con la IA falsa; falta probarlo con la IA real (decisión del 29/10: de a una).
- Tests: 675 de 678 (los 3 de siempre). Lint sin errores en lo tocado.

### Fases 7 y 8 — entrantes y API (un commit: los webhooks de entrantes son rutas de la API)
- **Entrantes** (`src/agentes/cobranza/entrantes.ts`, reglas en `src/lib/cobranza/entrantes.ts` con tests): se reconoce al asegurado por la referencia `C-<id>` del texto o el asunto, por su teléfono (últimos 10 dígitos: "+54 9 223…" = "223…") o su correo y, en modo prueba, por el destino de prueba (el último caso al que se le escribió ahí). La respuesta queda en la línea de tiempo de sus recibos abiertos y el agente la procesa con el flujo "Respuesta entrante" (en modo `entrante` del ejecutor: puede contestar aunque se le haya escrito hace poco, y no suma intentos). Sin IA, reglas prudentes: baja, rechazo, "ya pagué", "mañana lo pago" o consulta; no contesta. El texto del asegurado va como dato (el prompt lo dice y las herramientas solo tocan sus casos). En el detalle del caso, "Simular respuesta" (solo en modo prueba).
- **Avisos al productor** al final de una corrida o de una respuesta: escalados, consultas, rechazos y promesas, por el canal de Notificaciones y solo por conexión real.
- **API** (`/api/v1/agentes/cobranza/...`): `configuracion` (GET, PUT parcial validado), `corridas` (POST en segundo plano con 202, 409 si hay otra; GET lista) y `corridas/:id`, `casos` (filtros pestana, estado, compania, q y paginación), `casos/:id` (con la actividad), `casos/:id/pagado`, `casos/:id/reactivar`, `universo` y `entrantes/whatsapp` y `/email`. Errores `{ error: { codigo, mensaje } }` con 400, 401, 403, 404, 409 y 500, en castellano (zod con su idioma español, solo en estas validaciones). El proxy deja pasar `/api/v1/`; cada ruta exige `Authorization: Bearer uniqo_…` (`api_claves` guarda el hash y el prefijo).
- **`/agentes/cobranza/api`:** referencia por secciones (primeros pasos, autenticación con "Generar API key" que la muestra una sola vez y la lista para revocar, errores, paginación, actividad, cada endpoint con cURL, JavaScript y respuesta, esquemas) e "Imprimir / Guardar PDF". `api-docs.test.ts` comprueba que cada endpoint documentado exista y exporte su método.
- **Probado con la app compilada y la IA falsa:** clave generada desde la pantalla; con curl, 401 sin clave o con clave mala, 400 por JSON roto o datos inválidos, PUT parcial, corrida 202 y 409 al repetir, detalle de la corrida, casos filtrados, universo, pagado y reactivar (con 409 al repetir) y 404. Entrantes: WhatsApp desde el número real con "+54 9" → la IA registró la promesa y contestó (simulado); correo con "Ref. C-2" → a ese caso; desconocido → 404; desde el WhatsApp de prueba → al último caso contactado. Con la IA apagada, "no me escriban más" → baja (excluido, marca de baja) y la API no deja reactivarlo.
- Tests: 683 de 686 (los 3 de siempre). Lint sin errores.

### Fase 9 — cron, menú, Inicio, E2E, README y verificación
- **Cron:** `/api/cron/cobranza` pasa a las 13:00 UTC (10:00 de Argentina, la hora por defecto de la spec) y corre si `tocaCorrer()` (agente activo, día permitido, desde la hora configurada, una vez por día); la corrida va en el mismo pedido (`maxDuration` 300).
- **Menú e Inicio:** el contador de Cobranza suma los mensajes para aprobar (del agente y del Validador) y los casos que esperan al productor (escalados, rechazos, consultas y pagos informados): "N requieren tu atención". "Extractor de pólizas" entra al menú como "Pronto", con su página "Próximamente".
- **E2E:** el paso 14 aprueba desde "Para aprobar" y el 14b recorre la spec (5 KPIs, "Probar" hasta que termina la corrida, la línea de tiempo del caso con modo prueba, "Simular respuesta" con una baja, Configuración → Pruebas y la API); la revisión a 390 px suma las 7 pantallas nuevas.
- **README:** sección "Agente de Cobranza v2", cron, script de la demo y E2E.
- **Verificación (31/10/2026):**
  - `npm test`: 683 de 686; los 3 que fallan son los de antes (`catalogo.test.ts`, `menu.test.ts` por "Mi cartera" y `siniestros.test.ts`).
  - `tsc`: OK. `npm run lint`: sin errores (5 avisos viejos, en Siniestros y Configuración).
  - `next build --webpack`: OK, en un worktree del scratchpad (en el repo corre otro `next dev` en el puerto 3100 y no lo toqué).
  - Migración: base en la 0030 con el seed de `main` → 0031 de esta rama (los seguimientos pasan a casos); y base vacía con la 0000 a la 0031 y el seed nuevo.
  - **E2E entero (25 pasos) OK** contra la app compilada, Postgres 18.6 descartable, sin IA.
  - Con IA falsa: corridas, entrantes y la API (ver fases 6 a 8). Tema oscuro revisado.

## Pendiente (no bloquea; van de a una)
- Probar el agente con la **IA real** (la fila `*`/`*` de `ia_configuracion` ya cubre a Cobranza; entra en el tope de USD 20) y medir el costo por corrida.
- Envíos reales: hoy salen solo con Gmail o WhatsApp conectados. Con Gmail conectado, en modo prueba ya llegan al correo de prueba.
- **WhatsApp entrante de Meta:** el webhook propio (`/entrantes/whatsapp`) recibe `{ de, texto }` con la clave de la API; el formato y la verificación de Meta se suman con la conexión de WhatsApp.
- Plantillas aprobadas de WhatsApp para iniciar conversaciones (spec 11).
- Registro "No Llame" (Ley 26.951): las llamadas hoy son tareas del productor; hay que revisarlo antes de llamadas automáticas.

### Antes del merge (31/10/2026)
- Se mergeó `main` (#39, logo) sin conflictos; build, tests y E2E siguen OK.
- **El cron no corre solo en modo prueba**: los envíos se simulan pero los intentos cuentan en casos reales, así que el cron diario los habría gastado y escalado sin escribirle a nadie. En modo prueba se prueba con "Probar" o "Ejecutar ahora"; con el modo prueba apagado (y la aprobación prendida), el cron deja los mensajes para aprobar, como la v1.

## Próximo paso exacto
Con el PR #40 mergeado, revisar que el deploy de producción diga "✓ Migraciones aplicadas" (la 0031). Después, en producción: Configuración → Pruebas con destinos de prueba propios y "Probar" en la vista del agente.
