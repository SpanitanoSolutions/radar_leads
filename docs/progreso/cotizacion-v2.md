# Progreso — Agente de Cotización v2

Spec: [cotizacion-v2.md](../specs/cotizacion-v2.md). Manda en todo lo de compañías: [conectores.md](../specs/conectores.md). Plan anterior: [PLAN-cotizacion-v2.md](../PLAN-cotizacion-v2.md).
Ramas: `feat/cotizacion-v2-auditoria` (auditoría, sale de `main` en `33d9a3d`), `feat/cotizacion-v2-arreglos` (fase 1, sale de la auditoría en `a7a9a93`), `feat/cotizacion-v2-base-comun` (fase 2, sale de los arreglos en `7c3cf03`; PR #34, mergeado), `feat/cotizacion-v2-conexiones` (fase 3, sale de `main` en `0fecc26`; PR #35, mergeado) y `feat/cotizacion-v2-pantallas` (fase 4, sale de `main` en `f05023b`).

## Fase 4 — Lo que falta de las pantallas (30/10/2026, en curso)
Rama `feat/cotizacion-v2-pantallas`, sale de `main` en `f05023b` (con el PR #35). Cada paso es un commit y este archivo se actualiza antes del siguiente.

| Paso | Qué | Estado | Archivos |
|---|---|---|---|
| 1 | Checklist del inicio con los 4 pasos de la spec y aviso "sin paquete configurado" en la nueva solicitud | Hecho, 7 tests, probado con `next dev` | `src/lib/cotizacion/configuracion.ts` (+ test, nuevos), `src/lib/datos-agentes.ts`, `src/agentes/cotizacion/solicitudes.ts`, `page.tsx`, `nueva/` y `configuracion/` (`page.tsx`, `actions.ts`) de Cotización, `agentes.css` |
| 2 | Detalle: Contactos (próximo seguimiento, Copiar y Excel), panel (Requiere atención, seguimientos activos, archivos por compañía) y Agente (línea de tiempo y borrador al ejecutivo) | Por hacer | |
| 3 | Comparativo: filas de la spec y vista compacta o detallada | Por hacer | |
| 4 | ABM de Tipos de seguro y "Sugerir con IA" para la estrategia | Por hacer | |
| 5 | Bitácora con `cotizacion_eventos` y filtros; métricas desde que salió el envío | Por hacer | |
| 6 | Propuesta en PDF con el logo de la cuenta y con acentos (criterio 6) | Por hacer | |
| Cierre | Tests, lint, build, E2E entero, recorrido con la app compilada, README y vault | Por hacer | |

**Decisiones de Julian (30/10/2026):**
- **Borrador al ejecutivo:** el ejecutivo es el productor de la cuenta. El borrador va al correo de Mi cuenta y, al aprobarlo, sale por la salida común; sin el correo conectado queda aprobado y sin enviar, como los de las compañías.
- **"Agregá lo que vendés"** (checklist del inicio) lleva a Paquetes de cobertura y queda listo con al menos un paquete cargado para una aseguradora activa.

**Paso 1. Checklist y "sin paquete configurado":**
- **El checklist** ("Terminá de configurar tu agente de cotización", con "N de 4 listos") reemplaza al de antes (activar el agente, el correo y el nombre del productor). Cada paso lleva a su sección y dice para qué sirve; desaparece con los 4 listos. Lo calcula `pasosConfiguracionCotizacion()` (pura):
  - **Agregá lo que vendés** → Configuración `#paquetes`: un paquete de una aseguradora activa;
  - **Agregá una aseguradora con contacto** → `#aseguradoras`: una activa con un correo válido (el mismo control que usa el correo a la compañía);
  - **Conectá los accesos de portal** → `/configuracion/companias?agente=cotizacion`: una clave activa de una compañía con la que cotizás, por su nombre canónico;
  - **Elegí cómo suena tu agente** → `#voz`: la voz se guardó alguna vez o es distinta de la que viene.
- **La configuración** tiene anclas por sección (`#aseguradoras`, `#voz`, `#paquetes`); la sección de voz se divide en "Voz y tono" y "Comportamiento", y Paquetes explica qué son.
- **La nueva solicitud** marca "Sin paquete configurado" en cada aseguradora sin paquete para el ramo elegido (por nombre canónico: "Automotor" y "Auto" son el mismo) y resume el aviso con el enlace a Paquetes. No bloquea: el pedido sale igual.
- **Cada envío nuevo lleva el paquete de su ramo** (`paqueteParaEnvio()`), así Contactos lo muestra por su nombre. Antes ningún envío tenía paquete.

**Decisiones de la implementación (revisables):**
- "Elegí cómo suena tu agente" queda listo al guardar la configuración del agente aunque se deje la voz que viene: se anota `vozElegida` en `configuracion_agentes.config` de `cotizacion` (sin migración). También cuenta como listo una voz distinta de la que viene, para las cuentas que la cambiaron antes de esta fase.
- Con varios paquetes para el mismo ramo, el envío lleva el primero que se cargó.

**Prueba del paso 1** (con `next dev` contra Postgres 18.6 recién sembrado, recorrido de Playwright fuera del repo): el inicio muestra los 4 pasos pendientes; "Agregá lo que vendés" lleva a Paquetes; con un paquete de Sancor en Automotor y un contacto de Sancor quedan listos esos dos; guardar la voz tal como viene la da por elegida; con una clave del portal de Sancor el checklist desaparece. En la nueva solicitud, 7 de 8 aseguradoras dicen "Sin paquete configurado" en Automotor (Sancor no) y en Hogar también Sancor. La solicitud 1043, solo con Sancor, muestra "Terceros completo premium" en Contactos. Sin desborde a 390 px en el inicio, la nueva solicitud y la configuración.

## Fase 3 — Configuración → Conexiones con las compañías (30/10/2026, cerrada)
Rama `feat/cotizacion-v2-conexiones`, PR #35 (mergeado). Una pantalla nueva, `/configuracion/companias`, común a los 3 agentes (`?agente=cotizacion|validador|siniestros` muestra solo lo de ese agente).

| Paso | Qué | Estado | Archivos |
|---|---|---|---|
| 1 | Lógica pura: capacidades por agente, nombres de canales, leer el orden del formulario, estado de cada canal y la lista de compañías | Hecho, 18 tests | `src/lib/conectores/vista.ts` (+ test) |
| 2 | Datos y acciones: guardar el orden en `conector_companias`, credenciales, "Probar conexión" (que ahora atrapa lo que lance el conector y tiene tope de tiempo) | Hecho, 2 tests | `src/lib/conectores/companias.ts`, `ejecutar.ts` (+ test), `canales.ts`, `src/app/(app)/configuracion/companias/actions.ts`; los formularios genéricos del Validador pasan a `src/components/Formularios.tsx` |
| 3 | La pantalla | Hecho y probado | `src/app/(app)/configuracion/companias/` (`page.tsx`, `Secciones.tsx`, `actions.ts`, `companias.css`); `credencialParaConector()` busca por nombre canónico |
| 4 | Los agentes enlazan a la pantalla: Credenciales del Validador (la plantilla de importación se muda), Portales de Cotización (y el `canal` viejo deja de verse, también en "Nueva solicitud"), Siniestros y Configuración → Conexiones | Hecho y probado | configuración de los 3 agentes, `nueva/` de Cotización, `src/app/(app)/configuracion/` (`page.tsx`, `Paneles.tsx`, `actions.ts`), `src/conexiones/catalogo.ts` (+ test), `estado.ts`; se borraron `src/conexiones/portal.ts` y `src/lib/cotizacion/credenciales.ts` |
| 5 | `ejecutarEnCompania()` usa el nombre canónico de la compañía | Hecho, 1 test | `src/lib/conectores/ejecutar.ts` (+ test) |
| 6 | Pruebas: tests, lint, build, E2E y recorrido con la app compilada | Hecho (ver "Prueba de la fase 3") | `e2e/flujos.mjs` (paso 17b y la pantalla en el control de 390 px) |

**Decisiones de la implementación (revisables):**
- La pantalla vive en `/configuracion/companias`. En Configuración → Conexiones, el grupo "Compañías de seguros" pasa a ser una sola fila que lleva ahí (antes eran 22 filas con "Integración pendiente" que no hacían nada).
- Las compañías se identifican por su nombre canónico (`companiaCanonica()`: "Seguros Rivadavia" → "Rivadavia"), en la pantalla y en `ejecutarEnCompania()`, para que los 3 agentes compartan la misma fila de canales, credenciales y salud.
- La plantilla de importación del Validador (el canal archivo) se muda a la pantalla común, en la parte del Validador.
- "Probar conexión" del portal pide una credencial activa; la de la conexión directa usa la credencial si hay.
- El punto de cada compañía en la lista dice cómo anda su conexión automática para el agente elegido (gris: sin conexión o solo correo; verde: anda; ámbar: un canal falló o está fuera de uso; rojo: no anda ninguno). La spec del Validador pedía verde o naranja según hubiera credencial activa: la cantidad de credenciales sigue al lado del nombre.
- `credencialParaConector()` también compara por nombre canónico: una clave guardada como "Seguros Rivadavia" sirve para "Rivadavia".

**Qué hay en la pantalla** (por compañía):
- **Cómo se conecta:** cada canal con conector (conexión directa, portal, archivo), su lugar en el orden o "No se usa por el orden elegido", la salud de `conector_salud` en palabras ("Anda bien", "Falló la última vez", "Rechazó la clave: los agentes no lo usan", "El portal cambió…"), último éxito, último error con su motivo, tiempo de respuesta y **Probar conexión**. Debajo, qué puede hacer cada agente, por qué canal y cuándo lo hace solo (automático, al aprobar la solicitud, o con tu aprobación caso por caso). Sin conectores (como en producción) dice qué hace cada agente mientras tanto.
- **Orden de los canales:** automático (sin fila), uno propio (cada canal con su lugar o "No usar") o solo correo o carga manual (lista vacía). Lugares repetidos o ninguno elegido se rechazan sin guardar. Vale para los tres agentes.
- **Usuario y clave del portal:** la tabla de `credenciales_portal` con agregar, editar y borrar (lo que antes estaba en el Validador).
- **Correo para cotizar** (Cotización): a qué correo va el pedido si no hay conexión automática, o que falta el contacto.
- **Plantilla de los listados del Validador:** la que estaba en su pestaña Credenciales.
- Arriba, los filtros por agente. "Probar conexión" deja el resultado en el aviso (`?prueba=canal:resultado`).

**Lo que se mudó o se sacó:**
- Validador: la pestaña Credenciales pasa a ser el enlace "Compañías y credenciales ↗" y la pestaña por defecto es General. `?tab=credenciales&cia=…` redirige a la pantalla común.
- Cotización: la sección Portales pasa a ser un enlace. La columna y el selector de `canal` de las aseguradoras, y su texto en "Nueva solicitud", ya no se muestran. Guardar o importar una aseguradora no lo pisa (una nueva queda con "correo"); el CSV exportado ya no lo trae y una columna Canal al importar se ignora.
- Configuración → Conexiones: el grupo "Compañías de seguros" es una fila con el resumen ("Simuladas para probar" o "Por correo o carga manual", y cuántas claves hay) y "Administrar". Se sacaron del catálogo las 22 compañías con "Integración pendiente", `companiasCotizables()` (no la usaba nadie) y el adaptador `src/conexiones/portal.ts`.
- `probarConexion()` tiene el tope de tiempo del canal y, si el conector lanza, cuenta como no disponible (con su código si es un `ErrorConector`) y lo audita igual.

### Prueba de la fase 3 (30/10/2026)
- `npm test`: pasan 578 de 581. Los 3 que fallan son de antes (en `catalogo.test.ts` la cuenta bancaria, `menu.test.ts` y `siniestros.test.ts`); los otros 2 de antes eran de las filas de portal del catálogo, que ya no existen. La fase suma 21 tests.
- `npm run lint`: sin errores (las 3 advertencias viejas). `npm run build`: OK.
- `npm run test:e2e`: **pasa entero** (24 pasos, con el 17b nuevo) contra Postgres 18.6 en Docker recién sembrado, con la app compilada, `CONECTORES_SIMULADOS=1` y sin `ANTHROPIC_API_KEY`.
- **Recorrido con la app compilada** (Playwright fuera del repo, sobre la misma base después del E2E, con `CONECTORES_SIMULADOS_FORZAR=Sancor=ok;Mapfre=falla`):
  - Configuración → Conexiones muestra la fila "Conexiones con las compañías" ("Simuladas para probar") y ya no hay "Integración pendiente". "Administrar" lleva a la pantalla, con 21 compañías.
  - Sancor: los dos canales "Sin uso todavía" y las 12 capacidades. Probar la conexión directa: "respondió bien" y queda "Anda bien". El portal sin credencial pide cargarla. Con la credencial cargada responde bien.
  - Con la contraseña `vencida` (la simulación la rechaza): "rechazó el usuario y la clave", el portal queda fuera de uso y la compañía en "Revisá la conexión". Con otra contraseña y otra prueba vuelve a "Anda bien" (`credencial_vencida` vuelve a `false`).
  - Mapfre (portal caído): "no estaba disponible" y "Falló la última vez" con el motivo.
  - Rivadavia, abierta como "Seguros Rivadavia", queda en solo correo, y la parte de Cotización muestra sus dos aseguradoras. Sancor queda solo por portal. Los lugares repetidos se rechazan (E2E).
  - Con `?agente=` cada agente ve solo sus capacidades: el Validador, la plantilla y no el correo; Cotización, el correo y "Al aprobar la solicitud"; Siniestros, "Con tu aprobación, caso por caso".
  - Los enlaces del Validador, Cotización y Siniestros llevan a la pantalla. Cotización ya no muestra Canal ni Portales, y guardar La Segunda con su correo anda.
  - Sin desborde horizontal a 390 px.
  - **De punta a punta con Cotización:** la solicitud 1045 (Flota, desde un lead, con las 8 aseguradoras) y "Aprobar y cotizar": Sancor cotizó **solo por portal** (`intentos`: portal); **Rivadavia y Seguros Rivadavia no probaron ningún canal** (`intentos = []`, queda el correo), las dos por la fila de "Rivadavia"; las demás, por conexión directa.
  - En la base: `conector_companias` con Rivadavia `{}` y Sancor `{portal}`; cada prueba en `conector_llamadas` (agente `configuracion`, operación `probarConexion`); `conector_salud` al día. Las contraseñas no aparecen en el volcado de la base ni en el log del servidor, y el log no tiene errores de esta pantalla.
- Después de la última corrida cambiaron dos textos (el tiempo de respuesta en ms por debajo de 1 s y "Volver a la configuración del Validador de pagos"); `tsc` y lint OK.

**Para repetirla:** como en "Prueba contra Postgres 18.6" (más abajo), con `CONECTORES_SIMULADOS=1` en el build y en `next start`, y `CONECTORES_SIMULADOS_FORZAR=Sancor=ok;Mapfre=falla` para el recorrido.

## Fase 2 — Alinear con la base común (30/10/2026, cerrada)
Rama `feat/cotizacion-v2-base-comun`, PR #34 (mergeado). Las tres partes (2a IA, 2b credenciales y 2c conectores) están hechas y probadas con la app compilada; ver "Cierre de la Fase 2" en la 2c.

**Decisiones de Julian (30/10/2026)** sobre "Para decidir antes de la fase 2":
1. **Enfoque de IA:** la opción A (pipeline con salida estructurada). El chat con herramientas (B) no se hace por ahora.
2. **La IA de Cotización en producción** queda como esté hoy su interruptor: la migración copia el valor de `org_features.cotizacion_ia` a una fila `cotizacion` / `*` de `ia_configuracion`.
3. **Rivadavia duplicada:** la desactiva Julian desde la Configuración. La migración no la toca.
4. **Las dos consultas en Neon** (30/10/2026):
   - credenciales en `conexiones.datos`: **0**. La 2b no necesita copiar nada: alcanza con que la Configuración guarde en `credenciales_portal`;
   - solicitudes sin envíos: **4**. Se siguen leyendo del JSON viejo. Con el punto 5, el webhook de la v1 no les puede sumar respuestas (no hay envío donde dejarlas sin confirmar): contesta 422 con un mensaje claro y se cargan a mano.
5. **Respuestas de los conectores y del webhook de la v1:** entran sin confirmar, como las que lee la IA.
6. **Feriados:**
   - se cuentan los de la provincia de la cuenta (una columna nueva en `ajustes`, con Buenos Aires por defecto);
   - el Jueves Santo no cuenta como día hábil, igual que los días puente.

| Paso | Qué | Estado | Archivos |
|---|---|---|---|
| 2a | IA por `ejecutarIA()`, interruptor en `ia_configuracion` | Hecho y probado (ver "Prueba de la 2a") | `src/lib/cotizacion/ia.ts` (+ test), `src/agentes/cotizacion/ia.ts` y `trabajos.ts` (nuevos), `src/lib/ia/` (`modelos.ts` + test, `claude.ts`, `index.ts`, `motor.ts` + test, `manejadores.ts`; se borró `cotizacion.ts`), `actions.ts`, `[id]/page.tsx`, `[id]/ActualizarMientrasLee.tsx`, `configuracion/actions.ts` y `configuracion/page.tsx` de Cotización, migración `0029` |
| 2a+ | Feriados por provincia y Jueves Santo; el webhook de la v1 sin confirmar (el webhook se sacó en la 2c) | Hecho | `src/lib/cotizacion/seguimientos.ts` (+ test), `src/lib/provincias.ts` (nuevo), `src/db/schema.ts`, `src/lib/datos.ts`, `configuracion/actions.ts` y `Paneles.tsx` (general), `actions.ts` de Cotización, `src/agentes/cotizacion/solicitudes.ts`, `src/app/api/agentes/cotizacion/resultado/route.ts`, migración `0029` |
| 2b | Credenciales en `credenciales_portal` (sin copia: en producción no hay ninguna) | Hecho y probado | `configuracion/actions.ts` y `configuracion/page.tsx` de Cotización, `src/lib/cotizacion/credenciales.ts` |
| 2c | Conectores con el orden de canales | Hecho y probado (ver "2c. Conectores") | migración `0030`, `src/lib/conectores/`, `src/lib/cotizacion/orquestador.ts` y `correo.ts`, `src/agentes/cotizacion/` (`orquestador.ts`, `cotizar.ts` y `correo.ts`), pantallas de Cotización |

**2a. La IA por `ejecutarIA()`:**
- **Las 3 operaciones** (`src/agentes/cotizacion/ia.ts`) pasan por `ejecutarIA()` con salida estructurada y su esquema zod (`src/lib/cotizacion/ia.ts`). El código verifica lo que vuelve:
  - `extraer_respuesta` (tarea `extraer`: Haiku, y Sonnet si la salida no valida). El PDF va como documento, no como texto. Sin una prima total positiva no se suma nada y queda el aviso para cargarla a mano. Lo que lee queda sin confirmar, como desde la fase 1;
  - `redactar_correo` (tarea nueva `redactar`: Haiku, esfuerzo bajo). Solo pisa el borrador si sigue pendiente;
  - `chat` (tarea `explicar`: Sonnet). Ahora le pasa los envíos con sus respuestas y si están confirmadas, y devuelve la respuesta y lo que falta.
- **La lectura de PDFs va por la cola** (`cotizacion:extraer_respuesta` en `MANEJADORES`): el botón "Leer con IA" encola, `despachadorTrabajos` la procesa al terminar la request y, si no, la toma el cron `/api/cron/ia-trabajos`. El detalle muestra "La IA está leyendo el PDF…", se actualiza solo (cada 3 segundos, hasta 3 minutos) y, si falla, dice por qué con un texto sin datos del asegurado. Un PDF que ya se está leyendo no se encola de nuevo.
- **El costo** queda en `ia_uso` y entra en el tope de USD 20. `cotizacion_borradores_ia` sigue guardando el texto para revisar, con el costo y los tokens en 0 (los reales están en `ia_uso`). La tarjeta ya no muestra modelo ni tokens: solo el costo estimado.
- **Sin IA** (sin clave, apagada o sin cuota), los botones no aparecen y el chat explica por qué. Si la IA falla, el aviso dice "no pudo responder" o "tope del mes", y todo sigue a mano.
- **El interruptor** de la Configuración de Cotización escribe la fila `cotizacion` / `*` de `ia_configuracion` (`guardarInterruptorIACotizacion()`). La migración `0029` la crea con el valor de `org_features.cotizacion_ia`, que ya no se lee ni se borra.
- Se borró `generar()` del proveedor (solo lo usaba Cotización) y con eso `ANTHROPIC_MODEL_COTIZACION`.

**2a+. Lo decidido en los puntos 5 y 6:**
- **Feriados:** el Jueves Santo cuenta como no hábil. `DIAS_NO_HABILES_POR_PROVINCIA` tiene los que el Gobierno fijó para algunas provincias (Decreto 1103/2026: el 10/11 en CABA y Córdoba, el 11/11 en Buenos Aires). La provincia de la cuenta se elige en Configuración → Mi cuenta (`ajustes.provincia`, Buenos Aires por defecto) y la usa la aprobación de cada envío. Los feriados propios de cada provincia no están cargados.
- **El webhook de la v1** (`/api/agentes/cotizacion/resultado`) deja la respuesta sin confirmar (`actor: "compania"`). En una solicitud sin envíos contesta 422: "La solicitud no tiene un envío para esa compañía: cargá la respuesta a mano." **Se sacó en la 2c (paso 6).**

**Migración `0029_cotizacion_base_comun`** (solo agrega): la columna `ajustes.provincia` y la fila `cotizacion` / `*` de `ia_configuracion`, si no existe.

**Hallazgo (de antes, sin tocar):** el webhook de la v1 nunca fue alcanzable desde afuera. `src/proxy.ts` pide sesión en todo salvo `/api/cron/`, así que una llamada sin sesión termina en `/login` aunque traiga el secreto. No lo abrí: sería una dirección pública nueva. **Decisión de Julian (30/10/2026): se saca en la 2c**, porque lo reemplazan los conectores. Se sacó en el paso 6 de la 2c.

**2b. Las claves de los portales en `credenciales_portal`:**
- La sección Portales de la Configuración de Cotización guarda con `guardarCredencial()` y lee con `listarCredenciales()`, con el mismo alcance que la cartera del Validador (`ALCANCE_CREDENCIALES`, sin organización ni productor por ahora). Así los dos agentes usan la misma clave de cada compañía.
- Si la compañía ya tiene una clave, "Cambiar usuario y clave" actualiza esa fila; si no, se crea una con la etiqueta "Principal". La pantalla muestra el usuario y si la clave está vencida o desactivada, nunca la clave.
- Cifra con `CREDENCIALES_PORTAL_KEY` (o `COTIZACION_CREDENTIALS_KEY` si no está, como ya hacía la base común). Sin ninguna, avisa y no guarda.
- No se copia nada de `conexiones`: en producción no hay claves ahí (consulta del punto 4). `cifrarCredencial()` de Cotización ya no existe.

**Prueba de la 2b** (app compilada sobre una base nueva): guardar la clave de Sancor crea una fila cifrada en `credenciales_portal` (el texto de la clave no aparece en la base) y nada en `conexiones`. Cambiarla actualiza la misma fila. El Validador la ve en su pestaña Credenciales. La clave no vuelve a la pantalla ni aparece en el log del servidor. Antes, el E2E pasó entero (23 pasos) sobre esa base recién sembrada, sin clave de IA.

### Prueba de la 2a (30/10/2026)
- `npm test`: pasan 513 de 518 (los 5 que fallan son los de antes); 16 tests nuevos. Lint sin errores (las 3 advertencias viejas). Build OK.
- **Migración sobre una base con los datos de `main`:** `db:preparar` desde un worktree de `main` contra Postgres 18.6, con la fila `*` / `*` activa y tope de USD 20 (como producción) y `org_features.cotizacion_ia` prendido. Después, `db:preparar` desde esta rama: quedó la fila `cotizacion` / `*` en `true` (copiada), la `*` / `*` igual, `org_features` sin tocar y la cuenta con provincia "Buenos Aires".
- `npm run test:e2e`: **pasa entero** (23 pasos) con la app compilada, `CONECTORES_SIMULADOS=1` y sin `ANTHROPIC_API_KEY`.
- **Con la app compilada y una API de Anthropic falsa** (un servidor local en `ANTHROPIC_BASE_URL`, fuera del repo; no sale nada a internet):
  - **Interruptor:** apagarlo escribe `activa = false` en la fila `cotizacion` / `*` sin crear filas, y el detalle esconde la IA. Prenderlo la vuelve a `true`.
  - **Leer un PDF** (Sancor en la 1041): encola, el detalle avisa "está leyendo" y se actualiza solo hasta mostrar la respuesta con "falta tu confirmación". El trabajo terminó en 1 intento. El PDF viajó como documento, con Haiku y salida estructurada, y quedó una fila en `ia_uso`. La lista siguió en "2 de 3". En Agente están el evento y el resumen de lo leído, con el costo y sin tokens. Al confirmar, Sancor pasó a "Mejor precio".
  - **Un PDF que la IA rechaza:** no se reintenta, el detalle dice "La IA no pudo leer este PDF. Cargá la respuesta a mano." y ofrece volver a leerlo. No se suma nada.
  - **Un PDF sin prima total:** el trabajo termina, no se suma nada y el aviso pide cargarla a mano.
  - **Mejorar un correo:** Haiku con esfuerzo bajo. El borrador cambia y sigue pendiente.
  - **Chat:** Sonnet. Recibe los envíos con sus respuestas y si están confirmadas, y la pregunta del productor. Muestra lo que falta.
  - **Tope alcanzado** (una fila de USD 20 en `ia_uso`): la configuración lo dice, el interruptor sigue prendido y el detalle esconde la IA.
  - **Mi cuenta:** la provincia viene en Buenos Aires, se cambia a Córdoba, se guarda y se vuelve a cambiar.
  - **Webhook de la v1** (con sesión, por el hallazgo de arriba): con envío deja la respuesta sin confirmar (`{"resultado":"sin_confirmar"}`, el envío sigue `pendiente` y el JSON de la lista no cambia). En una solicitud sin envíos contesta 422 con el mensaje, y con otro secreto, 401.
  - En los logs del servidor no hay errores de Cotización, claves ni datos de asegurados.

### 2c. Conectores (30/10/2026, hecha y probada)
| Paso | Qué | Estado | Archivos |
|---|---|---|---|
| 1 | Migración `0030_cotizacion_conectores` | Hecho y probado | `drizzle/0030_cotizacion_conectores.sql` (+ snapshot), `src/db/schema.ts` |
| 2 | Opción `canales` de `ejecutarEnCompania()` | Hecho, con tests | `src/lib/conectores/canales.ts` (+ test), `ejecutar.ts` (+ test nuevo), `companias.ts` (nuevo), `auditoria.ts` |
| 3 | Orquestador (`cotizacion:cotizar_envio` y `cotizacion:consultar_cotizacion`) | Hecho y probado | `src/lib/cotizacion/orquestador.ts` (+ test, nuevos), `src/agentes/cotizacion/orquestador.ts` y `cotizar.ts` (nuevos), `trabajos.ts`, `solicitudes.ts`, `actions.ts`, `[id]/page.tsx`, `[id]/ActualizarMientrasLee.tsx`, `configuracion/page.tsx` y `agentes.css`; en la base común, `tipos.ts`, `canales.ts` y `simulada-portal.ts` (el campo del dato pedido) |
| 4 | `CONECTORES_SIMULADOS_FORZAR` | Hecho y probado | `src/lib/conectores/registro.ts`, `canales.test.ts`, `.env.example` |
| 5 | El correo aprobado por la salida común; se borra `src/conexiones/cotizacion.ts` | Hecho y probado | `src/agentes/cotizacion/correo.ts` (nuevo), `src/lib/cotizacion/correo.ts` (+ test), `actions.ts`, `page.tsx` y `[id]/page.tsx` de Cotización, `solicitudes.ts`; se borró `src/conexiones/cotizacion.ts` |
| 6 | Se saca el webhook de la v1 | Hecho | se borró `src/app/api/agentes/cotizacion/resultado/route.ts`; `.env.example`, `README.md`, `solicitudes.ts` |
| Cierre | Arreglos que salieron de la prueba con la app compilada | Hecho y probado | `src/agentes/cotizacion/cotizar.ts`, `solicitudes.ts` y `orquestador.ts`, `actions.ts` y `[id]/page.tsx` de Cotización, `src/lib/conectores/registro.ts` (+ test en `canales.test.ts`), `src/lib/cotizacion/orquestador.ts` (+ test) |

**Paso 1. Migración `0030_cotizacion_conectores`** (solo agrega, generada con `drizzle-kit generate`):
- en `cotizacion_envios`: `canal_usado` (texto: `api`, `portal` o `correo`; null mientras no salió), `intentos` (JSON, `[]` por defecto: canal, resultado, código, dato pedido, detalle y fecha; el tipo es `IntentoEnvio` en `schema.ts`), `numero_compania` y `ultimo_error`;
- la tabla compartida `conector_companias` (compañía, `canales` en orden, `org_id`, `producer_id`), única por compañía y alcance (`NULLS NOT DISTINCT`). Sin fila se usan todos los conectores registrados; con la lista vacía, solo correo o carga manual.

**Paso 2. El orden de canales:**
- `ordenarCanales()` y `ejecutarConCanales()` reciben el orden de la compañía: solo esos canales y en ese orden. Una lista vacía deja solo el canal manual. `canalesValidos()` limpia lo guardado (sin repetidos ni valores desconocidos).
- `ejecutarEnCompania()` suma la opción `canales`. Si no se pasa, lee la fila de la compañía en `conector_companias` (`canalesDeCompania()`, con el mismo alcance que la salud); sin fila, API → portal → archivo, como hasta ahora. La tabla es compartida: también la respeta el Validador.
- Una compañía sin conectores registrados vuelve enseguida como manual, sin consultar la base (en producción no hay ninguno).
- Tests: 11 nuevos en `canales.test.ts` y `ejecutar.test.ts` (este con la auditoría y la tabla simuladas).

**Paso 3. El orquestador:**
- **Autorizar:** "Aprobar y cotizar" (en Contactos) o "Cotizar automáticamente" al crear la solicitud llaman a `autorizarCotizacion()`. Deja el evento `cotizacion_autorizada` y encola un `cotizacion:cotizar_envio` por cada envío que no salió por ningún canal y cuyo correo no se omitió. Los correos siguen esperando su aprobación, uno por uno. El trabajo arma la autorización con la solicitud del envío, así no puede cotizar otra.
- **`cotizar_envio`** llama a `ejecutarEnCompania("cotizar")` con el orden de la compañía y aplica lo que vuelve (`decidirCotizacion()`, pura):
  - **cotizada:** el resultado entra **sin confirmar** con el formato de la carga manual (prima total = premio, prima neta, impuestos, moneda, franquicia, vigencia, coberturas y la validez en condiciones). El correo pendiente pasa a omitido ("No hace falta");
  - **pendiente:** el envío queda `enviado` con `numero_compania`, y `cotizacion:consultar_cotizacion` lo consulta por el mismo canal el día que da la estrategia de seguimiento (días hábiles de la provincia). Si sigue pendiente o la consulta falla, vuelve a consultar; al llegar al máximo de seguimientos pasa a `requiere_atencion`. El cron de seguimientos no lo toca (sin `proximo_seguimiento`);
  - **rechazada:** el envío queda `rechazado`, con el motivo en `intentos` y en el evento;
  - **`requiere_dato`:** `requiere_atencion` con la pregunta. En Contactos aparece "Tu respuesta" y "Responder y volver a cotizar": se guarda en `datos_riesgo` con el campo que pidió la compañía y se encola otro `cotizar_envio`. La respuesta no va a los eventos;
  - **sin conector, o fallan todos:** queda el borrador de correo (ya existía), `ultimo_error` dice qué pasó y el evento lo cuenta ("El portal de Federación Patronal no está disponible; se preparó el correo para aprobar."). La salud la actualiza `ejecutarEnCompania()`.
- **Base común:** `ErrorConector` y `requiere_dato` suman `campo` (el nombre del dato en el riesgo de UNIQO). `SimuladaPortal` pide `uso`.
- **Pantalla:** Contactos muestra el estado de cada compañía en palabras ("Cotizando por conexión directa o portal…", "Cotizó por portal · Falta tu confirmación", "Pedida por conexión directa", "Rechazada" con el motivo) y el número de la compañía como folio. Se actualiza sola mientras cotiza. En la Configuración, la casilla se llama "Cotizar automáticamente" y dice qué hace.
- **Sin IA:** lo que devuelve un conector ya viene normalizado por la interfaz común, así que se pasa a `cotizacion_resultados` con código, sin IA.
- Tests: 26 nuevos en `orquestador.test.ts`.

**Paso 4. `CONECTORES_SIMULADOS_FORZAR`** (solo con `CONECTORES_SIMULADOS=1`), por ejemplo `Federación Patronal=falla;Rivadavia=dato`. Por compañía, sin distinguir mayúsculas ni acentos, y varios valores separados por coma:
- `falla`: el portal está siempre fuera de servicio (`no_disponible`);
- `dato`: el portal pide el uso del vehículo mientras la solicitud no lo traiga, y no falla por azar;
- `ok`: el portal nunca falla ni pide datos por azar;
- `dos_pasos`: la conexión directa da un número y la cotización llega al consultarla.

Lo que no se entiende se ignora. Afecta a los conectores simulados de esa compañía para todos los agentes. Para que el portal sea el que cotiza, la compañía tiene que tener el portal primero en `conector_companias` (sin fila, la conexión directa va antes y responde ella). Tests: 2 nuevos en `canales.test.ts`.

**Paso 5. El correo aprobado, por la salida común:**
- "Aprobar" (en el detalle o en la lista) marca el borrador como aprobado una sola vez y crea un mensaje `aprobado` en `mensajes` (agente `cotizacion`, referencia `cotizacion:envio:<id>`, para el primer contacto de la compañía con un correo válido). Sale con `enviarMensaje()` de `src/agentes/envio.ts`, como los de Cobranza y Siniestros.
- **Si sale:** el envío pasa a `enviado` (o suma el seguimiento, y al máximo pasa a `requiere_atencion`), con `canal_usado = correo`, el próximo seguimiento por días hábiles y el evento "Salió el correo a … desde tu correo conectado".
- **Si no sale** (sin el correo de la cuenta conectado, o sin el contacto de la compañía): queda aprobado y sin enviar. `ultimo_error` dice por qué y qué hacer ("No salió: tu correo no está conectado (conectalo en Configuración → Conexiones). Después tocá “Enviar ahora”."), sin próximo seguimiento (así el cron no prepara otro) y con el evento `correo_sin_enviar`. En Contactos dice "Correo aprobado, sin enviar" con el motivo, y en Borrador "Aprobado · sin enviar" con el botón **Enviar ahora**, que reintenta el mismo mensaje.
- Ya no hay "referencia simulada" ni "Aprobado · simulado": se borró el adaptador falso `src/conexiones/cotizacion.ts`. Aprobar u omitir desde el detalle vuelve al detalle.
- Tests: 3 nuevos en `correo.test.ts` (destinatario, motivo y estado después de enviar).

**Paso 6. El webhook de la v1:** se borró `/api/agentes/cotizacion/resultado` y `COTIZACION_WEBHOOK_SECRET` (del `.env.example` y de los comentarios). Lo reemplazan los conectores. `registrarResultadoCotizacion()` sigue aceptando respuestas sin confirmar de la IA y de los conectores. Si la variable está cargada en Vercel, se puede borrar: ya nada la lee. El README de Cotización quedó al día con los pasos 3 a 6.

### Cierre de la Fase 2 (30/10/2026)
**Arreglos que salieron de la prueba** (con la app compilada):
- **Con más de 5 compañías, la sexta esperaba al cron del día siguiente:** el despacho al terminar la request procesa hasta 5 trabajos. Ahora `despacharCotizaciones(pedidos)` despacha una vuelta por pedido; cada vuelta toma de a un trabajo (`FOR UPDATE SKIP LOCKED`), así las compañías se cotizan en paralelo y ninguna se queda.
- **La cotización en dos pasos no se podía consultar desde el cron:** Next carga el registro de conectores una vez para las acciones y otra para las rutas, y la conexión directa simulada guarda en memoria. El orquestador lo manejó bien (dejó "no encontró el pedido", sumó la consulta y reprogramó la siguiente), pero la simulación no servía. Las compañías simuladas ahora se comparten por `globalThis` dentro del proceso (solo con `CONECTORES_SIMULADOS=1`). Test nuevo en `canales.test.ts`.
- **La columna Borrador quedaba fuera de la tarjeta** a 1440 px (ya pasaba antes, con los estados nuevos se notaba más): ahora va después de Estado, así "Aprobar" y "Omitir" se ven sin desplazar. Se sacó la columna Canal: el estado ya lo dice ("Cotizó por portal").
- **Los tipos de evento técnicos** que se ven en Actividad reciente: `conector_fallo` pasó a `paso_a_correo` y `sin_conexion` a `solo_correo`.
- **La nota de la solicitud** decía "El agente está cotizando…" aunque ya hubiera terminado: ahora dice "Aprobada para cotizar con las compañías conectadas. Los correos esperan tu aprobación." (cambio de texto, después de la última corrida).

**Pruebas:**
- `npm test`: pasan 555 de 560 (los 5 que fallan son los de antes: `catalogo.test.ts`, `menu.test.ts` y `siniestros.test.ts`). La 2c suma 42 tests.
- `npm run lint`: sin errores (las 3 advertencias viejas). `npm run build`: OK.
- `npm run test:e2e`: **pasa entero** (23 pasos) contra Postgres 18.6 en Docker recién sembrado, con la app compilada, `CONECTORES_SIMULADOS=1` y sin `ANTHROPIC_API_KEY`. Corrió tres veces, la última con el código final.
- **Criterios 11, 12 y 13 con la app compilada** (recorrido con Playwright fuera del repo, sobre la misma base después del E2E):
  - **Preparación:** `conector_companias` con Sancor `{api}`, Federación Patronal `{portal}`, La Segunda `{}` (solo correo), Mapfre `{portal}`, Rivadavia `{portal}` y San Cristóbal `{api}`; un contacto para La Segunda; `CONECTORES_SIMULADOS_FORZAR=Federación Patronal=ok;Mapfre=falla;Rivadavia=dato;San Cristóbal=dos_pasos`.
  - Una solicitud de Flotas con las 6, creada desde "Nueva solicitud". **Sin aprobar no hay ningún pedido** en la cola. "Aprobar y cotizar" encola 6 y la pantalla muestra "Esperá la cotización automática" hasta que terminan.
  - **Criterio 11:** Sancor cotiza por conexión directa y Federación Patronal por portal, solas y **sin confirmar**, con prima total, prima neta, impuestos, franquicia, vigencia y validez. La Segunda no tiene canales: deja el borrador ("No hay conexión automática disponible con La Segunda: queda el correo para aprobar.") y `intentos = []`. Se confirman Sancor y Federación Patronal, se carga a mano la de La Segunda (lo que respondería por correo) y **las tres quedan en el mismo comparativo con el mismo formato**; "Mejor precio" va a la menor prima total.
  - **Criterio 12:** el portal de Mapfre falla. El envío sigue `pendiente` con el borrador para aprobar, `ultimo_error` "El portal de Mapfre no está disponible.", el intento en `intentos`, el evento "…; se preparó el correo para aprobar.", una fila de error `no_disponible` en `conector_llamadas` (con el envío como entidad) y `conector_salud` del portal de Mapfre con el último error.
  - **Criterio 13:** el portal de Rivadavia pide el uso del vehículo. El envío pasa a `requiere_atencion` con la pregunta y el formulario "Tu respuesta para Rivadavia". Al responder, la respuesta queda en `datos_riesgo.uso`, se reintenta solo y Rivadavia cotiza por portal (`intentos`: `requiere_dato` y `cotizada`). La respuesta no aparece en los eventos, la actividad ni el log.
  - **Dos pasos:** San Cristóbal da un número (`SC-COT-…`, en la columna Folio), queda "Pedida por conexión directa" sin próximo seguimiento, y la consulta se programa para el 04/11/2026 (3 días hábiles desde el viernes 30/10). Adelantada a mano y corrida por el cron de la cola, cotiza sin confirmar.
  - **Correo sin Gmail:** aprobar el de La Segunda lo deja "Correo aprobado, sin enviar" con "No salió: tu correo no está conectado (conectalo en Configuración → Conexiones). Después tocá “Enviar ahora”." Hay un solo mensaje `aprobado` en `mensajes`, para el contacto de La Segunda y sin `enviado_el`. "Enviar ahora" reintenta ese mismo mensaje y vuelve a avisar.
  - **Cotizar automáticamente:** prendido, una solicitud nueva con Sancor y La Segunda ya cotiza con Sancor al crearse (evento del agente) y La Segunda espera su correo.
  - En el log del servidor no hay errores ni datos del asegurado.

**Para repetirla:** como en "Prueba contra Postgres 18.6" (más abajo), con `CONECTORES_SIMULADOS=1` en el build y el `next start`. Después del E2E, cortar el servidor, cargar las filas de `conector_companias` de arriba y volver a levantarlo con `CONECTORES_SIMULADOS_FORZAR`. Ojo: `npm run build` corre `preparar-db` contra la `DATABASE_URL` que tenga el entorno.

**Para Julian:** si `COTIZACION_WEBHOOK_SECRET` está cargada en Vercel, se puede borrar (ya nada la lee). Para que una compañía use un canal automático en producción hacen falta su conector real y su fila en `conector_companias`; sin conectores, todo sigue por correo como hasta ahora.

**Prueba del paso 1:** `db:preparar` desde un worktree de `main` contra Postgres 18.6 en Docker (29 migraciones, la cartera de ejemplo y 16 envíos). Después, `db:preparar` desde esta rama: 31 migraciones, los 16 envíos con el mismo hash de sus columnas de antes, `intentos = []` y lo demás en null, y `conector_companias` vacía.

## Fase 1 — Arreglos (30/10/2026, cerrada)
Sin migraciones. Rama `feat/cotizacion-v2-arreglos`.

**Cierre:**
- `npm test`: pasan 497 de 502. Los 5 que fallan son los de antes (`catalogo.test.ts`, `menu.test.ts` y `siniestros.test.ts`). Hay 23 tests nuevos.
- `npm run lint`: sin errores (las 3 advertencias viejas).
- `npm run build`: OK.
- `npm run test:e2e`: **pasa entero** (23 pasos, con los 8 y 11 de Cotización). Corrió contra Postgres 18.6 recién sembrado y la app compilada con `CONECTORES_SIMULADOS=1`, sin `ANTHROPIC_API_KEY` ni canales.
- **Prueba de los arreglos 1, 3 y 5 con la app compilada:** ver "Prueba de la fase 1".

| # | Arreglo | Estado | Archivos |
|---|---|---|---|
| 1 | La IA no da nada por cotizado sin tu confirmación; botón "Confirmar"; "Mejor precio" solo con confirmadas | Hecho | `src/lib/cotizacion.ts` (+ test), `src/agentes/cotizacion/solicitudes.ts`, `src/lib/ia/cotizacion.ts`, `src/lib/datos-agentes.ts`, `actions.ts`, `page.tsx`, `[id]/page.tsx` y `exportar/route.ts` de Cotización |
| 2 | Redirect dentro del `try` | Hecho | `actions.ts` y `configuracion/actions.ts` de Cotización |
| 3 | "Marcar completada" la saca de Activas | Hecho | `src/lib/cotizacion.ts` y `metricas.ts` (+ tests), `src/lib/datos.ts`, `datos-dashboard.ts`, `datos-agentes.ts`, `page.tsx`, `exportar/route.ts` y `agentes.css` |
| 4 | Correo con el productor, la organización e `instrucciones_cuerpo` | Hecho | `src/lib/cotizacion/correo.ts` (+ test) y `src/agentes/cotizacion/solicitudes.ts` |
| 5 | Feriados trasladables, días puente y hora del próximo seguimiento | Hecho | `src/lib/cotizacion/seguimientos.ts` (+ test nuevo) y `actions.ts` de Cotización |
| 6 | Porcentaje por envíos cerrados y paquete por nombre | Hecho | `src/lib/cotizacion.ts` (+ test), `src/lib/datos-agentes.ts` y `[id]/page.tsx` |
| 7 | Sacar el texto técnico de la pestaña Agente | Hecho | `[id]/page.tsx` |

**1. Lo que lee la IA espera tu confirmación.**
- `registrarResultadoCotizacion()` separa dos casos:
  - **Lo que carga el productor** queda confirmado, entra en la comparativa y da el envío por `cotizado`, como antes.
  - **Lo que lee la IA o trae el simulador** queda sin confirmar en `cotizacion_resultados`. No toca el JSON viejo (`cotizaciones`), no cambia el estado del envío y solo frena los seguimientos de esa compañía (ya respondió). El evento es `cotizacion_sin_confirmar` ("La IA leyó la respuesta de X. Falta que el productor la confirme."), y ya no "cargó y confirmó".
  - **Si ya había una respuesta confirmada** de esa compañía, la de la IA no la pisa: queda el evento `cotizacion_no_aplicada`, y el aviso le dice al productor dónde está lo que leyó.
- **Confirmar:** `confirmarResultadoCotizacion()` es la fila "Tu revisión" del comparativo. Recién ahí el envío pasa a `cotizado` y la respuesta entra en la lista (evento `cotizacion_confirmada`).
- **Funciones puras con tests** (`src/lib/cotizacion.ts`):
  - `mejorResultadoConfirmado()`: "Mejor precio" del detalle y de la propuesta;
  - `soloConfirmadas()`: la lista, sus tarjetas y su exportación dejan como pendiente el precio de una respuesta sin confirmar, también si es de antes de este arreglo;
  - `agregarRespuesta()`: la comparativa, el estado y la nota al confirmar.
- **La extracción** devuelve qué pasó (`sin_confirmar`, `ya_confirmada` o `sin_precio`), y el detalle muestra un aviso para cada caso.
- **Queda igual:** el webhook de la v1 (`/api/agentes/cotizacion/resultado`) sigue registrando como confirmado lo que manda un portal. **Para la Fase 2:** cuando la respuesta venga de un conector, decidir si entra sin confirmar. (Se decidió sin confirmar, y el webhook se sacó en la 2c.)

**2. Redirect dentro del `try`.** `redirect()` lanza un error propio de Next, y el `catch` lo convertía en otro aviso.
- **`aprobarEnvioCotizacion()`:** ahora busca el envío y comprueba el borrador antes del `try`. "Borrador no disponible" llega como tal, y no como "No pudimos aprobar".
- **`importarAseguradorasCotizacion()`** tenía el mismo patrón: un archivo que no era `.xlsx` ni `.csv` redirigía dentro del `try`. Como el `catch` mandaba al mismo aviso, no se notaba. Ahora la extensión se revisa antes.
- **Revisadas y bien:** el resto de las acciones de Cotización y de su configuración, y las que crean solicitudes desde un lead o un asegurado. Redirigen en el `catch` o después del `try`.

**3. "Completada" cuenta como cerrada.** "Marcar completada" sigue llenando solo `completado_el`, sin tocar el estado guardado.
- **Funciones puras** en `src/lib/cotizacion.ts`, con tests:
  - `estadoVisible()` devuelve "completada" salvo que la solicitud esté ganada o perdida (esas se muestran como tales);
  - `estaCerrada()` cubre ganada, perdida y completada.
- **Dónde se usa:**
  - las tarjetas Activas y "Requieren tu atención" (`resumenCotizacion()`);
  - la lista: pastilla gris "Completada", filtro con la opción "Completada" y "Solicitud cerrada" en lugar de cargar precio;
  - la exportación de la lista (estado `completada`);
  - las detenidas (`solicitudesDetenidas()`);
  - los contadores de "requiere atención" del menú (`src/lib/datos.ts`) y del inicio (`datos-dashboard.ts`).
- **Queda igual:**
  - el selector "Actualizar" de la lista conserva los 6 estados guardados;
  - la tasa de cierre ganada sigue contando ganadas sobre ganadas más perdidas (una completada no dice si se ganó);
  - el detalle permite cargar una respuesta tardía;
  - no hay cómo reabrir una completada. Si hace falta, va en la Fase 4.

**4. El correo usa los datos de la cuenta.** `armarBorradorSolicitud()` (`src/lib/cotizacion/correo.ts`, pura y con tests) arma el asunto y el cuerpo de cada borrador.
- **`{productor}` y `{organizacion}`:** salen de los ajustes de la cuenta, con los mismos valores que muestra `obtenerCuenta()`, y ya no de "Productor" y "UNIQO" fijos. Si falta uno, se usa el otro.
- **El cuerpo** es la plantilla, después `instrucciones_cuerpo` de la configuración y al final las instrucciones de la aseguradora, sin párrafos vacíos. Las variables se reemplazan en todo el texto.
- **De paso:** sin clave de productor, el asunto ya no termina en " – ".

**5. Feriados y próximo seguimiento** (`src/lib/cotizacion/seguimientos.ts`, con `seguimientos.test.ts` nuevo).
- **La regla, verificada el 30/10/2026:**
  - **Ley 27.399:** los trasladables son el 17/6, el 17/8, el 12/10 y el 20/11 (art. 1). El art. 6 los mueve así: martes o miércoles, al lunes anterior; jueves o viernes, al lunes siguiente.
  - **Decreto 614/2025:** no cambia esa regla. Agrega que, si caen sábado o domingo, la Jefatura de Gabinete *puede* moverlos al lunes siguiente o al viernes anterior. No es automático: cada traslado sale por resolución.
- **En el código:**
  - `trasladarFeriado()` aplica el art. 6;
  - `feriadosNacionalesArgentina()` junta los inamovibles, los trasladables ya movidos, Carnaval, Viernes Santo y `DIAS_NO_HABILES_POR_ANIO`.
- **`DIAS_NO_HABILES_POR_ANIO`** es la lista en código de lo que fija el Gobierno cada año:
  - **2024:** puente 1/4, 21/6 y 11/10 (Decreto 106/2023);
  - **2025:** puente 2/5, 15/8 y 21/11 (Decreto 1027/2024), más el 12/10, domingo, que pasó al viernes 10 (Resolución 139/2025);
  - **2026:** puente 23/3, 10/7 y 7/12 (Resolución 164/2025), más el lunes 9/11, feriado nacional por la visita del papa (Decreto 1103/2026).
- **Lo que queda afuera de la lista:**
  - el 10/11/2026 (solo Córdoba y CABA) y el 11/11/2026 (solo la provincia de Buenos Aires), del mismo Decreto 1103/2026, porque la lista es nacional;
  - el Jueves Santo, que es no laborable y no feriado.

  Ver "Para decidir antes de la fase 2".
- **Para mantener:** los puente de 2027 no salieron todavía. Hay que sumarlos apenas se publiquen; la ley pide fijarlos 50 días antes de fin de año, o sea hacia el 11/11/2026. Mientras tanto, 2027 aplica la ley sola.
- **Próximo seguimiento:** `calcularProximoSeguimiento()` cambia en tres cosas:
  - cuenta desde el día en Argentina (`diaEnArgentina()`), no desde la fecha en UTC;
  - usa los feriados del año y del siguiente (antes, con `getFullYear()`, un plazo que cruzaba el 1 de enero no salteaba el feriado);
  - guarda el día a las 00:00 de Argentina, así el cron de las 10 de ese día lo toma. Antes lo guardaba a las 12 y salía un día hábil tarde.

  La acción de aprobar ya no le pasa los feriados.
- **Tests:**
  - la regla de traslado;
  - las listas de 2024 a 2027;
  - el día argentino (jueves 23:30 → martes, y no miércoles);
  - la hora que toma el cron;
  - el 9/11, el 23/11 y el cruce de año.

**6. Detalle.**
- **El porcentaje** del panel sale de `porcentajeCerrados()` (pura, con test): envíos `cotizado`, `rechazado` y `error` sobre el total. Una respuesta sin confirmar no suma, porque el envío no pasa a `cotizado` hasta que se confirma.
- **El paquete** aparece por su nombre: `obtenerDetalleCotizacion()` trae `cotizacion_paquetes` de los envíos.

**7. Pestaña Agente:** se sacó "La extracción con IA se habilita cuando elijas el enfoque de IA". Queda "PDF, Word, Excel o imágenes · hasta 25 MB."

### Prueba de la fase 1 (30/10/2026)
Igual que la de la auditoría: Docker descartable (`postgres:18.6`), `db:preparar` desde cero, `next start` con `CONECTORES_SIMULADOS=1` y sin `ANTHROPIC_API_KEY`. Corrió después del E2E entero, sobre la misma base, con un recorrido de Playwright fuera del repo.

**Arreglo 1.**
- **Sin clave de IA:** la respuesta "leída por la IA" se registró con `registrarResultadoCotizacion()` (`confirmado: false`, `actor: "ia"`), el mismo llamado que hace `extraerCotizacionPdfIA()` después de leer el PDF. Fue la de Sancor en la 1041, $ 8.000.000.
- **Antes de confirmar:**
  - en la base, el envío sigue `enviado` y el JSON de la lista no cambia;
  - la lista dice "2 de 3 respondieron", el mejor precio sigue en Mapfre ($ 8.640.000) y el panel de Sancor avisa "Llegó una respuesta que falta confirmar";
  - en el detalle, "Mejor precio" queda en Mapfre, Sancor muestra "falta tu confirmación" y el porcentaje es 67 %;
  - el evento dice "La IA leyó la respuesta de Sancor. Falta que el productor la confirme.", sin "cargó y confirmó".
- **Respuesta sobre una ya confirmada:** otra respuesta de la IA para Mapfre, que estaba confirmada, devuelve `ya_confirmada` y deja los $ 8.640.000.
- **"Confirmar":**
  - en la base, el envío pasa a `cotizado`, el resultado a `confirmado` y la solicitud a `lista`;
  - en el detalle, "Mejor precio" pasa a Sancor y el porcentaje a 100 %;
  - en la lista, "3 de 3" y el mejor precio en Sancor, $ 8.000.000.

**Arreglo 3.**
- **"Marcar completada" en la 1040**, que estaba en "Requiere tu atención":
  - Activas pasa de 4 a 3 y "Requieren tu atención" de 1 a 0;
  - el contador del menú baja de 1 a 0;
  - la pastilla dice "Completada";
  - en la base sigue `atencion`, con `completado_el`.
- **El filtro** "Completada" trae la 1040 y la 1042, que había completado el E2E. "Requiere tu atención" ya no trae la 1040.
- **Las detenidas:** con la 1040 y la 1043 sin movimiento hace 5 días, solo aparece la 1043.

**Arreglo 5.**
- **Aprobar** dos borradores de la 1043 el viernes 30/10 deja el próximo seguimiento el miércoles 4/11 a las 00:00 de Argentina (3 días hábiles).
- **El cron** corrió a las 04:27 de Argentina; desde las 00:00 se comporta igual que a las 10. Un envío con el seguimiento de hoy a las 00:00 (como guarda el código nuevo) y otro a las 12:00 (como guardaba el viejo): el cron preparó el borrador del primero y no tocó el segundo (`{"revisados":1,"borradores":1}`). Ese segundo es el que salía un día hábil tarde. Sin secreto, el cron responde 401.
- **Lo que no se puede probar con la app compilada:** el reloj del servidor no se cambia. El día argentino a las 23:30 y el cruce de año están cubiertos por `seguimientos.test.ts`.

**De paso:**
- **Arreglo 4:** la 1043, creada por el E2E, tiene el asunto "SOLICITUD – Flota – Logística Atlántica SRL – La Segunda", sin guion final, y el cuerpo "Productor: HR Productores. Organización: HR Productores.". La cuenta de prueba no tiene nombre de productor.
- **Arreglo 6:** con un paquete "Flota Plus" asignado, Contactos lo muestra por su nombre.
- **El log de `next start`** no tiene errores de Cotización ni secretos. Sí tiene avisos de `new Date()` al prerenderizar en Asegurados, Validador, Cobranza, Siniestros y Conciliador. Son de antes y no son de esta fase.

## Estado de la auditoría (29/10/2026)
**Auditoría y plan hechos (29/10/2026).** Esa sesión no cambió código: solo este archivo.
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
- **Cron:** `/api/cron/cotizacion` (seguimientos como borradores). Webhook `/api/agentes/cotizacion/resultado` (de la v1; se sacó en la 2c).

## Hallazgos de la lectura (29/10/2026)
- La migración `0014` siembra dos tandas de aseguradoras: quedan 8 filas para 7 compañías, con Rivadavia dos veces ("Seguros Rivadavia" y "Rivadavia"). Las de la primera tanda tienen 11 ramos y las que solo están en la segunda (Rivadavia y Mapfre), 7.
- `cotizacion_envios.canal` es `correo | portal | ambos`: no existe `api` ni un orden de canales, ni los intentos por canal, el número de cotización de la compañía o el último error.
- El simulador de respuestas no anda con la app compilada: exige `NODE_ENV !== "production"`, y `next start` corre en producción.
- La extracción con IA de un PDF registra el resultado sin confirmar, pero igual marca el envío como `cotizado`, lo suma a la comparativa de la lista y escribe "El productor cargó y confirmó el precio". **Arreglado en la Fase 1.**
- En `aprobarEnvioCotizacion` el `redirect` de "borrador no disponible" está dentro del `try`, así que se convierte en "No pudimos aprobar el borrador". **Arreglado en la Fase 1.**

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
  - ~~**El orquestador** (`src/lib/cotizacion/orquestador.ts`): no existe. Nada llama a `ejecutarEnCompania()`, no hay canal `api` o `portal`, no se pasa al canal siguiente y no se consultan las cotizaciones asincrónicas.~~ Hecho en la 2c.
  - ~~**`ia_trabajos`:** Cotización no encola nada.~~ Hecho en la 2a y la 2c.
  - **La normalización con IA** de lo que devuelve un conector o un correo.
  - **El cron no saltea feriados** (solo fines de semana, por el horario de Vercel).
  - **El simulador no anda con la app compilada** (`next start` corre con `NODE_ENV=production`), por eso el E2E no puede usarlo.
  - ~~**El correo aprobado no queda como borrador:** pasa por `src/conexiones/cotizacion.ts`, que inventa una "referencia simulada", y el envío queda como `enviado`. No usa la salida común (`src/agentes/envio.ts`) ni avisa que no hay correo conectado.~~ Hecho en la 2c.
  - La extracción desde el correo de la compañía.
- **Tests:** ninguno del cron ni de la aprobación.

## Criterios de aceptación (sección 4 de la spec)
| # | Criterio | Estado | Cómo se comprobó |
|---|---|---|---|
| 1 | 3 aseguradoras en Automotor → 3 envíos `pendiente` y 3 borradores según la plantilla | Hecho. Los dos detalles ("Productor" y "UNIQO" fijos, sin `instrucciones_cuerpo`) se arreglaron en la Fase 1 | Contra Postgres con la app compilada (pasos 4 y 5 de la prueba) |
| 2 | Borrador sin aprobar → no se registra el envío | Hecho | Contra Postgres (paso 6) |
| 3 | "Cada 3 días hábiles" con feriado en medio | Hecho | `seguimientos.test.ts`: trasladables, días puente, el 9/11/2026 y el cruce de año, más la hora que toma el cron (Fase 1); Jueves Santo y feriados de la provincia (2a) |
| 4 | Máximo de seguimientos → no hay más y queda `requiere_atencion` | Hecho, sin test de Vitest | Contra Postgres con el cron (paso 8) |
| 5 | Dos cotizaciones → "Mejor precio" en la menor prima total | Hecho; desde la Fase 1, solo entre las confirmadas | Con la app compilada sobre la 1042 (paso 2) |
| 6 | Propuesta en PDF con la marca y en borrador | Parcial: borrador sí; la marca es solo el nombre, sin logo ni acentos | Paso 11 del E2E |
| 7 | Métricas contra un fixture calculado a mano | Hecho | `metricas.test.ts` |
| 8 | Sin clave o con la IA apagada funciona, se ocultan los controles y no hay llamadas | Hecho, con `ia_configuracion` desde la 2a. También sin cuota | Con la app compilada sin clave (paso 3 y E2E); apagada y sin cuota, en "Prueba de la 2a" |
| 9 | Cada respuesta de IA queda con modelo, tokens y costo, y nada se envía sin aprobación | Hecho (2a): cada intento queda en `ia_uso` y cuenta para el tope; lo leído espera la confirmación y el correo mejorado sigue pendiente de aprobación | "Prueba de la 2a", con una API de Anthropic falsa |
| 10 | Ninguna credencial en texto plano | Hecho, en `credenciales_portal` desde la 2b | "Prueba de la 2b": la clave no está en la base ni en el log, ni vuelve a la pantalla |
| 11 | API + portal + correo → las dos primeras cotizan solas y las tres terminan en el mismo comparativo | Hecho (2c) | Con la app compilada: Sancor `{api}`, Federación Patronal `{portal}` y La Segunda `{}` en `conector_companias` ("Cierre de la Fase 2"); `orquestador.test.ts` |
| 12 | Si el portal falla → borrador de correo, error registrado y salud actualizada | Hecho (2c) | Con la app compilada y `Mapfre=falla`: borrador, `ultimo_error`, evento, `conector_llamadas` y `conector_salud` |
| 13 | El portal pide un dato → `requiere_atencion` con la pregunta, y al responder se reintenta | Hecho (2c) | Con la app compilada y `Rivadavia=dato`: la respuesta queda en `datos_riesgo` y se reintenta solo |
| 14 | Ningún conector emite, acepta ni firma | Hecho por la base común | `src/lib/conectores/tipos.ts` no tiene esas acciones; `canales.test.ts` |
| 15 | E2E: crear → aprobar → simular → comparar → propuesta → completar | **Parcial** | El paso 8 crea desde un lead; el 11 hace la propuesta y completa la 1042 sembrada. Faltan aprobar, simular y comparar |

## Qué no sigue la base común y qué cambiar
| Tema | Hoy | Base común | Qué cambiar |
|---|---|---|---|
| **IA** | `generar()` de `ProveedorClaude` con texto libre, `JSON.parse` a mano, sin modelo por tarea (usa `ANTHROPIC_MODEL_COTIZACION` o Haiku) | `ejecutarIA()`: modelo por tarea, salida estructurada con zod, reintento con Sonnet, `ia_uso` y la cuota de USD 20 | Pasar las 3 operaciones a `ejecutarIA()` con esquemas zod: `extraer_cotizacion` (tarea `extraer`), `redactar_correo` y `chat` (tarea `explicar`). Sacar el uso de `generar()` |
| **Interruptor de IA** | `org_features.cotizacion_ia`, aparte | `ia_configuracion` (en producción, la fila `*`/`*` activa con tope) | Leer `estadoIA({ agente: "cotizacion", … })`. Al migrar, la IA de Cotización queda prendida en producción dentro del tope: hay que decidirlo (ver el plan) |
| **Registro del costo** | `cotizacion_borradores_ia` y `cotizacion_eventos` | `ia_uso` (sin contenido) | El costo va a `ia_uso`. `cotizacion_borradores_ia` sigue guardando el texto para revisar; las columnas de costo quedan como históricas |
| **Credenciales** | `conexiones.datos.credencialesCifradas`, con `COTIZACION_CREDENTIALS_KEY` | `credenciales_portal` (`src/lib/conectores/credenciales.ts`), con `CREDENCIALES_PORTAL_KEY` | Guardar con `guardarCredencial()`. Migrar las que haya en `conexiones.datos` (en producción hay que contarlas antes; las dos claves tienen el mismo valor, así que se pueden descifrar y volver a cifrar) |
| **Compañías** | `adaptadorSalidaCotizacion` simulado; `canal` = `correo/portal/ambos` | `ejecutarEnCompania()` con permisos (`cotizar` autorizado al aprobar la solicitud), orden `api → portal → archivo/manual`, `conector_llamadas` y `conector_salud` | **Hecho en la 2c:** el orquestador llama `ejecutarEnCompania("cotizar")` con la autorización de la solicitud y el orden de `conector_companias`. `canal` queda, pero ya no decide nada |
| **Trabajos** | Todo en la acción del servidor | `ia_trabajos` con manejadores y `despachadorTrabajos` | **Hecho:** `cotizacion:extraer_respuesta` (2a), `cotizacion:cotizar_envio` y `cotizacion:consultar_cotizacion` (2c) |
| **Correo saliente** | La aprobación "envía" por un adaptador falso y marca `enviado` | La salida común (`src/agentes/envio.ts`), que solo sale con Gmail conectado y si no, avisa | **Hecho en la 2c:** sale por `enviarMensaje()`; sin el correo conectado queda aprobado y sin enviar, con el motivo y "Enviar ahora" |
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

## Plan propuesto (fases 1 a 3 hechas el 30/10/2026)
Cada fase cierra con `npm test`, lint, build, el E2E entero contra Postgres 18.6, commit y este progreso al día. Las migraciones solo agregan y se prueban antes sobre una base con los datos de `main`. Nada se envía de verdad: conectores simulados, correos como borradores y, sin `ANTHROPIC_API_KEY`, el agente funciona igual.

| Fase | Qué | Sesiones | Criterios |
|---|---|---|---|
| 1 | Arreglos de lo que ya hay | 1 corta | 1, 3, 5 y 9 |
| 2 | **Alinear con la base común: IA, credenciales y conectores** | 2 | 9 a 14 |
| 3 | Pantalla común Configuración → Conexiones | 1 | 10 |
| 4 | Lo que falta de las pantallas | 1 | 6 |
| 5 | Cierre: seed, E2E del flujo completo, README y PR | 1 | 15 |

### Fase 1 — Arreglos (sin migraciones) — hecha, ver arriba
- La extracción con IA no da el envío por `cotizado` ni lo suma a la lista hasta que el productor confirme. Botón "Confirmar" en la respuesta. "Mejor precio", solo entre las confirmadas.
- El `redirect` dentro del `try` de `aprobarEnvioCotizacion()`.
- **"Marcar completada"** saca la solicitud de Activas (cuenta como cerrada) sin tocar su estado viejo.
- El cuerpo del correo con el nombre del productor y de la organización de la cuenta, y con `instrucciones_cuerpo`.
- **Feriados:** sumar el 17 de junio y los trasladables, con tests. El próximo seguimiento, contado desde el día argentino y guardado antes de que corra el cron (no a las 12).
- El porcentaje del detalle, por envíos cerrados. El paquete, por su nombre.
- Sacar el texto "cuando elijas el enfoque de IA".

### Fase 2 — Alinear con la base común (IA, credenciales y conectores) — hecha, ver arriba
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
- **Migración** (solo agrega; quedó repartida en la `0029` de la 2a y la `0030` de la 2c):
  - en `cotizacion_envios`: `canal_usado` (`api`, `portal` o `correo`), `intentos` (JSON con canal, resultado y fecha), `numero_compania` y `ultimo_error`;
  - la tabla `conector_companias`;
  - la fila de `ia_configuracion` de 2a.

  `canal` (`correo`, `portal` o `ambos`) queda, pero ya no decide nada.
- **Para probarlo:** `CONECTORES_SIMULADOS_FORZAR` (por ejemplo, `Federación Patronal=falla;Rivadavia=dato`), para que los criterios 12 y 13 no dependan del azar.

### Fase 3 — Configuración → Conexiones (común a los 3 agentes) — hecha, ver arriba
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
5. **Respuestas de los conectores** (y del webhook de la v1): ¿entran sin confirmar, como desde la Fase 1 las que lee la IA, o confirmadas? Lo recomendado es que entren sin confirmar, así nada cuenta en el comparativo sin que lo revises.
6. **Feriados que no son nacionales:**
   - el 10/11/2026 es feriado solo en CABA y Córdoba, y el 11/11/2026 solo en la provincia de Buenos Aires (Decreto 1103/2026). Contarlos pide saber la provincia de la cuenta: sería una columna nueva, o sea migración de la Fase 2;
   - ¿el Jueves Santo (no laborable) cuenta como día hábil para los seguimientos? Hoy sí.

## Próximo paso exacto
**La Fase 3 está cerrada** (rama `feat/cotizacion-v2-conexiones`, PR #35, mergeado). **La Fase 4 está en curso** en `feat/cotizacion-v2-pantallas` (ver "Fase 4 — Lo que falta de las pantallas", arriba de todo, con su tabla de pasos). El paso 1 está hecho (commit propio). Siguiente: el **paso 2**, el detalle: en Contactos el próximo seguimiento (con la consulta programada de las que tardan), la columna Preguntas, Copiar y Excel (`exportar/[id]?vista=contactos`); en el panel "Requiere atención" con detalle, la persona de la configuración, los seguimientos activos, los archivos por compañía y paquete y "Mostrar más"; en Agente la línea de tiempo y el borrador al ejecutivo (decisión de Julian: al correo de Mi cuenta, por la salida común). Los pasos, en orden:
1. checklist del inicio con los 4 pasos de la spec y aviso "sin paquete configurado" en la nueva solicitud;
2. detalle: en Contactos, el próximo seguimiento, Copiar y Excel; en el panel, "Requiere atención" con detalle, los seguimientos activos y los archivos por compañía; en Agente, la línea de tiempo y el borrador al ejecutivo;
3. comparativo con las filas de la spec y la vista compacta o detallada;
4. ABM de Tipos de seguro y "Sugerir con IA" para la estrategia;
5. la bitácora con `cotizacion_eventos` y filtros, y las métricas medidas desde que salió el envío;
6. la propuesta con el logo de la cuenta y con acentos.

Sin push ni PR hasta que Julian lo diga.

Pendientes que no son de esta fase: Julian desactiva Rivadavia duplicada desde la Configuración de Cotización (desde la fase 3 las dos comparten la fila de canales de "Rivadavia"), y apenas se publiquen los días puente de 2027, sumarlos a `DIAS_NO_HABILES_POR_ANIO` en `src/lib/cotizacion/seguimientos.ts`.
