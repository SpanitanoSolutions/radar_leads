# Progreso — Agente de Cotización v2

Spec: [cotizacion-v2.md](../specs/cotizacion-v2.md). Manda en todo lo de compañías: [conectores.md](../specs/conectores.md). Plan anterior: [PLAN-cotizacion-v2.md](../PLAN-cotizacion-v2.md).
Rama: `feat/cotizacion-v2-auditoria`, que sale de `main` (`33d9a3d`, después del PR #33).

## Estado
**Auditoría y plan hechos (29/10/2026).** No se implementa nada hasta el OK de Julian. Esta sesión no cambió código: solo este archivo.
- `npm test`: pasan 474 de 479. Los 5 que fallan (`catalogo.test.ts`, `menu.test.ts` y `siniestros.test.ts`) son los de antes.
- `npm run lint`: sin errores (las 3 advertencias viejas).
- `npm run build`: OK.
- `npm run test:e2e`: **pasa entero** (23 pasos, con los 8 y 11 de Cotización) contra Postgres 18.6 recién sembrado y la app compilada con `CONECTORES_SIMULADOS=1`, sin IA ni canales.

| Parte de la sesión | Estado |
|---|---|
| 1. Leer specs, plan y código | Hecha |
| 2. Auditoría por fase (1 a 6) | Hecha (por lectura) |
| 3. Criterios de aceptación (sección 4) | Hecha |
| 4. Qué no sigue la base común | Hecha |
| 5. Prueba contra Postgres 18.6 con la app compilada | Hecha (criterios 1, 2, 4, 5, 8 y 10) |
| 6. Plan en fases y decisión de IA | Hecho, espera el OK |

## Lo que hay hoy (de antes de la base común)
La implementación es del 28/10/2026 (commit `1f0957c` "coti v2" y `d8d2e9d` "coti pagina"), antes de que existieran `ejecutarIA()`, los conectores y `credenciales_portal`. Migraciones `0014` a `0017`.

- **Datos:** `solicitudes_cotizacion` (extendida: `datos_riesgo`, `ejecutivo`, `completado_el`, `org_id`, `producer_id`), `cotizacion_aseguradoras`, `cotizacion_paquetes`, `cotizacion_tipos_seguro`, `cotizacion_config`, `cotizacion_envios`, `cotizacion_resultados`, `cotizacion_archivos`, `cotizacion_propuestas`, `cotizacion_eventos`, `cotizacion_borradores_ia` y `org_features`.
- **Lógica:** `src/agentes/cotizacion/solicitudes.ts` (crear la solicitud con un borrador por compañía y registrar una respuesta), `src/lib/cotizacion.ts` (filtros, mejor precio, CUIT/CUIL, parser de la estrategia, días hábiles, campos del riesgo y validación pedido contra cotizado), `src/lib/cotizacion/` (métricas, feriados y próximo seguimiento, PDF de la propuesta, cifrado propio de credenciales).
- **IA:** `src/lib/ia/cotizacion.ts`, con `generar()` de `ProveedorClaude` y su propio interruptor (`org_features.cotizacion_ia`).
- **Salida:** `src/conexiones/cotizacion.ts`, un adaptador que "envía" el correo aprobado y devuelve una referencia simulada.
- **Pantallas:** `/agentes/cotizacion` (Solicitudes, Historial y Desempeño), `/agentes/cotizacion/nueva`, `/agentes/cotizacion/[id]` (Contactos, Cotizaciones, Validación y Agente), `/agentes/cotizacion/configuracion` y las exportaciones.
- **Cron:** `/api/cron/cotizacion` (seguimientos como borradores). Webhook `/api/agentes/cotizacion/resultado` (de la v1).

## Hallazgos de la lectura (29/10/2026)
- La migración `0014` siembra dos tandas de aseguradoras: quedan 8 filas para 7 compañías, con Rivadavia dos veces ("Seguros Rivadavia" y "Rivadavia"). Las de la primera tanda tienen 11 ramos y las que solo están en la segunda (Rivadavia y Mapfre), 7.
- `cotizacion_envios.canal` es `correo | portal | ambos`: no existe `api` ni un orden de canales, ni los intentos por canal, el número de cotización de la compañía o el último error.
- El simulador de respuestas no anda con la app compilada: exige `NODE_ENV !== "production"`, y `next start` corre en producción.
- La extracción con IA de un PDF registra el resultado sin confirmar, pero igual marca el envío como `cotizado`, lo suma a la comparativa de la lista y escribe "El productor cargó y confirmó el precio".
- En `aprobarEnvioCotizacion` el `redirect` de "borrador no disponible" está dentro del `try`, así que se convierte en "No pudimos aprobar el borrador".

## Auditoría por fase (sección 3 de la spec)
Evidencia por lectura del código; lo que se comprobó contra Postgres está en "Prueba contra Postgres 18.6".

| Fase | Estado | En una línea |
|---|---|---|
| 1. Modelo de datos | Parcial | Están las tablas, pero sin canal `api`, orden de canales, intentos ni último error, y la configuración no resuelve la cascada |
| 2. Configuración | Parcial | Una sola página con aseguradoras, voz, seguimientos, IA, paquetes y credenciales. Falta Conexiones de verdad, Tipos de seguro y "Sugerir con IA" |
| 3. Nueva solicitud | Casi hecha | Crea envíos y borradores para aprobar. Falta el aviso "sin paquete" y que "Cotizar automáticamente" cotice |
| 4. Detalle | Parcial | Las 4 pestañas existen. Falta responder una pregunta y reintentar, la línea de tiempo, el borrador al ejecutivo y parte del comparativo |
| 5. Inicio, bitácora y desempeño | Casi hecha | Tarjetas, filtros, exportar y métricas con tests. La bitácora es la genérica, sin filtros |
| 6. Orquestador, seguimientos y respuestas | Falta lo central | Hay cron de seguimientos y simulador. No hay orquestador, ni conectores, ni `ia_trabajos` |

### Fase 1 — Modelo de datos: parcial
- **Hecho** (`drizzle/0014` a `0017`, `src/db/schema.ts`):
  - `solicitudes_cotizacion` se extendió y no se duplicó: conserva `cotizaciones` (JSON) y los estados viejos (`atencion`, `esperando`, `lista`, `enviada`, `ganada`, `perdida`);
  - las tablas de la spec existen, con `org_id` y `producer_id` en `NULL`;
  - estados del envío: `pendiente`, `borrador`, `enviado`, `en_seguimiento`, `requiere_atencion`, `cotizado`, `rechazado` y `error`.
- **Falta o cambia:**
  - **Canales:** `canal_cotizacion` es `correo | portal | ambos`. La spec pide `api | portal | correo` con prioridad y referencia al conector. El envío no guarda el canal usado de verdad, los intentos por canal, el número de cotización de la compañía (hay `folio`) ni el último error.
  - **Cascada de la configuración:** `cotizacion_config` tiene `org_id` y `producer_id`, pero el código lee `.limit(1)`. El índice único sobre (`org_id`, `producer_id`) no tiene `NULLS NOT DISTINCT`, así que admite varias filas en `NULL`.
  - **Seed de la migración:** Rivadavia queda dos veces ("Seguros Rivadavia" y "Rivadavia"), las dos activas: una solicitud nueva le pide cotización dos veces a la misma compañía.
  - **Dos fuentes de verdad:** la lista y las tarjetas leen `solicitudes_cotizacion.cotizaciones` (JSON viejo); el detalle, `cotizacion_resultados`. `registrarResultadoCotizacion()` escribe las dos.
  - `aseguradoras` y `paquetes` no tienen `es_ejemplo`.
- **Tests:** ninguno del modelo.

### Fase 2 — Configuración: parcial
- **Hecho** (`/agentes/cotizacion/configuracion`, una sola página):
  - Aseguradoras: tabla, exportar CSV y Excel, importar y agregar o editar (por nombre);
  - voz y comportamiento: persona, nombre, personalidad, intervalo, estrategia (validada por el parser), máximo de 1 a 6, asunto, cuerpo, instrucciones, cuenta saliente, "Cotizar automáticamente" y agente activo;
  - interruptor de IA propio (`org_features.cotizacion_ia`);
  - alta de paquetes;
  - credenciales por compañía cifradas con AES-GCM.
- **Falta o cambia:**
  - **Conexiones:** no hay tipo de conexión (API, portal o correo), orden de canales, "Probar conexión" ni salud. Las credenciales van a `conexiones.datos` (clave `portal:<compañía>`) y no a `credenciales_portal`.
  - Menú lateral con buscador, vista Matriz, filtro por ramo y activar o desactivar desde la lista.
  - **Tipos de seguro:** la tabla se siembra, pero no hay pantalla.
  - "Sugerir con IA" para la estrategia.
  - País de feriados e idioma, fijos en `AR` y `es-AR`.
  - Qué ajustes aplican a correo, a portal o a ambos.
  - Editar una aseguradora reemplaza todos sus contactos por uno.
  - **Checklist del inicio:** tiene otros ítems ("Activá el agente", el correo y el nombre del productor). La spec pide agregar lo que vendés, una aseguradora con contacto, conectar los accesos de portal y elegir cómo suena el agente.
- **Feriados** (`src/lib/cotizacion/seguimientos.ts`): fechas fijas más Carnaval y Viernes Santo. Faltan el 17 de junio y los trasladables (17/8, 12/10 y 20/11 se mueven a lunes), y los días puente. Sin tests.
- **Tests:** el parser de la estrategia y `sumarDiasHabiles()` (`src/lib/cotizacion.test.ts`).

### Fase 3 — Nueva solicitud: casi hecha
- **Hecho:**
  - `/agentes/cotizacion/nueva` es una página, no un modal;
  - asegurado o lead, negocio nuevo o renovación, ramo y las aseguradoras activas del ramo ya elegidas ("N de M seleccionadas");
  - un archivo de hasta 25 MB;
  - riesgo de Automotor y Flotas validado en el servidor (CUIT/CUIL con dígito verificador, año);
  - también desde la ficha de un lead o de un asegurado (`src/app/(app)/actions.ts`, `src/app/(app)/asegurados/actions.ts`; arreglado en `ed69eac`);
  - `crearSolicitud()` crea un envío `pendiente` por compañía, con asunto y cuerpo de la plantilla, y los eventos.
- **Falta o cambia:**
  - el aviso "sin paquete configurado";
  - varios archivos;
  - campos de riesgo para los demás ramos;
  - **"Cotizar automáticamente"** solo preselecciona las compañías: no cotiza al crear;
  - el cuerpo usa "Productor" y "UNIQO" fijos en lugar de la cuenta, y no agrega `instrucciones_cuerpo`.
- **Tests:** `validarCuitCuil()` y `validarDatosRiesgo()`. `crearSolicitud()` no tiene (necesita base).

### Fase 4 — Detalle: parcial
- **Hecho** (`/agentes/cotizacion/[id]`):
  - encabezado y "Marcar completada";
  - **Contactos:** estado, preguntas, seguimientos, última actividad, y aprobar, omitir o mejorar con IA cada borrador;
  - **Cotizaciones:** comparativo (prima neta y total, franquicia, suma, condiciones y coberturas) con "Mejor precio", CSV, Excel y PDF, carga manual, PDF recibido, propuesta en PDF con aprobación y extracción con IA;
  - **Validación:** CUIT, marca, modelo, año, código postal, suma y coberturas;
  - **Agente:** eventos, chat con IA y borradores de la IA;
  - panel derecho con el porcentaje, la persona, los archivos y la actividad.
- **Falta o cambia:**
  - **Responder la pregunta de una compañía y reintentar** (`requiere_atencion`): no existe.
  - Contactos: el paquete aparece como un número (el id), y faltan el próximo seguimiento, Copiar y Excel.
  - Comparativo: faltan la vista compacta o detallada, las filas de la spec (daños, robo, cristales, RC, servicios, gastos e impuestos) y "agregar parámetros". "Mejor precio" cuenta también lo que no se confirmó.
  - Validación: falta la vigencia.
  - Agente: faltan la línea de tiempo de pasos y el borrador al ejecutivo.
  - Panel: "Requiere atención" con detalle, seguimientos activos, archivos por compañía y "Mostrar más". La persona está fija en "Verónica".
  - El porcentaje cuenta solo los cotizados; la spec cuenta los envíos cerrados (también rechazados y con error).
  - **"Marcar completada"** solo llena `completado_el`: la solicitud sigue en su estado y en la lista aparece activa.
  - **Propuesta:** PDF de una página sin logo y sin acentos ("Organizacion"). La "marca de la organización" es solo el nombre.
- **Tests:** `propuesta-pdf.test.ts` y `validarCotizacionContraSolicitud()`.

### Fase 5 — Inicio, bitácora y desempeño: casi hecha
- **Hecho:**
  - tarjetas Activas, Requieren tu atención, Solicitudes del mes y Cotizaciones recibidas;
  - lista con buscador y filtros por estado, ramo, origen, ejecutivo y fecha, y exportar a CSV y Excel;
  - Desempeño con las 3 tablas. Las métricas son puras (`src/lib/cotizacion/metricas.ts`) y tienen tests.
- **Falta o cambia:**
  - la "Bitácora" (pestaña Historial) es `actividad_agentes`, sin filtros; los eventos por solicitud (`cotizacion_eventos`) solo se ven en el detalle;
  - la UI no muestra el volumen ni el tiempo promedio de cierre, aunque se calculan;
  - el tiempo de respuesta se mide desde que se creó el borrador, no desde que salió, y un rechazo sin resultado no tiene tiempo;
  - el ranking cuenta envíos como "cerradas", no solicitudes.

### Fase 6 — Orquestador, seguimientos y respuestas: falta lo central
- **Hecho:**
  - `/api/cron/cotizacion` (con `CRON_SECRET`, de lunes a viernes a las 10, solo con el agente activo): prepara borradores de seguimiento, respeta "si hay folio, esperar" y, al llegar al máximo, pasa el envío a `requiere_atencion`;
  - al aprobar un seguimiento se calcula el próximo por días hábiles;
  - simulador de respuestas (cotizado, pregunta, rechazo y error), solo con ejemplos y fuera de producción;
  - carga manual de la respuesta, y extracción con IA desde un PDF.
- **Falta:**
  - **El orquestador** (`src/lib/cotizacion/orquestador.ts`): no existe. Nada llama a `ejecutarEnCompania()`, no hay canal `api` o `portal`, no se pasa al canal siguiente y no se consultan las cotizaciones asincrónicas.
  - **`ia_trabajos`:** Cotización no encola nada.
  - **La normalización con IA** de lo que devuelve un conector o un correo.
  - **El cron no saltea feriados** (solo fines de semana, por el horario de Vercel).
  - **El simulador no anda con la app compilada** (`next start` corre con `NODE_ENV=production`), por eso el E2E no puede usarlo.
  - **El correo aprobado no queda como borrador:** pasa por `src/conexiones/cotizacion.ts`, que inventa una "referencia simulada", y el envío queda como `enviado`. No usa la salida común (`src/agentes/envio.ts`) ni avisa que no hay correo conectado.
  - La extracción desde el correo de la compañía.
- **Tests:** ninguno del cron ni de la aprobación.

## Criterios de aceptación (sección 4 de la spec)
| # | Criterio | Estado | Cómo se comprobó |
|---|---|---|---|
| 1 | 3 aseguradoras en Automotor → 3 envíos `pendiente` y 3 borradores según la plantilla | Hecho, con dos detalles: "Productor" y "UNIQO" fijos en el cuerpo, y sin `instrucciones_cuerpo` | Contra Postgres con la app compilada (pasos 4 y 5 de la prueba) |
| 2 | Borrador sin aprobar → no se registra el envío | Hecho | Contra Postgres (paso 6) |
| 3 | "Cada 3 días hábiles" con feriado en medio | Hecho, con el calendario incompleto | `cotizacion.test.ts` (`sumarDiasHabiles()` con feriados que le pasa el test). Faltan los trasladables |
| 4 | Máximo de seguimientos → no hay más y queda `requiere_atencion` | Hecho, sin test de Vitest | Contra Postgres con el cron (paso 8) |
| 5 | Dos cotizaciones → "Mejor precio" en la menor prima total | Hecho (cuenta también las no confirmadas) | Con la app compilada sobre la 1042 (paso 2) |
| 6 | Propuesta en PDF con la marca y en borrador | Parcial: borrador sí; la marca es solo el nombre, sin logo ni acentos | Paso 11 del E2E |
| 7 | Métricas contra un fixture calculado a mano | Hecho | `metricas.test.ts` |
| 8 | Sin clave o con la IA apagada funciona, se ocultan los controles y no hay llamadas | Hecho con el interruptor propio, no con `ia_configuracion`. Queda un texto técnico a la vista | Con la app compilada sin clave (paso 3) |
| 9 | Cada respuesta de IA queda con modelo, tokens y costo, y nada se envía sin aprobación | Parcial: queda en `cotizacion_eventos`, pero no en `ia_uso` ni en la cuota; la extracción da el envío por `cotizado` sin confirmar | Lectura de `src/lib/ia/cotizacion.ts` |
| 10 | Ninguna credencial en texto plano | Hecho para lo suyo, pero en `conexiones.datos` y no en `credenciales_portal` | Contra Postgres: la clave no está en el volcado de la base ni en el log (paso 10) |
| 11 | API + portal + correo → las dos primeras cotizan solas y las tres terminan en el mismo comparativo | **Falta** | No hay orquestador. Además, el registro simulado le da API y portal a todas las compañías: no hay cómo decir "esta solo por portal" |
| 12 | Si el portal falla → borrador de correo, error registrado y salud actualizada | **Falta** en Cotización (la base común ya lo hace en `ejecutarEnCompania()` y `conector_salud`) | — |
| 13 | El portal pide un dato → `requiere_atencion` con la pregunta, y al responder se reintenta | **Falta** | El simulador pone una pregunta genérica; no hay cómo responderla |
| 14 | Ningún conector emite, acepta ni firma | Hecho por la base común | `src/lib/conectores/tipos.ts` no tiene esas acciones; `canales.test.ts` |
| 15 | E2E: crear → aprobar → simular → comparar → propuesta → completar | **Parcial** | El paso 8 crea desde un lead; el 11 hace la propuesta y completa la 1042 sembrada. Faltan aprobar, simular y comparar |

## Qué no sigue la base común y qué cambiar
| Tema | Hoy | Base común | Qué cambiar |
|---|---|---|---|
| **IA** | `generar()` de `ProveedorClaude` con texto libre, `JSON.parse` a mano, sin modelo por tarea (usa `ANTHROPIC_MODEL_COTIZACION` o Haiku) | `ejecutarIA()`: modelo por tarea, salida estructurada con zod, reintento con Sonnet, `ia_uso` y la cuota de USD 20 | Pasar las 3 operaciones a `ejecutarIA()` con esquemas zod: `extraer_cotizacion` (tarea `extraer`), `redactar_correo` y `chat` (tarea `explicar`). Sacar el uso de `generar()` |
| **Interruptor de IA** | `org_features.cotizacion_ia`, aparte | `ia_configuracion` (en producción, la fila `*`/`*` activa con tope) | Leer `estadoIA({ agente: "cotizacion", … })`. Al migrar, la IA de Cotización queda prendida en producción dentro del tope: hay que decidirlo (ver el plan) |
| **Registro del costo** | `cotizacion_borradores_ia` y `cotizacion_eventos` | `ia_uso` (sin contenido) | El costo va a `ia_uso`. `cotizacion_borradores_ia` sigue guardando el texto para revisar; las columnas de costo quedan como históricas |
| **Credenciales** | `conexiones.datos.credencialesCifradas`, con `COTIZACION_CREDENTIALS_KEY` | `credenciales_portal` (`src/lib/conectores/credenciales.ts`), con `CREDENCIALES_PORTAL_KEY` | Guardar con `guardarCredencial()`. Migrar las que haya en `conexiones.datos` (en producción hay que contarlas antes; las dos claves tienen el mismo valor, así que se pueden descifrar y volver a cifrar) |
| **Compañías** | `adaptadorSalidaCotizacion` simulado; `canal` = `correo/portal/ambos` | `ejecutarEnCompania()` con permisos (`cotizar` autorizado al aprobar la solicitud), orden `api → portal → archivo/manual`, `conector_llamadas` y `conector_salud` | Orquestador que llama `ejecutarEnCompania("cotizar")` con `autorizacion({ cotizar: { solicitudId, motivo } })`. Si cae a manual, deja el borrador de correo; si `requiere_dato`, pasa a `requiere_atencion` con la pregunta |
| **Trabajos** | Todo en la acción del servidor | `ia_trabajos` con manejadores y `despachadorTrabajos` | `cotizacion:cotizar_envio`, `cotizacion:consultar_cotizacion` y `cotizacion:extraer_respuesta` como manejadores |
| **Correo saliente** | La aprobación "envía" por un adaptador falso y marca `enviado` | La salida común (`src/agentes/envio.ts`), que solo sale con Gmail conectado y si no, avisa | Al aprobar, mandar por la salida común. Sin Gmail conectado, el envío queda aprobado y en espera, y la pantalla lo dice |
| **Mapeos** | — | `conector_mapeos` | Lo usa el conector de cada compañía real; con los simulados no hace falta. Fuera de alcance |

## Prueba contra Postgres 18.6 (29/10/2026)
Docker descartable (`postgres:18.6`), `db:preparar` desde cero con los datos de ejemplo y la app compilada (`next start`) con `CONECTORES_SIMULADOS=1`, sin `ANTHROPIC_API_KEY` y con una clave de cifrado de prueba. Un recorrido con Playwright (fuera del repo) pasó estos pasos:
1. **El seed** deja 8 aseguradoras activas (con las duplicadas), 5 solicitudes de ejemplo (1037 y de la 1039 a la 1042) con 16 envíos, todos con canal `correo`, y ninguna fila en `ia_configuracion`. Las solicitudes de ejemplo usan los ramos de la cartera ("Auto", "Flota").
2. **Criterio 5:** la 1042 marca "Mejor precio" en Sancor ($ 912.000), que es la menor prima total.
3. **Criterio 8:** sin clave no aparecen "Mejorar con IA", "Extraer con IA" ni el chat; la configuración pide la clave y el interruptor está deshabilitado; `ia_uso` queda vacía. Pero la pestaña Agente dice "La extracción con IA se habilita cuando elijas el enfoque de IA", que es un texto técnico.
4. **El simulador de respuestas no aparece** con la app compilada, como se esperaba de la lectura.
5. **Criterio 1:** con 3 aseguradoras activas (Sancor, La Segunda y Federación Patronal), una solicitud nueva de Automotor desde la pantalla crea 3 envíos `pendiente` con borrador `pendiente`, asunto "SOLICITUD – Automotor – Panadería La Espiga SA – Sancor – " y el cuerpo con el cliente y el CUIT. El cuerpo dice "Productor: Productor. Organización: UNIQO.", y el canal del envío copia el de la aseguradora (`ambos` o `correo`).
6. **Criterio 2:** sin aprobar no hay evento de aprobación. "Omitir" deja el envío `pendiente` y sin `aprobado_el`.
7. **Aprobar** el borrador de Sancor lo deja `enviado`, con el próximo seguimiento a 3 días hábiles y el evento "…referencia simulada simulado-Sancor-…". Es decir: **la pantalla da por enviado un correo que no salió**.
8. **Criterio 4:** con el agente activo, el cron revisa 2 envíos vencidos. Pasa a `requiere_atencion` el que ya tenía 3 seguimientos (el máximo) y prepara el borrador "Seguimiento: SOLICITUD – Flota – Sancor" para el otro. Una segunda corrida no duplica nada. Sin `CRON_SECRET` responde 401.
9. Aprobar ese seguimiento lo deja `en_seguimiento`, con 1 seguimiento y el próximo el martes 3/11 (desde el jueves 29/10).
10. **Criterio 10:** la clave del portal se guarda cifrada en `conexiones.datos` (`portal:Sancor`). No aparece en el volcado de la base ni en el log de `next start`. `credenciales_portal` queda vacía.
11. "Marcar completada" llena `completado_el`, pero la solicitud sigue en `esperando`.

**Dos hallazgos más de esta prueba:**
- **El seguimiento sale un día hábil tarde:** el próximo se guarda a las 12 (hora argentina) y el cron corre a las 10, así que ese día no lo toma y lo prepara al día hábil siguiente.
- `calcularProximoSeguimiento()` cuenta desde la fecha en UTC: entre las 21 y las 24 de Argentina arranca un día después.

**Para repetirla:**
1. `docker run -d --name uniqo-pg-coti -e POSTGRES_PASSWORD=prueba -e POSTGRES_DB=uniqo -p 55433:5432 postgres:18.6`.
2. `DATABASE_URL=postgres://postgres:prueba@127.0.0.1:55433/uniqo npm run db:preparar`, y `npm run build` con la misma `DATABASE_URL`.
3. `next start` con `DATABASE_URL`, `CONECTORES_SIMULADOS=1`, `APP_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET` y una `CREDENCIALES_PORTAL_KEY` de prueba (32 bytes en base64; también como `COTIZACION_CREDENTIALS_KEY`, que es la que usa hoy Cotización).

**Migraciones:** esta sesión no agrega ninguna. Las del plan se prueban sobre una base con los datos de `main` antes de mergear, como en el Validador (con `db:preparar` desde un worktree de `main` primero).

## Plan propuesto (espera el OK de Julian)
Cada fase cierra con `npm test`, lint, build, el E2E entero contra Postgres 18.6, commit y este progreso al día. Las migraciones solo agregan y se prueban antes sobre una base con los datos de `main`. Nada se envía de verdad: conectores simulados, correos como borradores y, sin `ANTHROPIC_API_KEY`, el agente funciona igual.

| Fase | Qué | Sesiones | Criterios |
|---|---|---|---|
| 1 | Arreglos de lo que ya hay | 1 corta | 1, 3, 5 y 9 |
| 2 | **Alinear con la base común: IA, credenciales y conectores** | 2 | 9 a 14 |
| 3 | Pantalla común Configuración → Conexiones | 1 | 10 |
| 4 | Lo que falta de las pantallas | 1 | 6 |
| 5 | Cierre: seed, E2E del flujo completo, README y PR | 1 | 15 |

### Fase 1 — Arreglos (sin migraciones)
- La extracción con IA no da el envío por `cotizado` ni lo suma a la lista hasta que el productor confirme. Botón "Confirmar" en la respuesta. "Mejor precio", solo entre las confirmadas.
- El `redirect` dentro del `try` de `aprobarEnvioCotizacion()`.
- **"Marcar completada"** saca la solicitud de Activas (cuenta como cerrada) sin tocar su estado viejo.
- El cuerpo del correo con el nombre del productor y de la organización de la cuenta, y con `instrucciones_cuerpo`.
- **Feriados:** sumar el 17 de junio y los trasladables, con tests. El próximo seguimiento, contado desde el día argentino y guardado antes de que corra el cron (no a las 12).
- El porcentaje del detalle, por envíos cerrados. El paquete, por su nombre.
- Sacar el texto "cuando elijas el enfoque de IA".

### Fase 2 — Alinear con la base común (IA, credenciales y conectores)
**2a. IA por `ejecutarIA()`:**
- Las 3 operaciones pasan a `ejecutarIA()` con esquema zod y salida estructurada:
  - `extraer_respuesta`: PDF o texto del correo → resultado normalizado, tarea `extraer` (Haiku, reintento con Sonnet). Va por la cola como manejador `cotizacion:extraer_respuesta`;
  - `redactar_correo`: tarea nueva `redactar` (Haiku);
  - `chat`: tarea `explicar` (Sonnet). Ver "Enfoque de IA".
- Se deja de usar `generar()`, y con eso `ANTHROPIC_MODEL_COTIZACION`.
- El costo va a `ia_uso` y entra en el tope de USD 20. `cotizacion_borradores_ia` sigue guardando el texto para revisar.
- **El interruptor:** el de la Configuración de Cotización escribe una fila `cotizacion` / `*` en `ia_configuracion`. Una migración la crea con el valor de hoy de `org_features.cotizacion_ia`, así en producción no se prende sola por la fila `*` / `*`.

**2b. Credenciales:**
- La sección Portales guarda en `credenciales_portal` con `guardarCredencial()`.
- Las que haya en `conexiones.datos` se pasan una vez (descifrar, separar usuario y clave, cifrar con `CREDENCIALES_PORTAL_KEY`), en un paso idempotente de `preparar-db`. No se borra nada de `conexiones`.

**2c. Conectores (el orquestador de la fase 6 de la spec):**
- **Aprobar la solicitud** (botón "Aprobar y cotizar", o "Cotizar automáticamente" al crearla) autoriza `cotizar`. Encola un trabajo `cotizacion:cotizar_envio` por compañía, que llama a `ejecutarEnCompania("cotizar")` con esa autorización y el orden de canales de la compañía:
  - **cotizada:** el resultado se guarda en `cotizacion_resultados`, con el mismo formato que una carga manual;
  - **pendiente** (dos pasos): queda con el número de la compañía, y `cotizacion:consultar_cotizacion` lo consulta con la estrategia de seguimiento;
  - **rechazada:** el envío queda `rechazado`, con el motivo;
  - **`requiere_dato`:** el envío pasa a `requiere_atencion` con la pregunta. Al responderla en el detalle, se guarda en los datos del riesgo y se reintenta;
  - **sin conector o todos fallan:** queda el borrador de correo para aprobar, con el evento ("El portal de Sancor no respondió; se preparó el correo para aprobar"). La salud la actualiza `ejecutarEnCompania()`.
- **Orden de canales por compañía:** una tabla compartida nueva (`conector_companias`: compañía, canales en orden, `org_id`, `producer_id`). Sin fila, quedan todos los conectores registrados, como hoy en el Validador. `ejecutarEnCompania()` suma la opción `canales`, con tests. Esto permite el criterio 11 (una por API, una por portal, una solo por correo).
- **El correo aprobado** sale con el Gmail de la cuenta. Sin Gmail conectado, queda aprobado y sin enviar, y la pantalla lo dice. Se borra el adaptador falso `src/conexiones/cotizacion.ts`.
- **Migración `0029`** (solo agrega):
  - en `cotizacion_envios`: `canal_usado` (`api`, `portal` o `correo`), `intentos` (JSON con canal, resultado y fecha), `numero_compania` y `ultimo_error`;
  - la tabla `conector_companias`;
  - la fila de `ia_configuracion` de 2a.

  `canal` (`correo`, `portal` o `ambos`) queda, pero ya no decide nada.
- **Para probarlo:** `CONECTORES_SIMULADOS_FORZAR` (por ejemplo, `Federación Patronal=falla;Rivadavia=dato`), para que los criterios 12 y 13 no dependan del azar.

### Fase 3 — Configuración → Conexiones (común a los 3 agentes)
- Por compañía: canales en orden (o "solo correo o carga manual"), credenciales de `credenciales_portal`, capacidades del conector, "Probar conexión" (`probarConexion()`) y la salud (`conector_salud`: último éxito, último error y latencia).
- Cada agente ve solo lo suyo: Cotización, cotizar y coberturas; el Validador, cobranza y cancelaciones; Siniestros, lo de siniestros.
- La pestaña Credenciales del Validador y la sección Portales de Cotización pasan a ser un enlace a esta pantalla.

### Fase 4 — Lo que falta de las pantallas (en orden de prioridad)
1. Checklist del inicio con los 4 pasos de la spec y aviso "sin paquete configurado" en la nueva solicitud.
2. Detalle:
   - en Contactos, el próximo seguimiento, Copiar y Excel;
   - en el panel, "Requiere atención" con detalle, los seguimientos activos y los archivos por compañía;
   - en Agente, la línea de tiempo y el borrador al ejecutivo.
3. Comparativo: las filas de la spec (gastos, impuestos, daños, robo, cristales, RC y servicios) y la vista compacta o detallada.
4. ABM de Tipos de seguro y "Sugerir con IA" para la estrategia (el parser la valida antes de guardar).
5. La bitácora con `cotizacion_eventos` y filtros. Las métricas, medidas desde que salió el envío.
6. La propuesta con el logo de la cuenta (`0012_logo_empresa`) y con acentos.

### Fase 5 — Cierre
- **Seed de demo:**
  - 6 aseguradoras: una por API (Sancor), una por portal (Federación Patronal), una solo por correo (La Segunda) y el resto mezclado;
  - con paquetes y contactos;
  - 5 solicitudes en distintos estados, con los ramos de Cotización.
- **El simulador de respuestas por correo** se habilita con `CONECTORES_SIMULADOS=1`, no con `NODE_ENV`, así anda con la app compilada.
- **E2E:**
  - un paso nuevo con el flujo completo: crear → aprobar y cotizar → la API cotiza, el portal falla y pasa a correo, La Segunda deja el borrador → aprobar el correo → simular su respuesta → comparar → propuesta → completar;
  - otro paso para el dato que pide el portal;
  - los pasos 8 y 11 siguen pasando.
- README y PR.

### Enfoque de IA: recomendación
`ejecutarIA()` ya resuelve el modelo por tarea, la salida estructurada con zod, el reintento, `ia_uso` y la cuota. Por eso la opción A sale casi gratis, y lo único nuevo de la B es el bucle de herramientas.

| Opción | Qué es | Costo estimado por solicitud (6 compañías) | Trabajo |
|---|---|---|---|
| **A. Pipeline con salida estructurada** | Extraer cada respuesta (Haiku), redactar correos (Haiku), explicar el comparativo (Sonnet) | USD 0,03 a 0,08 | Chico: 3 llamadas pasan a `ejecutarIA()` con su esquema |
| **B. Chat con herramientas del dominio** | Sonnet con `ver_solicitud`, `ver_comparativo`, `validar_cotizacion` y `crear_borrador` (que escribe un borrador y nunca envía) | USD 0,03 a 0,06 por pregunta; unos 0,10 a 0,20 con 3 preguntas | Mediano: `ejecutarIA()` no tiene bucle de herramientas; hay que sumar `conversarIA()` en `src/lib/ia/`, con tope de pasos y cada vuelta en `ia_uso` |
| C. Claude Agent SDK | Orquestación general | USD 0,05 a 0,50 o más | Descartada por la Arquitectura: no encaja en las funciones de Vercel y suma riesgos |

Cuentas con los precios de lista (Haiku 5.5: USD 0,10 / 0,50 por millón de tokens; Sonnet 5.5: 2 / 10), con un PDF de unos 10.000 tokens:
- extraer un PDF cuesta unos USD 0,002 con Haiku, y 0,03 si hay que reintentar con Sonnet;
- explicar el comparativo, unos 0,02;
- una pregunta del chat con 2 o 3 herramientas, con caché del prompt fijo, unos 0,03 a 0,06.

**Recomendación:** A en la fase 2. El chat de hoy pasa a `ejecutarIA()` sin herramientas: el contexto de la solicitud en el prompt y una salida estructurada con la respuesta y lo que falta. La B, en la fase 4 o después, solo si el chat resulta útil.
- Con 40 solicitudes por mes, A cuesta unos USD 2 a 4, y A más B, unos 6 a 12.
- Las dos entran en el tope de USD 20, pero B le deja menos lugar al resto de los agentes.
- Sin Agent SDK.

### Para decidir antes de la fase 2
1. **El enfoque de IA:** A ahora y B después (lo recomendado), o A y B juntas.
2. **La IA de Cotización en producción** al pasarla a `ejecutarIA()`: lo recomendado es que siga como esté hoy su interruptor (la migración lo copia). La otra opción es que quede prendida dentro del tope de USD 20.
3. **Rivadavia duplicada:** en el seed de demo se arregla. En producción no se borra nada; ¿la desactivo con la migración o la desactivás vos desde la Configuración?
4. **Antes de la 2b**, en el SQL Editor de Neon:
   - cuántas credenciales hay en `conexiones.datos`: `select count(*) from conexiones where datos ? 'credencialesCifradas'`;
   - cuántas solicitudes no tienen envíos: `select count(*) from solicitudes_cotizacion s where not exists (select 1 from cotizacion_envios e where e.solicitud_id = s.id)`.

  Las solicitudes sin envíos se siguen leyendo desde `cotizaciones` (el JSON viejo), que no se toca.

## Próximo paso exacto
Esperar el OK de Julian al plan y sus respuestas a "Para decidir antes de la fase 2". Con el OK, arrancar la fase 1 en una rama nueva que salga de `main` (o de esta, si ya está mergeada).
