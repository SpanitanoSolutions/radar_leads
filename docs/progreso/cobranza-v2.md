# Progreso — Cobranza v2

Spec: [cobranza-v2.md](../specs/cobranza-v2.md). Plan: [PLAN-cobranza-v2.md](../PLAN-cobranza-v2.md).
Rama: `feat/cobranza-v2`, sale de `main` en `4b8762a` (PR #38). Un commit por fase.

## Estado

| Fase | Estado |
|---|---|
| 1. Plan y spec | Hecha |
| 2. Modelo de datos y reglas | Hecha |
| 3. Casos (sincronización, acciones, Validador) | Hecha |
| 4. Tablero y detalle | Hecha |
| 5. Configuración y demo | Hecha |
| 6. Motor, corridas, Instrucciones y Ejecuciones | Hecha |
| 7. Entrantes y avisos | Pendiente |
| 8. API | Pendiente |
| 9. Cron, menú, E2E, README y verificación | Pendiente |

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

## Próximo paso exacto
Fase 7: entrantes. `procesarEntrante()` (identificar el caso por el teléfono o el correo, o la referencia "C-<id>", y conversar con la IA en modo entrante; sin IA, reglas simples para baja y "ya pagué"), las rutas `/api/v1/agentes/cobranza/entrantes/whatsapp` y `/email` (llegan con la fase 8, la API) y "Simular respuesta" en el detalle del caso en modo prueba.
