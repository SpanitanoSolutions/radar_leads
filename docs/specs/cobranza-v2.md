# UNIQO — Spec: Agente de Cobranza (v1)

> Spec para implementar en el repo de UNIQO (Next.js + TypeScript + Postgres/Neon, desplegado en Vercel).
> Basado en un prototipo de referencia (video demo de un "Agente de Cobranza" para corredores de seguros), adaptado a UNIQO: Argentina, multi-tenant (agrupación → productor), cartera importada por CSV.
> **No copiar marca, textos ni nombre del producto de referencia.** Solo se toma la estructura funcional.

> Nota del repo: en UNIQO ya existía una Cobranza anterior (secuencia de 5 pasos con borradores para aprobar). Esta spec la reemplaza; por eso en el repo se llama **Cobranza v2**. Cómo se adaptó cada punto: [PLAN-cobranza-v2.md](../PLAN-cobranza-v2.md).

---

## 0. Contexto y objetivo

UNIQO ya tiene: menú lateral, cartera del productor (importación CSV, lista de asegurados con filtros) y sección de leads. El menú prevé una sección **Agentes** (cotización, validador de pagos, siniestros, cobranza, conciliador).

Este spec define el **primer agente funcional: Cobranza**. Su trabajo: detectar pólizas/recibos por vencer o vencidos en la cartera del productor, contactar al asegurado por los canales habilitados (WhatsApp, email, teléfono), registrar cada intento y respuesta, y escalar al productor cuando no puede resolver.

El patrón (dashboard de casos → detalle con historial → configuración → prompt/instrucciones → API) debe quedar **reutilizable** para los demás agentes.

---

## 1. Navegación

Sidebar (ya existente) → grupo **AGENTES**:

- Agente de Cotización *(placeholder)*
- Agente Validador de Pagos *(placeholder)*
- Agente Conciliador *(placeholder)*
- **Agente de Cobranza** ← este spec
- Extractor de Pólizas *(placeholder)*
- Agente de Siniestros *(placeholder)*

Los placeholders muestran un estado vacío "Próximamente". Ítem activo resaltado.

Rutas:

| Ruta | Pantalla |
|---|---|
| `/agentes/cobranza` | Dashboard de casos |
| `/agentes/cobranza/[caseId]` | Detalle del caso (tabs Detalle / Seguimiento) |
| `/agentes/cobranza/configuracion` | Configuración (tabs General / Canales) |
| `/agentes/cobranza/instrucciones` | Vista del agente: Instrucciones, Herramientas, Triggers, Ejecuciones, Detalles |
| `/agentes/cobranza/ejecuciones` | Historial de corridas |
| `/agentes/cobranza/api` | Referencia de API |

---

## 2. Pantalla: Dashboard de casos (`/agentes/cobranza`)

**Header:** título "Agente de Cobranza" + botones a la derecha: `Ver ejecuciones`, `API docs`, `Configuración`, `Ejecutar ahora` (primario, oscuro).

**Fila de KPIs (5 tarjetas):** número grande + monto debajo en monoespaciada.

| KPI | Definición |
|---|---|
| ACTIVOS | Casos en gestión (no pagados, no excluidos). Monto total adeudado. |
| HOY | Casos contactados o a contactar hoy. |
| PROMESAS | Casos con promesa de pago registrada. Monto prometido. |
| ESCALADOS | Casos derivados al productor (sin contacto tras máx. intentos, rechazo, error). |
| PAGADOS (MES) | Casos marcados pagados en el mes. Monto cobrado. |

**Tabs con contador (badge):**
- `Activos` — casos en gestión
- `Sin datos de contacto` — pólizas vencidas/por vencer sin teléfono ni email (accionable: completar datos)
- `Excluidas por reglas` — filtradas por la configuración (ramo, aseguradora, monto, etc.)

**Filtros:** buscador (asegurado / nº póliza / nº recibo), `Todos los estatus` (dropdown), `Todas las aseguradoras` (dropdown).

**Tabla:**

| Columna | Contenido |
|---|---|
| PÓLIZA | Nombre del asegurado (negrita) + línea secundaria monoespaciada: `ASEGURADORA · nº póliza · nº recibo` |
| ESTATUS | Punto de color + label en mayúsculas pequeñas: `SIN CONTACTO` (rojo), `ESCALADO` (violeta/azul), `PENDIENTE` (gris), `PROMESA` (ámbar), `PAGADO` (verde), `RECHAZADO` (rojo oscuro) |
| MONTO | Monto del recibo, formato ARS (`$ 14.974,43`) |
| INTENTOS | "N intentos" + "Últ. contacto hoy / hace 10d" |
| VENCIMIENTO | Relativo: "hace 27d" / "en 15d" |

Click en la fila → detalle del caso. Paginación.

---

## 3. Pantalla: Detalle del caso (`/agentes/cobranza/[caseId]`)

**Breadcrumb:** Agente de Cobranza › NOMBRE ASEGURADO. Botón `← Atrás`.

**Header:** nombre del asegurado; debajo: aseguradora · nº póliza · chip rojo "Vencido hace 11 días" (o "Vence en N días").

**Tabs:** `Detalle` | `Seguimiento`

**Tab Detalle** — tarjeta del recibo:
- Aseguradora (arriba izq.) + chip de estado (`VENCIDO` / `POR VENCER`)
- Nombre asegurado, Nº de póliza
- Grilla: Nº de recibo · Endoso/serie · Vencimiento · Vigencia (desde → hasta) · Forma de pago · Ramo
- Monto grande abajo a la derecha + moneda (ARS/USD)

**Tab Seguimiento** — timeline (más reciente arriba), cada fila:
- Fecha/hora
- Chip de tipo de evento: `LLAMADA A BUZÓN`, `SIN RESPUESTA`, `WHATSAPP ENVIADO`, `WHATSAPP RESPONDIDO`, `EMAIL ENVIADO`, `EMAIL RESPONDIDO`, `PROMESA DE PAGO`, `ESCALADO / NOTIFICADO`, `CORREO FALLIDO`, `ERROR`, `MODO PRUEBA`
- Descripción corta generada por el agente (ej.: "Sin respuesta. Cuarto intento total. Póliza vencida hace 11 días, $14.974,43.")

**Panel derecho:**
- Tarjeta **Estatus** (punto + label)
- Tarjeta **Contacto** (teléfono, email, WhatsApp; editable)
- Botón primario `Marcar como pagado`
- Botón secundario `Reactivar recibo` (vuelve un caso escalado/excluido a activo)

---

## 4. Pantalla: Configuración (`/agentes/cobranza/configuracion`)

Breadcrumb Agente de Cobranza › Configuración. Tabs: **General** | **Canales**. Sub-navegación vertical a la izquierda dentro de General.

### 4.1 General

**Estrategia**
- `Reglas generales de cobranza` (textarea libre, se inyecta al prompt). Placeholder: "Ej.: Firmar mensajes con el nombre del productor. Con clientes empresa usar tono formal. Si el cliente tiene varias pólizas vencidas, mencionarlas juntas."
- `Tiers de seguimiento` — lista editable; cada tier tiene nombre, rango de días y un prompt opcional (estado "Sin prompt configurado" si vacío). Defaults:

| id | Label | Regla (daysUntilDue) |
|---|---|---|
| `pending_far` | Por vencer en más de 15 días | > 15 |
| `pending_soon` | Por vencer entre 0 y 15 días | 0..15 |
| `overdue_recent` | Vencido entre 1 y 14 días | -1..-14 |
| `overdue_urgent` | Vencido entre 15 y 24 días | -15..-24 |
| `overdue_critical` | Vencido más de 24 días | < -24 |

  Botón `+ Agregar tier`. Click en un tier → drawer/modal para editar su prompt.
- `Reglas de re-contacto`: `Máximo de intentos por recibo` (número, default 5) · `Días de gracia tras promesa de pago` (default 3).

**Filtros** — qué entra al agente: aseguradoras incluidas, ramos incluidos (autos, flotas, hogar, vida, ART, comercio…), monto mínimo, excluir asegurados marcados manualmente. Lo filtrado cae en la tab "Excluidas por reglas".

**Horario**
- Hora de ejecución diaria (HH:MM) + zona horaria (default `America/Argentina/Buenos_Aires`)
- Días permitidos (toggle chips Lun–Dom; default Lun–Vie)
- Ventana de contacto (hora desde – hasta; default 09–18)

**Información** (datos del productor que firma)
- Nombre, Email, Teléfono del productor/ejecutivo (destino de escalaciones)
- Idioma/variante (default "Español (Argentina)", usar voseo)

**Notificaciones** — a quién y cuándo avisar: al escalar, al recibir promesa, resumen diario por email/WhatsApp.

**Pruebas**
- Toggle `Modo prueba`: todo contacto se redirige a datos de prueba, nunca al cliente real.
- Teléfono de prueba, Email de prueba, WhatsApp de prueba
- Máx. recibos por corrida (ej. 3)
- Filtro de recibos (Cualquiera / por tier / por aseguradora)

**Demo** — botón para cargar datos de ejemplo (seed) en el tenant actual.

### 4.2 Canales

Lista izquierda "CANALES HABILITADOS" con estado (ACTIVO / INACTIVO): **WhatsApp**, **Email**, **Teléfono**. Por canal:
- Checkbox `Habilitado`
- `Instrucciones` (textarea: guía de cómo el agente maneja ese canal; ej. "Estimado/a {nombre}, te recordamos que tu póliza vence en 15 días…")
- Remitente: número de salida (WhatsApp/teléfono) o email remitente, con botón `Verificar`
- Bloque `Test`: nombre + destino + botón `Probar`
- Link `Ver agente →` (va a la vista de instrucciones)

> Prioridad Argentina: **WhatsApp primero**, luego email; llamadas de voz con IA en fase posterior.

---

## 5. Pantalla: Instrucciones del agente (`/agentes/cobranza/instrucciones`)

Header: breadcrumb Agentes › Agente de Cobranza, chip `ready`, menú `…`, botones `Run Test` y `▶ Run`.
Título grande + subtítulo: "Da seguimiento a pagos por vencer y vencidos contactando directamente al asegurado."

Tabs: `Instrucciones` · `Herramientas (N)` · `Triggers (N)` · `Ejecuciones` · `Detalles` · `Settings`

**Instrucciones** = prompt de sistema compuesto (solo lectura en v1, generado a partir de la configuración). Estructura:

```md
Sos el agente de seguimiento de cobranza de {nombreProductor} ({agrupacion}).
Tu trabajo es dar seguimiento a los pagos de seguros pendientes o vencidos de los asegurados, usando los canales habilitados.

## Identidad
- Te presentás como "asistente de {nombreProductor}".
- Sos profesional, cordial y nunca amenazante.
- Hablás en español rioplatense (voseo).
- Si te preguntan si sos una IA, respondé con honestidad.

## Canales disponibles
{por cada canal habilitado: nombre + instrucciones del canal}

## Herramientas disponibles
- collection_get_overdue_policies
- send_whatsapp / send_email / make_call
- collection_update_policy_response
- escalate_to_producer
- mark_done

## Flujo de trabajo
1. Obtené las pólizas con collection_get_overdue_policies.
2. Para cada una, identificá su currentTier y aplicá el bloque correspondiente.
3. Contactá por el canal preferido del asegurado respetando horario y máximo de intentos.
4. Registrá cada intento.
5. Si se alcanza el máximo de intentos sin contacto → escalate_to_producer.

### Respuesta entrante (cuando el asegurado responde)
1. Leé el mensaje.
2. Identificá a qué recibo/póliza corresponde (tracking ID en el hilo o contexto).
3. Actualizá con collection_update_policy_response:
   - Confirma que pagará → responseType "promised_payment" o "scheduled_date" con la fecha
   - Dice que ya pagó → "already_paid" (lo valida el Agente Validador de Pagos más adelante)
   - Tiene dudas / pide info → "responded" + notas
   - Se niega → "refused" (escalar)
4. Si hace falta, respondé por el mismo canal.
5. Llamá a mark_done al terminar.

## Reglas generales del productor
{reglasGenerales}

## Estrategia por tier
La herramienta collection_get_overdue_policies devuelve currentTier {id, label} calculado desde daysUntilDue (negativo = vencido).
### {tier.label}
Cuando una póliza tenga currentTier.id="{tier.id}":
{tier.prompt || "(Sin instrucciones específicas — seguí las reglas generales y usá criterio profesional.)"}
```

**Herramientas:** lista de tools con descripción y schema JSON. **Triggers:** cron diario (desde Horario) + webhook de mensaje entrante. **Ejecuciones:** tabla de corridas (inicio, duración, recibos procesados, contactos, errores, modo prueba sí/no) con detalle.

---

## 6. API (`/agentes/cobranza/api` + endpoints reales)

Página de referencia estilo docs: navegación izquierda (Getting started, Authentication, Errors, Pagination, Activity log; Settings; Runs; Policies; Universe; Phone numbers; Email routing; Schemas), contenido centro, panel derecho oscuro con ejemplos cURL/JS. Botón "Generar API key" y "Imprimir / Guardar PDF".

Endpoints (Route Handlers en `app/api/agents/collections/...`), autenticados por API key del tenant (header `Authorization: Bearer`):

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/agents/collections/settings` | Config del agente del tenant (null si no está provisionado) |
| PUT | `/api/agents/collections/settings` | Actualizar config |
| POST | `/api/agents/collections/runs` | Disparar una corrida (`{ testMode?: boolean, limit?: number }`) |
| GET | `/api/agents/collections/runs/:id` | Detalle de corrida |
| POST | `/api/agents/collections/cron` | Trigger interno (Vercel Cron, protegido con `CRON_SECRET`) |
| GET | `/api/agents/collections/policies` | Listar casos (filtros: status, insurer, tab, q, page) |
| GET | `/api/agents/collections/policies/:id` | Detalle + activity log |
| POST | `/api/agents/collections/policies/:id/mark-paid` | Marcar pagado |
| POST | `/api/agents/collections/policies/:id/reactivate` | Reactivar |
| GET | `/api/agents/collections/universe` | Universo de recibos evaluados (incl. excluidos y sin contacto) |
| POST | `/api/agents/collections/inbound/whatsapp` | Webhook de mensajes entrantes |
| POST | `/api/agents/collections/inbound/email` | Webhook de emails entrantes |

Errores: JSON `{ error: { code, message } }` con 400 / 401 / 403 / 404 / 409 (corrida ya en curso) / 500.

**Activity log:** todo intento (llamada, email, WhatsApp, error) se agrega a `collection_activity_log`; es la fuente para el timeline, dashboards y auditoría.

---

## 7. Modelo de datos (Postgres)

Todas las tablas con `tenant_id` (agrupación) y `producer_id` (productor) para el multi-tenant ya decidido. Reutilizar las tablas existentes de cartera (asegurados/pólizas) si ya existen; si no, crear las mínimas.

```sql
collection_agent_settings (
  id, tenant_id, producer_id,
  general_rules text,
  max_attempts int default 5,
  grace_days_after_promise int default 3,
  run_time time default '10:00', timezone text default 'America/Argentina/Buenos_Aires',
  allowed_days int[] default '{1,2,3,4,5}',
  contact_window_start time default '09:00', contact_window_end time default '18:00',
  signer_name, signer_email, signer_phone, language text default 'es-AR',
  filters jsonb,            -- aseguradoras, ramos, monto mínimo
  notifications jsonb,
  test_mode bool default true, test_phone, test_email, test_whatsapp, test_max_receipts int default 3,
  created_at, updated_at
)

collection_tiers (id, settings_id, key, label, min_days int null, max_days int null, prompt text null, sort int)

collection_channels (id, settings_id, channel enum('whatsapp','email','phone'), enabled bool,
  instructions text, sender text, verified bool)

collection_cases (
  id, tenant_id, producer_id, policy_id, receipt_number, endorsement,
  insurer, line_of_business, amount numeric, currency text default 'ARS',
  due_date date, coverage_from date, coverage_to date, payment_method text,
  status enum('pending','no_contact','promised','escalated','paid','refused','excluded','missing_contact'),
  exclusion_reason text null,
  attempts int default 0, last_contact_at timestamptz null,
  promised_date date null, created_at, updated_at
)

collection_activity_log (
  id, case_id, run_id null, type text, channel text null,
  summary text, payload jsonb, is_test bool, created_at
)

collection_runs (id, tenant_id, producer_id, trigger enum('cron','manual','api','test'),
  started_at, finished_at, processed int, contacted int, errors int, test_mode bool, status)
```

`daysUntilDue` y `currentTier` se calculan en query/servicio, no se persisten.

---

## 8. Motor del agente

- Servicio `lib/agents/collections/` con: `buildPrompt(settings)`, `getOverduePolicies(tenant, producer)`, tools, `runCollections({ testMode, limit })`.
- LLM vía Anthropic API con tool use (key en env `ANTHROPIC_API_KEY`). El modelo decide el mensaje; las reglas duras (horario, días, máx. intentos, modo prueba, gracia de promesa) se aplican **en código antes de ejecutar cualquier tool**, no solo en el prompt.
- Canales v1: **email** (Resend o similar) y **WhatsApp** (WhatsApp Business Cloud API o Twilio) detrás de una interfaz `ChannelProvider` con implementación `mock` por defecto. Teléfono/voz: interfaz creada, implementación mock.
- Modo prueba: todo envío se redirige a los destinos de prueba y se loguea con `is_test=true`.
- Vercel Cron llama a `/api/agents/collections/cron` cada hora; el handler ejecuta solo los tenants cuya `run_time`/días coinciden.
- Idempotencia: lock por `tenant+producer` para no correr dos veces en paralelo (409).

---

## 9. Estilo visual

Seguir el diseño actual de UNIQO. Referencia del prototipo: fondo claro, sidebar blanco con grupos en mayúsculas pequeñas, tarjetas con borde fino y mucho aire, números KPI grandes, datos secundarios (nros. de póliza, montos chicos, labels de estado) en **fuente monoespaciada pequeña en mayúsculas**, un único color de acento, botón primario negro/oscuro. Chips de estado con punto de color. Timeline con chips de colores suaves.

---

## 10. Datos de ejemplo (seed)

Generar ~100 casos ficticios con aseguradoras argentinas (ej. Sancor, La Segunda, Federación Patronal, Rivadavia, Mercantil Andina, Allianz, Zurich), ramos variados (autos, flotas, hogar, comercio, ART, vida), montos ARS, vencimientos entre -40 y +30 días, ~10% sin datos de contacto, algunos excluidos por reglas, y activity log de ejemplo con todos los tipos de evento. **Nombres y datos ficticios**, nunca datos reales de clientes.

---

## 11. Cumplimiento (revisar antes de producción)

- Arrancar siempre con **modo prueba activado** por defecto.
- Respetar Registro Nacional "No Llame" (Ley 26.951) para llamadas, y Ley 25.326 de datos personales.
- Trato digno en cobranza extrajudicial (Ley 24.240, art. 8 bis): nada de amenazas, horarios razonables, no contactar a terceros.
- WhatsApp Business exige plantillas aprobadas para mensajes iniciados por la empresa.
- Opción de baja ("no quiero recibir más mensajes") → marcar caso y no volver a contactar.

---

## 12. Orden de implementación sugerido

1. Migraciones + seed + tipos.
2. Dashboard de casos (KPIs, tabs, filtros, tabla) leyendo de la DB.
3. Detalle del caso (Detalle + Seguimiento + acciones Marcar pagado / Reactivar).
4. Configuración General (Estrategia, Filtros, Horario, Información, Notificaciones, Pruebas, Demo) + Canales.
5. Vista de Instrucciones (prompt compuesto desde la config) + Herramientas + Ejecuciones.
6. Motor del agente con providers mock + "Ejecutar ahora" / "Run Test".
7. Endpoints de API + API keys + página de referencia.
8. Providers reales (email → WhatsApp) + Vercel Cron.
9. Generalizar layout/patrón para los otros agentes (Siniestros, Validador de Pagos, Cotización).

**Criterio de aceptación v1:** con datos seed y modo prueba, "Ejecutar ahora" procesa N recibos, genera mensajes con el LLM, los "envía" vía mock a destinos de prueba, actualiza intentos/estatus/KPIs y se ve cada evento en el timeline del caso.
