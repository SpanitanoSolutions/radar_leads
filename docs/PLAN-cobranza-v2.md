# Plan de implementación: Cobranza v2

Spec: [cobranza-v2.md](specs/cobranza-v2.md). Rama: `feat/cobranza-v2`, que sale de `main` (PR #38). Progreso: [progreso/cobranza-v2.md](progreso/cobranza-v2.md).

La spec se escribió como si Cobranza no existiera. En UNIQO ya había una Cobranza (la "v1"): una secuencia fija de 5 pasos que deja borradores para aprobar, conectada con el Validador. La v2 la reemplaza sin perder nada de lo que hace hoy.

## 1. Ya existe / falta / cambia

| Área | Ya existe (v1) | Falta | Cambia |
|---|---|---|---|
| Cartera | `asegurados`, `polizas`, `cuotas` (con ítem, endoso, cupón y moneda desde el Validador v2). Un "cobro" son las cuotas del mismo asegurado, compañía y vencimiento; su cabeza es la cuota de menor id (`agruparCobros`) | — | Nada: un caso es un cobro y apunta a su cabeza. No se copian monto, compañía ni vencimiento al caso |
| Seguimiento | `seguimientos_cobranza` (paso, activo/pausado/terminado, promesa, última novedad) | Estados de la spec, intentos, último contacto, motivo de exclusión, fecha de pago | Tabla nueva `cobranza_casos`. La migración copia cada seguimiento con su estado traducido. `seguimientos_cobranza` queda (no se borra) y deja de usarse |
| Historial | Mensajes enviados en `mensajes`; bitácora de texto en `actividad_agentes` | Línea de tiempo por caso | `cobranza_eventos`. La migración trae los mensajes ya enviados de cada cobro |
| Configuración | `configuracion_agentes.config` (pasos y 4 reglas) | Todo lo de la sección 4 de la spec | `cobranza_config` (una fila por alcance, `null` hereda el valor por defecto del código, como `validador_config`). Tramos y canales en jsonb. La v1 queda guardada |
| Motor | `generarBorradores()`: plantillas fijas, cron diario | Agente con IA y herramientas, reglas duras en código, corridas, modo prueba | `src/agentes/cobranza/` se reescribe. Sin IA, el mismo motor redacta con plantillas por tramo |
| IA | `ejecutarIA()`: solo salida estructurada, con tope y registro en `ia_uso` | Conversación con herramientas | `ejecutarAgenteIA()` en la misma capa: mismo interruptor, mismo tope de USD 20 y cada turno en `ia_uso` |
| Envíos | `enviarMensaje()` por Gmail o WhatsApp reales, nunca para datos de ejemplo | Simulado (mock), destinos de prueba | Interfaz de canal con real y simulado. En modo real sin conexión no se finge el envío: queda un error |
| Aprobación | Pestaña "Para aprobar": borradores del Validador y de la secuencia, llamadas | — | Se conserva como pestaña del tablero (ver decisión 3) |
| Validador | Pide a Cobranza: diferencia, otro comprobante, recordatorio, recibo, "Enviar a Cobranza". Al confirmar un pago corta la secuencia | — | Los borradores siguen igual. Cortar y pausar pasan a cambiar el estado del caso y dejan un evento |
| API | No hay API con clave | API con clave, docs | Rutas `/api/v1/agentes/cobranza/...`, fuera de la sesión del proxy |
| Cron | `/api/cron/cobranza` diario 09:00 | Hora y días configurables | El mismo endpoint, a las 10:00 (hora por defecto de la spec), con la regla de "toca correr" del Validador |

## 2. Nombres: spec → repo

El repo está en castellano (tablas, rutas, código). Se respetó eso.

| Spec | Repo |
|---|---|
| `collection_agent_settings` + `collection_tiers` + `collection_channels` | `cobranza_config` (tramos y canales en jsonb) |
| `collection_cases` | `cobranza_casos` |
| `collection_activity_log` | `cobranza_eventos` |
| `collection_runs` | `cobranza_corridas` |
| `tenant_id` / `producer_id` | `org_id` / `producer_id` (como en el resto) |
| tiers `pending_far`… | tramos `por_vencer_lejos`, `por_vencer`, `vencido_reciente`, `vencido_urgente`, `vencido_critico` |
| status `pending`, `no_contact`, `promised`, `escalated`, `paid`, `refused`, `excluded`, `missing_contact` | `pendiente`, `sin_respuesta` (se muestra SIN CONTACTO), `promesa`, `escalado`, `pagado`, `rechazado`, `excluido`, `sin_datos`, más `respondio` e `informo_pago` (decisión 6) |
| tools `collection_get_overdue_policies`, `send_whatsapp`, `send_email`, `make_call`, `collection_update_policy_response`, `escalate_to_producer`, `mark_done` | `cobranza_obtener_polizas`, `enviar_whatsapp`, `enviar_email`, `llamar`, `cobranza_registrar_respuesta`, `escalar_al_productor`, `terminar` |
| responseType `promised_payment`, `scheduled_date`, `already_paid`, `responded`, `refused` | `promesa_pago`, `fecha_programada`, `ya_pago`, `respondio`, `rechazo`, más `baja` (spec 11) |
| `/api/agents/collections/settings`, `runs`, `policies`, `universe`, `inbound/*` | `/api/v1/agentes/cobranza/configuracion`, `corridas`, `casos`, `universo`, `entrantes/*` |
| `POST …/cron` | `GET /api/cron/cobranza` (Vercel Cron llama con GET y `CRON_SECRET`) |
| `{ error: { code, message } }` | `{ error: { codigo, mensaje } }` |
| `lib/agents/collections/` | `src/agentes/cobranza/` (con base de datos) y `src/lib/cobranza/` (reglas puras, con tests) |

## 3. Decisiones de la adaptación (tomadas en la implementación; revisables)

1. **Un caso por cobro**, con la cabeza del cobro como clave. Así la cobranza de una flota (varias cuotas que vencen juntas) es un solo caso, como en la v1 y el Validador.
2. **Modo prueba prendido por defecto** (spec 11). Apagarlo es la acción explícita del productor que habilita escribirle a sus asegurados, como lo era marcar un paso como automático en la v1.
3. **"Pedir aprobación antes de enviar"**, prendido por defecto. Con el modo prueba apagado, cada mensaje del agente queda en "Para aprobar" hasta que el productor lo aprueba; si lo apaga, el agente envía solo. Respeta la decisión del 27/10/2026 ("ningún mensaje sale sin una acción explícita del productor") y conserva la pestaña de la v1, donde también llegan los pedidos del Validador.
4. **Reglas duras en código**, antes de cada herramienta: estado del caso, máximo de intentos, días entre intentos, primer contacto desde N días antes del vencimiento, gracia de la promesa, días y ventana horaria (solo en modo real), canal habilitado, destino, baja, y un solo contacto por caso y corrida. La spec no fija el espacio entre intentos: se agregan "Días entre intentos" (3) y "Primer contacto" (5 días antes del vencimiento); sin eso, 5 intentos se gastan en 5 días.
5. **Escalar por máximo de intentos lo hace el código**, no la IA: al llegar al máximo sin respuesta, el caso se escala y se avisa al productor.
6. **Dos estados más:** `respondio` (preguntó algo) e `informo_pago` (dice que ya pagó; lo confirma el Validador). Los dos frenan al agente y piden la mirada del productor.
7. **Sin IA funciona igual**: sin clave, apagada o sin cuota, el mismo motor escribe con plantillas por tramo y pasa por las mismas reglas.
8. **Un llamado por asegurado** en cada corrida, con todos sus casos a contactar: la IA puede mencionarlos juntos (ejemplo de la spec) y se gasta menos. Haiku 5.5, con el prompt de sistema y las herramientas en caché.
9. **Teléfono:** en modo prueba, la llamada es simulada ("sin respuesta"). En modo real no hay proveedor de voz: queda una tarea "Te toca llamar" en "Para aprobar", como el paso 4 de la v1. El canal arranca apagado.
10. **Canal simulado solo en modo prueba.** Con el modo prueba, si la conexión real está y hay destino de prueba, sale de verdad a ese destino; si no, se simula. En modo real, sin conexión el envío falla y queda el error.
11. **Cron diario**: el plan de Vercel solo permite crons diarios (README, Validador). Corre a las 10:00 y respeta la hora y los días de la Configuración; la pantalla muestra la próxima ejecución real.
12. **API con clave propia** (`api_claves`, se guarda solo el hash). Va en `/api/v1/...`, la única parte de `/api` que el proxy deja pasar sin sesión, y cada ruta exige la clave.
13. **Entrantes:** el webhook recibe un formato propio (`de`, `texto`, `asunto`) con la clave de la API. El formato de Meta (WhatsApp Cloud) llega con la conexión de WhatsApp, que va de a una (decisión del 30/10/2026). En modo prueba, el detalle del caso permite simular una respuesta.
14. **Validador:** sus borradores (diferencia, otro comprobante, recordatorio, recibo, "Enviar a Cobranza") quedan igual, con las plantillas de la v1. Confirmar un pago pasa el caso a pagado; pedir la diferencia u otro comprobante lo escala con el motivo.
15. **Extractor de pólizas** entra al menú como "Próximamente". Los demás agentes ya existen y quedan como están (no son placeholders).
16. **Sin datos de ejemplo nuevos en la cartera base**: la demo de 100 casos es un botón aparte (Configuración → Demo) y `npm run db:seed:cobranza`, todo marcado como ejemplo; "Borrar datos de ejemplo" la limpia.

## 4. Fases

Una rama, un commit por fase.

1. **Plan** (este documento) y la spec en `docs/specs/`.
2. **Modelo de datos y reglas:** migración `0031_cobranza_v2.sql` (tablas, copia de la v1), `src/lib/cobranza/` con tests (configuración, tramos, reglas, estados y KPIs).
3. **Casos:** sincronización con la cartera, marcar pagado, reactivar, no contactar, eventos; el Validador y la aprobación de mensajes sobre los casos; seed base.
4. **Tablero y detalle** (`/agentes/cobranza`, `/agentes/cobranza/[id]`).
5. **Configuración** (General con sus 7 secciones y Canales) y la demo.
6. **Motor:** conversación con herramientas en la capa de IA, prompt, herramientas, ejecutor con reglas, plantillas sin IA, corridas con lock, "Ejecutar ahora", Instrucciones y Ejecuciones.
7. **Entrantes y avisos al productor.**
8. **API:** claves, rutas `/api/v1/agentes/cobranza/...`, página de referencia.
9. **Cron, menú, Inicio, E2E, README** y verificación completa (tests, lint, build, Postgres descartable, recorrido con la app compilada).

## 5. Criterio de aceptación

El de la spec: con la demo y el modo prueba, "Ejecutar ahora" procesa N recibos, la IA redacta los mensajes, salen por el canal simulado a los destinos de prueba, cambian intentos, estados y KPIs, y cada evento se ve en la línea de tiempo del caso. Se prueba con la app compilada y una API de Anthropic falsa local (sin gastar), como en Cotización.
