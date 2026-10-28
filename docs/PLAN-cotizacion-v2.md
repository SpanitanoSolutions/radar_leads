# Plan: Agente de Cotización v2

## Estado actual

La rama `feat/cotizacion-v2` parte de `main` limpio. La Cotización actual ya tiene solicitudes vinculadas a asegurados/leads, estados generales, carga manual de precios, comparativa por precio mínimo, filtros, bitácora y métricas básicas. El envío simulado a portales ocurre al crear la solicitud y no requiere aprobación; esto debe cambiar antes de sumar más canales.

El esquema y el diario de Drizzle llegan a `0013_datos_de_cartera`; por lo tanto, las migraciones nuevas empiezan en `0014`, aunque la referencia inicial del pedido mencione `0010`. `solicitudes_cotizacion` se extiende; no se duplica.

## Ya existe / falta / cambia

| Funcionalidad del anexo | Ya existe | Falta | Cambia |
|---|---|---|---|
| Inicio, solicitudes y KPIs | Lista de solicitudes, filtros por búsqueda/estado/ramo/origen, KPIs, estados y creación vinculada a asegurado o lead | Filtros por ejecutivo/fecha, conteo enviado/recibido por compañía, exportación y checklist de configuración pedido | La creación deja de enviar a portales: crea envíos y borradores; el productor aprueba cada salida explícitamente |
| Bitácora | Actividad general de agentes y vista filtrada para Cotización | Eventos estructurados por solicitud/envío, filtros y detalle de actor/fecha/tipo | Registrar cada propuesta de IA con proveedor/modelo, tokens y costo; no incluir datos personales en logs |
| Desempeño | Ganadas, tasa básica y compañía con más primeros puestos | Métricas puras y probadas por aseguradora y productor/ejecutivo, tiempos, rechazos, primas, seguimientos y solicitudes detenidas | Las métricas se calculan desde eventos/envíos/resultados normalizados |
| Nueva solicitud | Modal/formulario con ramo, tipo, vínculo y compañías disponibles | Tipos nuevo/renovación, riesgo validado por ramo, CUIT/CUIL, paquetes faltantes, adjuntos de hasta 25 MB, creación desde ficha de asegurado/lead | Sustituir “mejora” por el catálogo acordado sin perder compatibilidad con registros existentes; selección predeterminada desde aseguradoras activas por ramo |
| Envíos a compañías | Estado por compañía embebido en JSON y adaptador de portal simulado | Entidad de envío, estado detallado, folio, seguimientos, preguntas, errores y borradores de correo | Un adaptador de correo/portal simulado detrás de interfaz; nada se envía antes de aprobar |
| Cotizaciones y comparación | Precio anual manual, observación y mejor precio simple | Resultados normalizados, primas neta/total, impuestos/gastos, coberturas/franquicia/sumas, archivos, vistas y exportaciones CSV/XLSX/PDF, propuesta con marca | Comparar por prima total y campos compatibles; propuesta queda como borrador pendiente de aprobación |
| Validación | No hay validación entre pedido y respuesta | Diferencias de CUIT, vehículo, sumas, coberturas y vigencia | Reglas deterministas primero; opcionalmente IA solo como sugerencia explicable |
| Agente y borradores | Secuencia básica de actividad; sin chat de Cotización | Cronología detallada, borrador por compañía y ejecutivo, aprobación/edición, chat contextual | Aprobación explícita para todo correo/propuesta y registro de acciones; IA aislada detrás de `src/lib/ia/` |
| Configuración: aseguradoras | Catálogo de conexiones/compañías y estado de portal | ABM de aseguradoras, ramos, canal, contactos, código productor, activar/desactivar, importación/exportación | Catálogo editable con seed argentino; distinguir canal correo/portal/ambos |
| Configuración: ramos y paquetes | Ramos usados como texto y algunos datos en conexiones | ABM de tipos/subtipos y paquetes por compañía/ramo con coberturas y condiciones | Usar catálogo argentino configurable; priorizar Automotor y Flotas |
| Configuración: voz y comportamiento | Ajustes básicos del agente en `configuracion_agentes` | Persona/nombre, tono, reglas y plantilla de seguimiento, feriados argentinos, idioma/asunto/cuerpo/cuenta saliente | Resolver configuración plataforma → organización → productor; parser determinista de reglas y fechas hábiles |
| Configuración: portales | Conexiones simuladas sin credenciales guardadas | UI/estado de credenciales cifradas, conteo y configuración de portal | Mantener adaptador simulado; nunca registrar ni devolver secretos |
| Archivos y adjuntos | Archivos en otros flujos de cartera/agentes, no asociados a cotizaciones | Adjuntos de solicitud y respuesta, validación de tipo/tamaño y descarga | Reutilizar almacenamiento seguro existente cuando aplique; límites explícitos por archivo |
| Cron y respuestas | No existe ciclo completo de seguimiento de Cotización | Cron protegido, días hábiles/feriados, creación de borradores vencidos y simulador de respuestas para dev/seed | El cron solo genera borradores; se detiene al alcanzar máximo y requiere atención |
| Semillas y README | Datos de ejemplo generales y descripción básica | Demo con organización/productor, seis aseguradoras y cinco solicitudes de distintos estados; documentar flujo y limitaciones | Mantener fuera los servicios reales y explicar configuración local |

## Preguntas abiertas antes de la Fase 4

1. **Enfoque de IA (elegir antes de Fase 4):**
   - **A. Extracción y redacción solamente (recomendado para el primer corte).** Claude detrás de proveedor propio; chat y borradores acotados. Estimación preliminar por solicitud: **US$ 0,001–0,03** para algunas llamadas Haiku, suponiendo solicitudes de texto cortas; PDFs largos pueden aumentar el costo. Menor complejidad y superficie de datos.
   - **B. Agente con herramientas controladas.** Claude invoca herramientas permitidas de `src/lib/cotizacion`; cada ciclo puede hacer varias llamadas y cuesta más que A. Estimación preliminar: **US$ 0,02–0,30 por solicitud** según cantidad de pasos, modelo y contexto. Mantiene el control de acciones en el servidor.
   - **C. Claude Agent SDK.** Más capacidades de orquestación, pero mayor complejidad operativa, permisos y costo variable; estimación de planificación **US$ 0,05–0,50+ por solicitud** según pasos/herramientas. Requiere evaluar aislamiento y persistencia antes de aprobarlo.

   Son rangos de planificación, no cotización: dependen del tamaño real del PDF/contexto y del número de llamadas. Como referencia de cálculo se usarán precios públicos de API por token de Anthropic y se guardará el uso medido por respuesta. Revisar el precio vigente al elegir proveedor/modelo: [precios de Claude](https://www.anthropic.com/pricing).
2. **Identidad multi-tenant:** hoy no hay tablas de organización/productor ni resolución de identidad por sesión. El spec pide `org_id` y `producer_id` con valores por defecto, pero no existe una identidad persistida que permita asignarlos con seguridad. Propuesta: agregar ambas columnas nullable y dejar los registros del tenant actual en `NULL` hasta la migración de identidad; definir IDs ficticios por configuración sería frágil. Confirmar si este alcance debe incluir una identidad mínima ahora.
3. **Clave de cifrado de portales:** confirmar nombre y rotación de la variable de entorno (propuesta `COTIZACION_CREDENTIALS_KEY`, AES-GCM, 32 bytes), ya que no hay almacén de secretos multi-tenant existente.
4. **Archivos y PDF:** definir si se conserva el almacenamiento de bytes en PostgreSQL para esta primera versión (consistente con adjuntos existentes) o si se deja una interfaz para almacenamiento externo futuro. No se subirán documentos a IA sin la función habilitada para la organización.

## Migraciones previstas

- `0014_cotizacion_modelo.sql`: catálogos de aseguradoras, tipos de seguro, paquetes, configuración en cascada; ampliar solicitudes existentes y agregar envíos, resultados, archivos y eventos. Incluir columnas nullable `org_id` y `producer_id` en tablas nuevas (y en las existentes que se modifiquen), índices, claves foráneas disponibles y enums/estados. Seed argentino inicial.
- `0015_cotizacion_ia_y_credenciales.sql` (si el enfoque elegido lo requiere): capacidades por organización (`org_features`) y campos cifrados/versionados de credenciales. Ajustar este diseño tras decidir cómo representar organizaciones; no guardar secretos en claro.
- Cualquier cambio adicional se numera desde el último archivo real del diario. Actualizar snapshots y journal con Drizzle.

La migración preservará `solicitudes_cotizacion.cotizaciones` y los estados históricos; una capa de compatibilidad leerá esos registros mientras se normalizan a envíos/resultados.

## Fases propuestas

1. **Modelo de datos:** migraciones incrementales, tipos validados, seed argentino y funciones puras de normalización/validación; preservar datos anteriores.
2. **Configuración:** pantallas de aseguradoras, ramos, voz/tono, comportamiento, portales y paquetes; checklist de puesta en marcha; estrategia determinista de seguimiento con feriados nacionales.
3. **Nueva solicitud:** formularios por ramo, CUIT/CUIL validado, archivos y selección de compañías; crear envíos pendientes y borradores sin ejecutar adaptadores de salida.
4. **Detalle:** contactos/envíos, comparativa, validación, cronología, borradores con aprobación, propuesta descargable y chat IA según la decisión abierta. Toda mutación con Server Actions debe volver a validar y autorizar en servidor.
5. **Inicio, bitácora y desempeño:** filtros/exportación, eventos completos y funciones puras de métricas con pruebas junto a la lógica.
6. **Seguimientos y respuestas simuladas:** cron autenticado, calendario hábil, borradores de seguimiento, simulador de dev/seed y carga manual/IA de respuestas confirmada por el productor.

Cada fase actualiza README y cierra con las verificaciones pedidas en el MD: Vitest, lint, build y E2E contra base local sembrada. No se enviarán correos ni se automatizarán portales reales, ni se publicará/mergeará la rama sin autorización posterior.
