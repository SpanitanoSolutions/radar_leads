# Progreso — Cobranza v2

Spec: [cobranza-v2.md](../specs/cobranza-v2.md). Plan: [PLAN-cobranza-v2.md](../PLAN-cobranza-v2.md).
Rama: `feat/cobranza-v2`, sale de `main` en `4b8762a` (PR #38). Un commit por fase.

## Estado

| Fase | Estado |
|---|---|
| 1. Plan y spec | Hecha |
| 2. Modelo de datos y reglas | Hecha |
| 3. Casos (sincronización, acciones, Validador) | Hecha |
| 4. Tablero y detalle | Hecha (falta "Ejecutar ahora", que llega con el motor) |
| 5. Configuración y demo | Pendiente |
| 6. Motor, corridas, Instrucciones y Ejecuciones | Pendiente |
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

## Próximo paso exacto
Fase 5: Configuración (`/agentes/cobranza/configuracion`, General con Estrategia, Filtros, Horario, Información, Notificaciones, Pruebas y Demo, y Canales) y la demo de 100 casos.
