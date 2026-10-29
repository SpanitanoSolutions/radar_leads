# Plan de implementación: Validador de pagos v2

Spec: [validador-v2.md](specs/validador-v2.md). Base: [progreso/base-comun.md](progreso/base-comun.md) (capa IA, cola `ia_trabajos`, conectores simulados).
Rama: `feat/validador-v2`, que sale de `feat/base-agentes`. Progreso: [progreso/validador-v2.md](progreso/validador-v2.md).

## 1. Ya existe / falta / cambia

| Área | Ya existe | Falta | Cambia |
|---|---|---|---|
| Cuotas | `cuotas` con número, monto, vencimiento, `estado` (pendiente, pagada o vencida), `pagada_el` y `medio_pago`. El total de cuotas está en `polizas.cantidad_cuotas` | Ítem, endoso, cupón, moneda, estado del Validador, fecha de pago, origen de la confirmación, última revisión, fecha y motivo de cancelación | Nada se borra. `estado` sigue igual para Cobranza, Inicio y Estadísticas hasta la fase de corrida |
| Estados | Cobranza pasa a `vencida` toda cuota con `vencimiento < hoy`, sin gracia. `pestanaDe()` y `montosPorPlazo()` en `src/lib/validador.ts` | Estados con gracia (pendiente, por vencer, vencida, pagada, cancelada) y totales por moneda | `src/lib/validador.ts` (v1) queda como está hasta la fase de UI |
| Gracia | `companias.dias_gracia` (30 por defecto): días hasta que la compañía puede suspender la cobertura. Lo usa Cobranza | Gracia por compañía × ramo, separada para la 1.ª cuota y las siguientes, en cascada plataforma → organización → productor | Ver pregunta abierta 1 |
| Matching | `chequearComprobante()` revisa un comprobante contra un cobro ya elegido | Cruce de cada fila de un listado contra la cartera, propuesta de cuota para un comprobante y decisión de qué se actualiza | — |
| Corridas, fuentes y pagos | `actividad_agentes` (bitácora de texto) | `validador_corridas`, `validador_fuentes` y `validador_pagos_detectados` | — |
| Comprobantes | Tabla `comprobantes` (cuota, canal, medio, monto, destino, operación, chequeos y estado) | Cuota propuesta con puntaje, moneda y datos extraídos | **No se crea `validador_comprobantes`**: en la fase 3 se extiende `comprobantes`, para no duplicar |
| Configuración | `configuracion_agentes` (jsonb por agente) | `validador_config` con programación, tolerancia de monto, interruptor de gracia y notificaciones, en cascada | — |
| Credenciales y plantillas | — | `credenciales_portal` y `conector_mapeos` (que también guarda las plantillas de importación) | Pasan a la fase 2, junto con el cifrado AES-GCM, que está pendiente en la base común. No se crea `plantillas_importacion` (pregunta 5) |

## 2. Fases

1. **Modelo de datos y reglas** (esta entrega):
   - Migración `0025_validador_v2.sql`.
   - Funciones puras con tests en `src/lib/validador/`: `gracia.ts`, `estados.ts`, `matching.ts` y `configuracion.ts`.
2. **Fuentes:**
   - Importación de listados con parser por compañía, plantillas y extracción con IA en `ia_trabajos`.
   - `credenciales_portal` cifradas.
   - `ejecutarEnCompania()` con los conectores simulados.
3. **Corrida y comprobantes:**
   - `/api/cron/validador` y "Ejecutar validación".
   - Aplicar los cambios, sincronizar `cuotas.estado` y escribir la bitácora.
   - Extender `comprobantes`.
   - Excepciones y resumen con IA.
4. **UI:** inicio, pestañas, vistas Cobranza, Calendario y Tabla, Configuración (4 pestañas) y "Enviar a Cobranza".
5. **Seed, script de evaluación, E2E, README y PR.**

## 3. Fase 1 en detalle

### Migración `0025_validador_v2.sql`
- **`cuotas`, columnas nuevas:**
  - Todas son opcionales salvo `moneda`, que es `'ARS'` por defecto.
  - `item`, `endoso`, `cupon` y `moneda`.
  - `estado_validacion`: `null` significa que todavía no se validó.
  - `fecha_pago`: el día que pagó el asegurado. `pagada_el` sigue siendo cuándo se registró.
  - `origen_confirmacion`: `listado`, `comprobante`, `portal` o `manual`.
  - `ultima_revision`, `cancelada_el` y `motivo_cancelacion`.
- **`validador_gracia`:** compañía, ramo (`*` vale para todos los ramos de la compañía), días de la 1.ª cuota, días de las siguientes y `habilitado`.
- **`validador_config`:** frecuencia, hora de ejecución, hora de enriquecimiento, zona horaria, tolerancia de monto, `gracia_habilitada` y notificaciones. Los campos son opcionales: `null` hereda del nivel de arriba, y los valores por defecto están en el código.
- **`validador_corridas`:** origen, estado, inicio, fin, compañías procesadas, cuotas actualizadas, errores y costo de IA.
- **`validador_fuentes`:** compañía, tipo de conector, período, formato, archivo, estado, filas extraídas y error.
- **`validador_pagos_detectados`:** fila normalizada, cuota, puntaje, estado (`confirmado`, `a_revisar` o `no_identificado`), candidatos y cambio decidido.
- Todas las tablas nuevas llevan `org_id` y `producer_id`, opcionales como en el resto del repo.
- Los estados nuevos son `text` tipado, como en `ia_trabajos`, y no enums de Postgres: así no hace falta un `ALTER TYPE` para sumar un valor.

### Reglas
- **`gracia.ts`:**
  - Resuelve la gracia de una cuota según compañía, ramo y alcance.
  - Pesa primero el alcance (productor > organización > plataforma) y después el ramo exacto sobre `*`, el mismo criterio que `ia_configuracion`.
  - Sin fila, con la fila deshabilitada o con el interruptor general apagado, la gracia es 0. No inventamos plazos.
  - La 1.ª cuota usa sus días y las demás, los de las siguientes.
- **`estados.ts`:**
  - Orden de prioridad: `pagada` > `cancelada` > `vencida` > `por_vencer` > `pendiente`. Una cuota pagada antes de la anulación sigue pagada.
  - `vencida` cuando pasaron más días que la gracia desde el vencimiento. Con 15 días de gracia, la cuota pasa a vencida el día 16.
  - `por_vencer` cuando vence dentro de la semana calendario (de lunes a domingo) o ya venció y sigue en gracia. `pendiente` cuando vence más adelante.
  - Bloques de la vista Cobranza: Esta semana = por vencer, Próximos = pendiente, Vencidos = vencida.
  - Totales con una línea por moneda, cantidad de pagos y de asegurados.
  - `cambioPorInforme()` decide qué hacer con lo que informa la compañía y nunca pisa un dato en conflicto: lo deja "a revisar".
- **`matching.ts`:**
  - **Fila de listado o de conector contra las cuotas:**
    - Candidatas: misma compañía y misma póliza o mismo cupón.
    - Puntaje sobre póliza, cuota, monto (con tolerancia), moneda y vencimiento.
    - Si los ítems no coinciden, la candidata se descarta.
    - Una única coincidencia completa queda `confirmado`; si no es única o es parcial, `a_revisar` con candidatos; sin candidatas, `no_identificado`.
    - Si el mismo listado trae dos filas para la misma cuota, la segunda queda a revisar.
    - Moneda distinta nunca coincide.
  - **Comprobante contra los cobros abiertos:** propone candidatos con puntaje y motivos según monto, referencia (póliza o cupón), pagador y compañía de destino. Nunca confirma solo.
- **`configuracion.ts`:** cascada de `validador_config` campo por campo, con valores por defecto: diaria, 07:00 y 08:00, America/Argentina/Buenos_Aires, tolerancia $ 1, gracia habilitada y notificaciones apagadas.

## 4. Preguntas abiertas y decisiones
1. **Dos "gracias". Decidido el 29/10/2026: Cobranza pasa a usar la gracia del Validador.**
   - En la fase 3, Cobranza calcula el "fin de gracia" con `resolverGracia()` y `diasDeGracia()` (1.ª cuota o siguientes, por ramo) en vez de `companias.dias_gracia`, que queda sin uso.
   - **Cuidado:** hoy Cobranza usa 30 días si la compañía no tiene dato; con la gracia nueva, sin fila la gracia es 0 y sus pasos se adelantan.
   - **Decidido el 29/10/2026:** la migración 0027 copia `companias.dias_gracia` (30) a `validador_gracia` como fila de plataforma con ramo `*`, también para las compañías de la cartera que no están en `companias`. Una compañía nueva arranca sin gracia hasta que se cargue en Configuración. Hecho en la fase 3.
2. **`por_vencer`. Decidido el 29/10/2026: semana calendario, de lunes a domingo.** Hecho en `calcularEstado()` con `finDeSemana()` de `src/lib/fechas.ts`. `montosPorPlazo()` del v1 sigue con 7 días corridos hasta que la fase de UI lo reemplace.
3. **Ramos. Decidido el 29/10/2026: una sola lista, la de la cartera** (`RAMOS_CARTERA` en `src/lib/ramos.ts`).
   - La grilla de gracia, los filtros y la importación usan los mismos ramos.
   - Los nombres que traen los listados (Automotor, Combinado familiar…) se llevan a esa lista con `ramoCanonico()`, que `gracia.ts` ya usa.
   - Lo que la lista no tiene (por ejemplo, Incendio o Salud) lo cubre la fila "Todos los ramos" (`*`) de la gracia.
   - Se corrigió la tabla de la sección 3 de la spec.
4. **Canceladas y los otros agentes. Decidido el 29/10/2026: Cobranza lee `estado_validacion`.**
   - En la fase 3, Cobranza deja de perseguir lo que el Validador marca `pagada` o `cancelada`, y su cron deja de pasar a `vencida` las cuotas con vencimiento anterior a hoy (`src/agentes/cobranza/index.ts`).
   - Propuesta: si `estado_validacion` está en `null` (la cuota todavía no se validó), Cobranza lo calcula con `calcularEstado()`.
   - `cuotas.estado` se sigue sincronizando para Inicio, el Resumen general y Estadísticas.
5. **Plantillas de importación. Decidido el 29/10/2026: una sola tabla, `conector_mapeos`.** No se crea `plantillas_importacion`. Propuesta de diseño para la migración 0026 de la fase 2, junto con `credenciales_portal`:
   - La plantilla del listado de cobranza de una compañía es una fila de `conector_mapeos` con la operación `importar_listado`. La clave es compañía × ramo (`*` para el listado) × operación, con versión, como en la spec de conectores.
   - Guarda el mapeo (columnas → campos de `PagoNormalizado`, fila de encabezado y formatos de fecha y monto) en jsonb, el origen (IA o manual) y si el productor lo confirmó.
   - Cotización y Siniestros usan la misma tabla con sus operaciones.
