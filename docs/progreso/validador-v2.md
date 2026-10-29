# Progreso — Validador de pagos v2

Spec: [validador-v2.md](../specs/validador-v2.md). Plan: [PLAN-validador-v2.md](../PLAN-validador-v2.md).
Rama: `feat/validador-v2`, que sale de `feat/base-agentes` (necesita sus tipos y tablas).

## Estado
**Fase 1 hecha** (29/10/2026).
- `npm test`: pasan 390 de 395. Los 5 que fallan (`catalogo.test.ts`, `menu.test.ts` y `siniestros.test.ts`) ya fallaban antes de la base común.
- `npm run lint`: sin errores (3 advertencias viejas en archivos que no se tocaron).
- `npm run build`: OK.

| Fase | Estado |
|---|---|
| 1. Modelo de datos y reglas (estados, gracia, matching) | Hecha |
| 2. Fuentes (listados, plantillas, credenciales y conectores) | Pendiente |
| 3. Corrida y comprobantes | Pendiente |
| 4. UI | Pendiente |
| 5. Seed, evaluación, E2E, README y PR | Pendiente |

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

## Preguntas abiertas
Sección 4 del plan. Julian decidió tres el 29/10/2026:
- **Cobranza usa la gracia del Validador** (`validador_gracia`), no `companias.dias_gracia`. Se hace en la fase 3. Antes hay que cargar la gracia, porque sin fila es 0 y hoy Cobranza usa 30.
- **"Esta semana" es la semana calendario**, de lunes a domingo. Ya está hecho: `finDeSemana()` en `src/lib/fechas.ts` y `calcularEstado()`, con tests.
- **Cobranza lee `estado_validacion`.** Se hace en la fase 3.

Siguen abiertas la lista de ramos (3) y si plantillas y `conector_mapeos` son la misma tabla (5).

## Subido
El 29/10/2026 se subieron `feat/base-agentes` y `feat/validador-v2` a GitHub, sin PR. Los deploys de preview no migran la base (`scripts/preparar-db.ts`), así que la 0024 y la 0025 recién se aplican al mergear a `main`. Falta confirmar la versión de Postgres de Neon (`SHOW server_version;` en Vercel → Storage → neon-amethyst-drum → Query).

## Próximo paso exacto
Responder la pregunta 5 (plantillas contra `conector_mapeos`). Después, fase 2:
- Parser determinista de listados XLSX y CSV a `PagoNormalizado`, reusando `leerXlsx` y `celdasCsv` como `src/lib/importacion.ts`.
- `plantillas_importacion` en la migración `0026`.
- Test del criterio 3: un listado con formato guardado actualiza las cuotas coincidentes y deja las demás a revisar o no identificadas, sin llamar a la IA.
