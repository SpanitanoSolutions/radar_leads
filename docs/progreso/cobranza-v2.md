# Progreso — Cobranza v2

Spec: [cobranza-v2.md](../specs/cobranza-v2.md). Plan: [PLAN-cobranza-v2.md](../PLAN-cobranza-v2.md).
Rama: `feat/cobranza-v2`, sale de `main` en `4b8762a` (PR #38). Un commit por fase.

## Estado

| Fase | Estado |
|---|---|
| 1. Plan y spec | Hecha |
| 2. Modelo de datos y reglas | Hecha |
| 3. Casos (sincronización, acciones, Validador) | Pendiente |
| 4. Tablero y detalle | Pendiente |
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

## Próximo paso exacto
Fase 3: `src/agentes/cobranza/` (sincronizar casos con la cartera, eventos, marcar pagado, reactivar, no contactar) y pasar el Validador y la aprobación de mensajes a los casos.
