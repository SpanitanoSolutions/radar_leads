---
tipo: spec
proyecto: UNIQO (antes Radar Leads)
estado: borrador
creada: 2026-10-28
origen: video de demo del "Agente de Cotización" de Handle (usehandle.ai), grabado el 28/10/2026
---
# Agente de Cotización v2 — prompt para Claude Code

> Cómo usarlo: abrí Claude Code en el repo `SpanitanoSolutions/radar_leads` y pegale todo desde **"Prompt"** hasta el final, anexo incluido. El anexo explica qué muestra el video de referencia.

---

## Prompt

Sos el desarrollador de **UNIQO** (antes Radar Leads), un SaaS para productores asesores de seguros de Argentina, desarrollado por **Spanitano Solutions**. El repo es `SpanitanoSolutions/radar_leads`. La tarea es **evolucionar el Agente de Cotización** (`src/app/(app)/agentes/cotizacion`) hasta llevarlo al nivel funcional del producto de referencia descrito en el **Anexo**, adaptado al mercado argentino y a las reglas de UNIQO.

### 0. Antes de escribir código
1. Leé `README.md`, `docs/PLAN-cartera-y-agentes.md`, el esquema de Drizzle y todo lo que hoy existe del agente de Cotización (rutas, `src/lib/` y tests). Hoy ya tiene solicitudes de asegurados o leads, comparativas, bitácora y desempeño.
2. Escribí `docs/PLAN-cotizacion-v2.md` con:
   - una tabla **"ya existe / falta / cambia"** para cada funcionalidad del Anexo;
   - las migraciones nuevas;
   - las fases, en el orden de abajo.
   Mostrámelo y esperá mi OK antes de implementar.
3. Si una parte del Anexo choca con una regla de la sección 1, no la implementes: anotala en el plan como **pregunta abierta**.
4. Incluí en el plan la propuesta de enfoques de IA (ver sección 1).

### 1. Reglas de UNIQO que no se rompen
- **Código en español** (archivos, funciones, comentarios). La lógica va en funciones puras de `src/lib/`, con tests de Vitest al lado. CSS propio, sin Tailwind. Next.js App Router con Server Actions; el middleware vive en `src/proxy.ts`.
- **UI en español rioplatense con voseo**, sin jerga técnica. El usuario no es técnico y trabaja desde la computadora. Estilo: sidebar oscuro, contenido claro, tarjetas, un solo color de acento.
- **Nada sale solo:** ningún correo a una aseguradora, seguimiento o propuesta al cliente se envía sin la aprobación explícita del productor. Todo queda en la bitácora.
- **Compañías conectadas (modelo de producción).** En producción, los agentes van a acceder a las compañías para hacer su trabajo. Cotización usa la **misma capa de conectores que el Validador y Siniestros**: `src/lib/conectores/`, ver la sección 3 bis. Hoy los conectores son **simulados**, pero todo el flujo se construye como va a funcionar en producción, de modo que conectar una compañía real sea agregar una implementación. El correo saliente y WhatsApp también van detrás de adaptadores (`src/lib/canales/`), simulados por ahora.
- **Los agentes van a tener IA.** Está decidido (28 oct); lo que falta definir es **cómo**. Hasta ahora los agentes usaban solo reglas y plantillas. Mientras se define el enfoque:
  - Armá una capa `src/lib/ia/` con una interfaz de proveedor. Por defecto, Claude con `ANTHROPIC_API_KEY`. Ningún agente llama al SDK directo.
  - Usos en Cotización: chat con el agente, extracción de datos de PDFs y correos de las compañías, redacción de borradores, validación de lo pedido contra lo cotizado y "Sugerir con IA" para la estrategia de seguimiento.
  - **La IA propone y el productor aprueba:** nada sale solo.
  - **Las reglas deterministas siguen siendo la base y el respaldo.** Sin clave, con la IA desactivada para la organización o si el modelo falla, el agente sigue funcionando con reglas y plantillas.
  - La IA se activa por organización (`org_features`). Cada resultado de IA queda marcado en la bitácora, con modelo, tokens y costo estimado.
  - En el plan, proponé 2 o 3 enfoques con su costo estimado por solicitud. Por ejemplo: IA solo para extraer y redactar; agente con herramientas (tool use) sobre las funciones de `src/lib/cotizacion`; o Claude Agent SDK. Dejalo como **pregunta abierta** para que yo elija antes de la Fase 4.
- **Datos personales (Ley 25.326):** los datos del asegurado no van a los logs. Solo se mandan al modelo a través de la capa `src/lib/ia/` y con la IA activa para la organización. Nunca van a terceros fuera de esa capa ni de los adaptadores.
- **Multi-tenant en camino:** UNIQO va a ser Plataforma → Organización (agrupación o independiente) → Productor. Spec: `Specs/Arquitectura multi-tenant y empaquetado` en el vault.
  - Toda tabla nueva lleva `org_id` y `producer_id` (nullable mientras no exista la migración multi-tenant). Por ahora se rellenan con la organización y el productor por defecto.
  - La configuración del agente se resuelve en cascada: **plataforma → organización → productor**.
- **Migraciones:** numerá desde la última (`0010_cartera_y_agentes`). No mergees a `main` sin correr `npm test`, `npm run lint`, `npm run build` y el E2E contra una base local sembrada. Trabajá en la rama `feat/cotizacion-v2` y abrí un PR.

### 1 bis. Cómo trabaja el agente con compañías conectadas
> **Definición común:** la interfaz, los tipos de conector, los permisos (leer, cotizar, presentar, comprometer) y las tablas compartidas están en [[Radar Leads/Specs/Conectores de compañías]] (archivo `Conectores de compañías - spec común.md`). Si hay diferencias, manda esa spec.

**Capa compartida `src/lib/conectores/`** (si ya existe por el Validador, extendela; si no, creala acá y que los otros agentes la reutilicen):
- `ConectorCompania` declara su `tipo`: `api` (servicio web de la compañía), `portal` (agente con IA que navega el portal del productor con su credencial) o `archivo`. También declara sus **capacidades**: `cotizar`, `consultarCotizacion`, `obtenerCoberturas`, `obtenerEstadoCobranza`, `denunciarSiniestro`, `consultarSiniestro`, `subirDocumentos`. Cada agente solo usa las capacidades que la compañía tiene.
- Para Cotización:
  - `cotizar(solicitudNormalizada, coberturas[])` devuelve `{ estado, cotizaciones[], numeroCotizacion?, preguntas?[], error? }`;
  - `consultarCotizacion(numero)` devuelve el estado o el resultado de una cotización asincrónica;
  - `obtenerCoberturas(ramo)` devuelve el catálogo de productos y coberturas de la compañía, para mantener `cotizacion_paquetes` al día.
- **Credenciales** en `credenciales_portal` (compartida): cifradas con AES-GCM, nunca en logs, con estado y último uso.
- **Salud del conector:** último éxito, último error, credencial vencida o portal cambiado. Se ve en Configuración → Conexiones.

**Canal por compañía, con prioridad automática:** `api` → `portal` → `correo`. El orquestador de envíos (Fase 6) elige el mejor canal disponible para cada compañía. Si falla, **cae al siguiente** y lo registra (por ejemplo: "Portal de Sancor no respondió; se preparó el correo para aprobar").

**Qué hace la IA con compañías conectadas:**
- **Mapea la solicitud** al formulario o API de cada compañía. Cada una pide los datos con nombres, códigos y catálogos distintos (marca/modelo según tabla Infoauto, códigos de uso, zonas). La IA (Haiku 5.5) propone el mapeo, se valida con zod y se guarda por compañía para reutilizarlo.
- **Agente de portal** (Sonnet 5.5 con herramientas de navegador): entra, completa la cotización, descarga el PDF y devuelve el resultado. Puede **cotizar** pero **nunca emitir, aceptar ni firmar**. Si el portal pide un dato que no está en la solicitud, se detiene y la pasa a `requiere_atencion` con la pregunta.
- **Normaliza los resultados** de API, portal o PDF por correo al esquema de `cotizacion_resultados`, para que el comparativo sea igual venga de donde venga.
- **Explica el comparativo** y redacta la propuesta (como ya estaba definido).

**Aprobaciones en producción:**
- **Aprobar la solicitud** (con sus compañías seleccionadas) autoriza al agente a cotizar con esas compañías por cualquier canal. Con "Cotizar automáticamente" activo, se cotiza apenas se crea la solicitud.
- **Correos** a compañías: borradores para aprobar, como siempre.
- **Emitir una póliza** queda fuera de este proyecto. Cuando exista, requerirá aprobación explícita póliza por póliza.

**Simulación ahora:** implementá dos conectores falsos con datos realistas: `SimuladaApi` (responde al instante o en 2 pasos asincrónicos) y `SimuladaPortal` (responde con demora, a veces pide un dato extra y a veces falla). Así el E2E prueba el flujo de producción completo, incluido el paso al canal siguiente cuando uno falla.

### 2. Adaptación al mercado argentino
El producto de referencia es mexicano. Traducí así:

| En el video (México) | En UNIQO (Argentina) |
|---|---|
| RFC | CUIT / CUIL (validá el dígito verificador) |
| MXN o USD | ARS o USD |
| GNP, Qualitas, Banorte, AXA, Chubb, Mapfre, SMYN, Afirme, Inbursa… | Catálogo editable. Seed sugerido: Sancor, La Segunda, Federación Patronal, Rivadavia, San Cristóbal, Mercantil Andina, Allianz, Zurich, Meridional, Rus, Provincia Seguros, La Caja, Mapfre, Galeno, Experta ART |
| GMM (Gastos Médicos Mayores) | Salud / Accidentes Personales |
| Flotillas | Flotas (ramo prioritario de UNIQO) |
| Ramos: autos, casa, comercio, incendio, múltiple empresarial | Automotor, Flotas, Hogar / Combinado familiar, Integral de comercio, Incendio, RC, Caución, ART, AP, Vida, Salud |
| Paquetes AMPLIA / PREMIUM / Económico | Coberturas: RC, Terceros completo (B1), Terceros completo premium, Todo riesgo con franquicia, etc. Configurables por compañía |
| "SLIP" adjunto | Ficha / solicitud de cotización adjunta |
| "Clave de agente" | Código de productor ante cada compañía |
| País de feriados: United States | Argentina (feriados nacionales; días hábiles para los seguimientos) |
| Idioma de correos salientes: inglés | Español |

### 3. Funcionalidades, por fases
Cada fase cierra con tests, lint, build y una entrada en `README.md`.

#### Fase 1 — Modelo de datos
Tablas (los nombres pueden ajustarse a las convenciones del repo):
- `cotizacion_aseguradoras`: compañía, ramos, canales habilitados y su prioridad (`api` | `portal` | `correo`), referencia al conector, contactos (nombre, email, rol), código de productor, activa, asunto e instrucciones propias.
- `conector_mapeos` (compartida): compañía × ramo → mapeo de campos y catálogos (aprendido por IA y confirmado), con versión.
- `cotizacion_paquetes`: compañía × ramo → nombre de la cobertura, condiciones, deducible o franquicia, suma asegurada.
- `cotizacion_tipos_seguro`: ramo, descripción, sub-tipos.
- `cotizacion_config`: persona y voz, intervalo y estrategia de seguimiento, máximo de seguimientos, país de feriados, plantillas de asunto y cuerpo, instrucciones del cuerpo, cuenta saliente, cotización automática. Con `org_id` y `producer_id` para la cascada.
- `cotizacion_solicitudes`: asegurado o lead, ramo, tipo (`negocio_nuevo` | `renovacion`), nota, datos del riesgo (JSON validado por ramo), ejecutivo, estado y fechas. Si ya existe una tabla de solicitudes, extendela en lugar de duplicarla.
- `cotizacion_envios`: una fila por solicitud × aseguradora, con paquete, **canal usado** (`api` | `portal` | `correo`), intentos por canal, estado, número de cotización de la compañía, próximo seguimiento, cantidad de seguimientos, preguntas pendientes, último error y última actividad.
- `cotizacion_resultados`: por envío, prima neta, prima total, coberturas (JSON normalizado), gastos, impuestos y PDF.
- `cotizacion_archivos` (adjuntos de la solicitud y cotizaciones recibidas) y `cotizacion_eventos` (bitácora / actividad: actor, tipo, detalle, fecha).

**Estados de un envío:** `pendiente` → `enviado` → `en_seguimiento` → `requiere_atencion` (la compañía hizo una pregunta) → `cotizado` | `rechazado` | `error`. **Estado de la solicitud:** porcentaje completado = envíos cerrados / total.

#### Fase 2 — Configuración del agente (`/agentes/cotizacion/configuracion`)
Menú lateral con buscador de ajustes y estas secciones:
1. **Aseguradoras:** vista Lista o Matriz; filtro por ramo; activar o desactivar; contactos; importar y exportar a Excel; agregar aseguradora.
2. **Tipos de seguro:** ABM de ramos y sub-tipos, con descripción.
3. **Voz y tono:** personas predefinidas o una personalizada, con nombre del agente (firma los correos) y personalidad (instrucciones de estilo).
4. **Comportamiento:**
   - intervalo de seguimiento por defecto (24 h, 48 h, 72 h u otro);
   - estrategia de seguimiento en texto libre (por ejemplo: "primer seguimiento al día hábil siguiente, después cada 3 días hábiles; para flotas, todos los días");
   - máximo de seguimientos por aseguradora (1 a 6);
   - país de feriados;
   - idioma;
   - formato de asunto con marcadores `[RAMO] [CLIENTE] [ASEGURADORA] [CLAVE]`;
   - plantilla del cuerpo con marcadores `{productor} {organizacion} {aseguradora} {cliente} {cuit} {ramo} {moneda} {forma_de_pago}`;
   - instrucciones fijas del cuerpo;
   - cuenta saliente;
   - "Cotizar automáticamente con todas las aseguradoras del ramo".
   Cada ajuste indica si aplica a correo, a portal o a ambos.
5. **Conexiones** (antes "Portales"): por compañía, el tipo de conexión (API, portal o solo correo), las credenciales (cifradas, nunca en logs), el orden de canales, el botón **"Probar conexión"** y la salud del conector (último éxito y último error). Hoy funciona contra los conectores simulados.
6. **Paquetes:** coberturas por compañía y ramo.

En el inicio del agente, agregá un **checklist "Terminá de configurar tu agente de cotización"**: agregar lo que vendés, agregar una aseguradora con contacto, conectar los accesos de portal y elegir cómo suena tu agente. Cada ítem lleva a su sección.

**Estrategia de seguimiento:** implementala de forma determinista. Un parser de reglas simples ("cada N días hábiles", "para <ramo> cada N días", "si la aseguradora ya dio un folio, esperar") convierte el texto en fechas, usando días hábiles y feriados del país. El botón "Sugerir con IA" redacta la estrategia con la capa de IA, y el parser determinista la valida antes de guardarla.

#### Fase 3 — Nueva solicitud
Modal desde el botón "+ Nueva solicitud", también disponible desde la ficha de un asegurado y desde un lead con CUIT:
- nota opcional;
- ramo (chips);
- tipo: negocio nuevo o renovación;
- aseguradoras: por defecto, todas las activas del ramo ("7 de 7 seleccionadas · Editar"), con aviso si a alguna le falta el paquete configurado;
- archivos (PDF, DOCX, Excel e imágenes, hasta 25 MB).
Formulario de datos del riesgo por ramo. Para automotor: marca, modelo, año, versión, uso, conductor, fecha de nacimiento, código postal, CUIT/CUIL y forma de pago. Validá en servidor.

#### Fase 4 — Detalle de la solicitud (`/agentes/cotizacion/[id]`)
Encabezado con nombre del asegurado, ID, ramo, antigüedad y botón **"Marcar completado"**. Pestañas:
1. **Contactos:** tabla por aseguradora con paquete, folio o póliza, estado (con colores), próximo seguimiento, cantidad de seguimientos, preguntas y última actividad. Botones Copiar y Excel.
2. **Cotizaciones:** comparativo lado a lado, en vista compacta o detallada, filtrado por ramo. Filas por cobertura: prima neta, prima total, franquicia, límite, condiciones, daños, robo total y parcial, cristales, RC, servicios, gastos e impuestos. Etiqueta **"Mejor precio"**. Se pueden agregar parámetros o filas. Exportar a CSV, Excel y PDF, y **"Generar propuesta"** para el cliente (PDF con la marca de la organización; queda como borrador hasta que el productor la apruebe).
3. **Validación:** controles automáticos entre lo pedido y lo cotizado (CUIT, vehículo, suma asegurada, coberturas pedidas contra recibidas, vigencia). Cada diferencia se marca.
4. **Agente:** línea de tiempo de pasos ("Obtener ramos", "Crear solicitud", "Obtener opciones de aseguradoras") y borradores de correo a cada compañía y al ejecutivo, para aprobar. Además, un chat "Escribile al agente…" que usa la capa de IA y puede consultar los datos de la solicitud.

**Panel derecho:**
- Estado (barra con % completado y cantidad de aseguradoras; "Requiere atención" con detalle).
- Persona del agente.
- Seguimientos activos.
- Archivos agrupados por compañía y paquete.
- Actividad (correo enviado, escalación, cotizado, error), con "Mostrar más".

#### Fase 5 — Inicio del agente, bitácora y desempeño
- **Inicio** (`/agentes/cotizacion`):
  - tarjetas Activas / Requieren tu atención / Solicitudes / Cotizaciones recibidas;
  - lista de solicitudes con buscador y filtros por estado, ramo, ejecutivo y fecha;
  - columnas: solicitud, estado, cotizaciones recibidas/enviadas (por ejemplo 0/3), ramo, inicio y ejecutivo;
  - exportar.
- **Bitácora:** todos los eventos del agente, filtrables.
- **Desempeño:**
  - *Desempeño por aseguradora:* intentos, tasa de cotización, tasa de rechazo, tiempo promedio de respuesta, seguimientos promedio, prima neta promedio y volumen.
  - *Ranking de productores/ejecutivos:* solicitudes, cerradas, activas, tasa de cotización, tiempo promedio de cierre y pendientes. En multi-tenant, esto alimenta el panel de la agrupación.
  - *Solicitudes detenidas:* activas ordenadas por tiempo en el estado actual.
- Todas las métricas se calculan en funciones puras de `src/lib/cotizacion/metricas.ts`, con tests.

#### Fase 6 — Orquestador de envíos, seguimientos y respuestas
- **Orquestador** (`src/lib/cotizacion/orquestador.ts` + `ia_trabajos`): por cada envío aprobado, elige el canal según prioridad y salud, ejecuta (conector `api` o `portal`, o correo aprobado), pasa al canal siguiente si falla y normaliza la respuesta con la capa de IA. Las cotizaciones asincrónicas se consultan con `consultarCotizacion` según la estrategia de seguimiento.
- Cron `/api/cron/cotizacion` (protegido con `CRON_SECRET`, días hábiles): calcula los seguimientos vencidos y crea **borradores** para aprobar. Respeta el máximo y la estrategia. Solo corre si el agente está activo.
- **Respuestas simuladas** (solo en dev y seed): los conectores `SimuladaApi` y `SimuladaPortal`, más respuestas por correo simuladas (cotizado con PDF, pregunta, rechazo, error de portal), para probar todo el flujo de producción de punta a punta.
- Carga manual de una cotización recibida (subir el PDF y completar el comparativo a mano). Extracción con IA desde el PDF o el correo de la compañía hacia el comparativo. El productor siempre la confirma.

### 4. Criterios de aceptación
- [ ] Dado un productor con 3 aseguradoras activas en Automotor, cuando crea una solicitud de negocio nuevo, entonces se crean 3 envíos en `pendiente` y 3 borradores de correo con asunto y cuerpo según su plantilla.
- [ ] Dado un borrador, cuando el productor no lo aprueba, entonces no se registra ningún envío.
- [ ] Dada la estrategia "cada 3 días hábiles" y un feriado en medio, entonces el próximo seguimiento saltea el feriado y el fin de semana.
- [ ] Dado un envío con el máximo de seguimientos alcanzado, entonces no se generan más y pasa a `requiere_atencion`.
- [ ] Dadas dos cotizaciones cargadas, cuando se abre Cotizaciones, entonces se ve el comparativo con "Mejor precio" en la de menor prima total.
- [ ] "Generar propuesta" produce un PDF con la marca de la organización y queda como borrador.
- [ ] Las métricas de Desempeño coinciden con un fixture calculado a mano (test).
- [ ] Sin `ANTHROPIC_API_KEY`, o con la IA desactivada para la organización, el agente sigue funcionando con reglas y plantillas, los controles de IA se ocultan y no hay llamadas a la API.
- [ ] Cada respuesta de IA queda en la bitácora con modelo, tokens y costo, y ningún texto generado por IA se envía sin aprobación.
- [ ] Ninguna credencial de portal aparece en texto plano en la base ni en los logs.
- [ ] Dada una solicitud aprobada con 3 compañías (una `SimuladaApi`, una `SimuladaPortal` y una solo por correo), entonces las dos primeras cotizan solas, la tercera genera un borrador de correo, y las tres terminan en el mismo comparativo con el mismo formato.
- [ ] Si `SimuladaPortal` falla, el envío pasa a correo (borrador), queda registrado el error y se actualiza la salud del conector.
- [ ] Si el portal pide un dato faltante, el envío pasa a `requiere_atencion` con la pregunta, y al responderla se reintenta.
- [ ] Ningún conector expone ni ejecuta acciones de emisión, aceptación o firma.
- [ ] E2E: crear solicitud → aprobar envíos → simular respuestas → comparar → generar propuesta → marcar completado.

### 5. Fuera de alcance (por ahora)
- Conexiones reales con compañías (API o portal) y correo saliente real: quedan para el proyecto de integraciones. **Esta versión deja listo todo el modelo de producción**: interfaz de conectores con capacidades, mapeos, orquestador con paso al canal siguiente, normalización con IA, salud de conectores y conectores simulados. Conectar una compañía real es agregar su implementación.
- Firma o emisión de pólizas.
- Copiar la marca, los textos o el diseño visual del producto de referencia: lo usamos solo como referencia funcional.

### 6. Entregables
`docs/PLAN-cotizacion-v2.md`, migraciones, código, tests, seed de demo (una organización, un productor, 6 aseguradoras argentinas, 5 solicitudes en distintos estados), README actualizado y PR desde `feat/cotizacion-v2`. Al final, un resumen con: qué quedó hecho, qué quedó simulado, preguntas abiertas y cómo probarlo.

---

## Anexo — Qué muestra el video de referencia

**Fuente:** grabación de pantalla (4:25) de un video de YouTube de 5:56 que presenta el "Agente de Cotización" de Handle (usehandle.ai, mercado mexicano). Lo que sigue sale de la pantalla y de los textos superpuestos. **El audio no se pudo transcribir**, así que la narración hablada no está incluida.

### Inicio del agente
- Título "Agente de Cotización", con una casilla de correo propia del agente debajo.
- Checklist "Termina de configurar tu agente de cotización": agrega lo que vendes, agrega una aseguradora con contacto ("Configurar →"), conecta los accesos de portal y elige cómo suena tu agente.
- Pestañas: Solicitudes · Bitácora · Desempeño.
- Tarjetas: Activas 134 · Requieren tu atención 48 · Solicitudes 195 · Cotizaciones recibidas 119. En otra cuenta: 26 / 8 / 35 / 21.
- Filtros: buscar · Todos los estados · Todos los ramos · Todos los ejecutivos · Fecha · Exportar.
- Lista de solicitudes con columnas: solicitud (nombre y código), estado, cotizaciones (0/3, 1/1…), ramo, inicio ("1h ago") y ejecutivo.
- Botones arriba: Configuración y "+ Nueva Solicitud".
- Menú lateral de agentes: Cotización, Validador de Pagos, Conciliador, Cobranza, Extractor de Pólizas, Siniestros, KYC, Feedback. Abajo: Servicios, Sistema de registro, Centro de ayuda, Mis preguntas, Pedir ayuda.

### Desempeño
- **Desempeño por aseguradora** ("Cómo responde cada aseguradora a tus solicitudes"). Columnas: aseguradora, intentos, tasa de cotización (con barra), tasa de rechazo, tiempo promedio de respuesta, seguimientos promedio, prima neta promedio y volumen. Por ejemplo: SMYN 1 intento, 100 %, 2 h, $88.726; Qualitas 7 intentos, 71 %; Chubb 7 intentos, 14 %.
- **Ranking de asesores** ("Solicitudes agrupadas por el correo del asesor"): solicitudes, cerrados, activos, tasa de cotización, tiempo promedio de cierre y pendientes. Por ejemplo: un asesor con 17 solicitudes, 4 cerradas, 13 activas y 85 %.
- **Solicitudes detenidas:** activas ordenadas por tiempo en el estado actual (solicitud, estado y tiempo en estado).
- Textos superpuestos: "desempeño por aseguradora", "ver data de tu equipo", "alertas claras".

### Detalle de una solicitud (cliente "Rafael Alvarez")
- Pestañas: Contactos · Cotizaciones · Validación · Agente. Botón "Marcar completado".
- **Contactos:** tabla por aseguradora con paquete (AMPLIA, PREMIUM, AMPLIA-Económico), folio, estado (Requiere atención en rojo, Cotizado en verde, Error), próximo seguimiento, cantidad de seguimientos, preguntas y última actividad. Botones Copiar y Excel.
- **Panel derecho:**
  - Estado: "50 % completado · 6 aseguradoras", "Requiere atención · Detalles".
  - Persona: "Verónica".
  - Seguimientos activos.
  - Archivos por compañía y paquete (Cotizacion_Ana_seguros.pdf, Cotizacion_Mapfre.pdf, Cotizacion_Banorte.pdf).
  - Actividad: "Sistema — correo enviado: tabla comparativa parcial enviada al ejecutivo", "Ana seguros Portal — error: Agent run crashed (timeout)", escalaciones por compañía.
- **Cotizaciones:**
  - vistas Tabla / Configuración / Plantilla, filtro por ramo (Autos) y vista Compacto / Detallado;
  - exportar a CSV, Excel y PDF, y "Generar propuesta";
  - comparativo por cobertura: prima neta, prima total, deducible (daños materiales 5 %, robo total 10 %), límite de cobertura (valor comercial), condiciones (PREMIUM), daños materiales, robo total y parcial, rotura de cristales, RC bienes, servicios (multas, funerarios, llanta segura, auto sustituto, protección en EE. UU.), gastos de expedición e IVA;
  - etiqueta "mejor precio";
  - textos superpuestos: "agregar parámetros", "genere una propuesta".
- **Agente:**
  - pasos "Get insurance lines", "Crear solicitud" y "Get insurer options";
  - correo del agente al ejecutivo: "Submission – Autos – Rafael Alvarez", con resumen del vehículo (VW Jetta 2022, Trendline, uso personal) y del conductor (nombre, sexo, fecha de nacimiento, código postal), y la lista de aseguradoras configuradas para el ramo;
  - caja "Escribe al agente…". Texto superpuesto: "un chat".

### Nueva solicitud (modal)
"Sube archivos para iniciar una nueva solicitud de cotización":
- nota opcional (por ejemplo "Quiero que cotices un seguro para autos");
- ramo: Autos, Casa, Comercio, Evaluación, Flotillas, GMM, Incendio, Múltiple empresarial;
- tipo: Negocio nuevo o Renovación;
- aseguradoras: "7 de 7 seleccionadas · Editar — Se cotizará con cada aseguradora seleccionada", con chips y el aviso "sin paquete configurado";
- archivos: PDF, DOCX, Excel e imágenes, hasta 25 MB;
- botones Cancelar y Enviar.

### Configuración
Menú con buscador. General: Aseguradoras, Tipos de seguro, Voz y tono, Comportamiento. Cotización por portal: Portales, Paquetes. Debajo, el checklist "Configura tu agente".
- **Aseguradoras** ("Con quién cotizas y cómo contactarlas"): vista Lista o Matriz, exportar a Excel, importar, "+ Agregar aseguradora", filtro por ramo y columnas nombre, ramos (con etiqueta portal), contactos, activa y editar. Texto superpuesto: "correo" / "portal".
- **Tipos de seguro:** lista de ramos con descripción y sub-tipos (por ejemplo "GMM – GMM – DAD"). Texto superpuesto: "distintos tipos de seguro".
- **Voz y tono:**
  - personas predefinidas (Handle, María, Carlos, Verónica) o personalizada;
  - nombre del agente, con el que firma los correos;
  - personalidad (por ejemplo: "asistente de un bróker, profesional, cortés y meticuloso; refleja el tono de quien escribe; numera los puntos; resumen arriba en correos largos").
  - Texto superpuesto: "personalizar agente".
- **Comportamiento:**
  - intervalo de seguimiento por defecto (24 h, 48 h, 72 h u otro);
  - estrategia de seguimiento en lenguaje natural ("primer seguimiento después de 1 día hábil, luego cada 3; para Sura cada día hábil; para flotillas cada día hábil, GMM cada 3; si la aseguradora ya dio un folio, esperar la cotización"), con botón "Sugerir con IA";
  - máximo de seguimientos (1 a 6);
  - país de feriados;
  - cotización automática ("Cotizar automáticamente con todas las aseguradoras del ramo");
  - idioma de correos salientes;
  - formato de asunto `SOLICITUD – [RAMO] – [CLIENTE] – [ASEGURADORA] – [CLAVE]`;
  - plantilla del cuerpo ("Buenos días {destinatarios}. Solicitamos su apoyo con una propuesta para el asegurado en referencia, de acuerdo con el SLIP adjunto. Clave de agente… Contratante, RFC, Moneda, Forma de pago");
  - instrucciones del cuerpo ("Always include RFC when available");
  - cuenta de correo saliente.
  - Cada ajuste marca si aplica a correo, a portal o a ambos. Texto superpuesto: "seguimiento", "sin diferencia".
- **Portales** ("Conéctalos para cotizar en automático"): lista de compañías con cantidad de credenciales (Allianz, Zurich, Inbursa, AXA, Afirme, Meridional, Mercantil Andina, Plan Seguro, Red Bridge, Best Doctors…). Detalle de GNP Seguros: portal de cotización, "2 (2 activas)" credenciales.
- **Paquetes:** coberturas configuradas por compañía.
