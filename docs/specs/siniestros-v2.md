---
tipo: spec
proyecto: UNIQO (antes Radar Leads)
estado: borrador
creada: 2026-10-28
origen: video de demo del "Agente de Siniestros" de Handle (usehandle.ai), grabado el 28/10/2026
---
# Agente de Siniestros v2 — spec para desarrollo con IA

> **Para quién:** el desarrollador de IA de UNIQO o Claude Code, en el repo `SpanitanoSolutions/radar_leads`. Está escrito para pegarse completo, anexo incluido.
> **Relacionado:** [[Radar Leads/Specs/Agente de cotización v2]] (misma capa de IA, mismas reglas) · [[Radar Leads/Specs/Arquitectura multi-tenant y empaquetado]]

---

## 1. Qué hay que construir

Hoy el agente de Siniestros de UNIQO (`/agentes/siniestros`) maneja con reglas la denuncia, la documentación, las etapas, los recordatorios, los reclamos y el cierre. La v2 le suma un **analista de expedientes con IA**: el productor sube todos los documentos de un siniestro y el agente:

1. **clasifica** cada documento (denuncia, DNI, licencia, factura, informe médico…);
2. **extrae** sus datos y arma la ficha del caso (partes, póliza, siniestro, montos);
3. **cruza** los datos con la póliza de la cartera de UNIQO y con el resto de los documentos;
4. **marca** lo que está bien, los defectos formales que hay que corregir, los documentos faltantes y las inconsistencias;
5. **redacta las preguntas** que el productor tiene que responder, numeradas;
6. mantiene un **checklist de requisitos** según la compañía, el ramo y el tipo de siniestro;
7. cuando todo está completo, **arma el legajo** (expediente) en el orden que pide la compañía, listo para presentar;
8. lleva las **reclamaciones** y el **resumen financiero** (pendiente, aprobado, rechazado, franquicia), y los **reportes o certificados** con su vigencia;
9. **con compañías conectadas** (modelo de producción, sección 5 bis): verifica la póliza en la compañía, toma de ahí los requisitos, **presenta la denuncia y el legajo** con aprobación del productor y **sigue el siniestro** solo, interpretando cada novedad de la compañía.

Todo esto ocurre en una **conversación con el agente**, con un panel lateral que muestra el estado del caso. El agente propone; el productor confirma o corrige.

## 2. Reglas de UNIQO que no se rompen
- **La IA propone y el productor aprueba.** Nada sale hacia la compañía, el asegurado ni terceros sin aprobación explícita. Toda acción queda en la bitácora.
- **La IA pasa siempre por `src/lib/ia/`** (la capa definida en la spec de Cotización). Esa capa elige el modelo por tarea, usa salidas estructuradas validadas con zod, registra uso y costo en `ia_uso` y aplica la cuota de la organización. Si la IA está apagada o falla, el agente sigue funcionando en modo manual: subís documentos, tildás el checklist a mano y ves los plazos.
- **Las validaciones duras van en código, no en la IA.** Dígito verificador de CUIT/CUIL, CBU, fechas, vigencia de la póliza y montos. La IA extrae y redacta; las funciones puras de `src/lib/siniestros/` verifican, con tests.
- **Datos sensibles (Ley 25.326).** Los informes médicos son datos sensibles: no van a los logs, se guardan con acceso restringido al productor del caso y solo se mandan al modelo a través de la capa de IA, con la IA activa para la organización.
- **Multi-tenant:** toda tabla nueva lleva `org_id` y `producer_id`. El checklist de requisitos se configura en cascada (plataforma → organización → productor).
- **Convenciones del repo:** código en español, lógica en `src/lib/` con tests al lado, CSS propio, Server Actions, migraciones a partir de la última, rama `feat/siniestros-v2` y PR. La UI va en rioplatense con voseo.
- **Las tareas largas van en segundo plano.** Procesar 7 o más documentos no entra en una request: va a la cola `ia_trabajos` y la UI muestra "Procesando… 3 de 7".
- **Compañías conectadas (modelo de producción).** En producción, el agente va a acceder a las compañías para hacer su trabajo. Usa la **misma capa de conectores que Cotización y el Validador** (`src/lib/conectores/`, con `ConectorCompania`, tipos `api` | `portal` | `archivo`, capacidades, credenciales cifradas compartidas, mapeos y salud del conector). Hoy los conectores son simulados, pero el flujo se construye tal como va a funcionar en producción (sección 5 bis).

## 3. Adaptación al mercado argentino
El producto de referencia es mexicano y del ramo Gastos Médicos Mayores (reembolsos). En UNIQO el foco es **automotor y flotas**, más hogar, integral de comercio, AP y ART.

| En el video (México) | En UNIQO (Argentina) |
|---|---|
| INE (credencial de elector), lectura de la zona MRZ | DNI (frente y dorso; validar número y vencimiento) |
| CURP | CUIL |
| RFC | CUIT |
| CFDI (PDF + XML, UUID) | Factura electrónica con CAE, validable en ARCA (la validación queda simulada por ahora) |
| CLABE | CBU / CVU (validar dígitos) |
| MXN | ARS |
| CIE-10 | Se mantiene (solo para AP, salud y ART) |
| Formatos oficiales de la aseguradora (FF-285…) | Formularios de denuncia propios de cada compañía |
| Reembolso de gastos médicos | Siniestro automotor (choque, robo, granizo, cristales), hogar, comercio, AP, ART |

**Seed de requisitos sugerido (para validar con un productor real antes de usarlo):**
- **Automotor — daños o choque:** denuncia administrativa firmada, DNI y licencia del conductor, cédula del vehículo, fotos de los daños, datos del tercero (patente, compañía, póliza), presupuesto o peritaje y CBU del asegurado.
- **Automotor — robo total:** lo anterior más la denuncia policial, la denuncia ante el Registro Automotor, el título, los juegos de llaves y la documentación de transferencia que pida la compañía.
- **Automotor — lesiones:** certificados médicos, historia clínica, facturas y datos de los lesionados.
- **Hogar / comercio — robo o daño:** denuncia policial (si es robo), fotos, facturas o comprobantes de lo dañado o robado, presupuesto de reparación.
- **AP / ART:** certificado médico con diagnóstico (CIE-10), estudios, facturas y alta médica.

**Plazos (a confirmar con un abogado o un productor antes de mostrarlos como "legales"):** la Ley de Seguros 17.418 fija un plazo corto para que el asegurado denuncie el siniestro y otro para que la compañía se pronuncie. Configuralos como **parámetros editables por compañía** y usalos para las alertas "por vencer" y "vencido".

## 4. Funcionalidades

### 4.1 Lista de casos (`/agentes/siniestros`)
- Tarjetas: total de casos · abiertos · cerrados · archivados.
- Filtros: estado (abierto, cerrado, archivado), aseguradora, rango de fechas del evento, "solo por vencer o vencidos" y limpiar filtros.
- Columnas: folio (`SIN-XXXXXX`), asegurado o afectado, aseguradora (etiqueta "Sin aseguradora" si falta), fecha del evento, estado, última actividad ("hace 7 d") y alertas de reportes o plazos (etiqueta "Vencido").
- Botones: **+ Nuevo caso**, **Reportes / certificados** y **Configuración**.

### 4.2 Nuevo caso (modal)
- Aseguradora (lista; opción "Sin aseguradora, asignar después").
- Notas opcionales: "Agregá cualquier dato relevante: asegurado, evento, póliza, fechas… También extraemos la información de los archivos que adjuntes".
- Zona para arrastrar archivos (PDF e imágenes, o una carpeta entera; opcional, se pueden sumar después).
- Al crearlo, si hay archivos, se dispara el análisis en segundo plano.
- Bonus de UNIQO: si en la cartera hay un asegurado o una póliza que coincide por CUIT, DNI, patente o número de póliza, se vincula automáticamente y se muestra para confirmar.

### 4.3 Detalle del caso — conversación con el agente (`/agentes/siniestros/[id]`)
**Encabezado:** "← Volver a casos", nombre del afectado, contador **Requisitos 6/10** y contador **Documentos 7** (con punto rojo si hay pendientes).

**Columna central, el chat con el agente** (nombre y persona configurables; en el video, "Clarita · esperando tu respuesta"):
- Contexto: "Trabajando sobre SIN-XXXX · asegurado · compañía".
- Mensaje del sistema: "Subiste 7 documentos…" y "Procesamiento completado: 7 documentos · 7 OK", con chips de cada archivo que abren el visor.
- **Resumen de acciones / análisis del expediente**, con estas secciones fijas:
  - **Caso:** tipo, afectado, titular, contratante, póliza, diagnóstico o descripción del evento, fecha, lugar y monto reclamado hasta ahora.
  - **✅ Lo que está bien:** cada documento con formulario, firma, fechas y "✓"; si tiene defectos menores, "con defectos a corregir (ver abajo)".
  - **❌ Defectos formales a corregir antes de presentar:** lista numerada con el qué, el porqué y quién lo corrige. Por ejemplo: campo obligatorio vacío, fecha de nacimiento distinta entre DNI y formulario, casilla sin marcar, CUIL mal escrito.
  - **📄 Documentos faltantes (checklist pendiente):** tabla con número, documento y para qué se pide.
  - **⚠️ Inconsistencias / alertas:** por ejemplo, otra compañía figura como cliente en un estudio (posible doble cobertura), domicilios distintos entre documentos, código postal de la factura distinto del de la denuncia o un error de tipeo en un nombre.
  - **❓ Preguntas al productor (respondé por número):** preguntas numeradas para destrabar el caso.
  - **Cierre:** "Cuando tengamos los puntos 1 a 10, armamos el legajo en este orden: denuncia → …".
  - **Qué se hizo:** "7 documentos clasificados · 1 gasto creado · 1 reporte creado · 10 requisitos del checklist actualizados", y qué campos de la ficha se completaron.
  - **Pendientes:** lista con íconos de gravedad (⛔ bloquea / ⚠️ advertencia), con referencia al archivo y la página (por ejemplo, "Informe médico.pdf, p. 1").
- Caja de texto "Preguntale o indicale algo al agente…". Se pueden arrastrar documentos al chat. Enter envía y Shift+Enter hace un salto de línea.
- El productor responde por número ("3: sí, ya tiene CBU registrado") y el agente actualiza el análisis.

**Panel derecho:**
- **Partes de la póliza:** contratante, titular (con CUIT/CUIL) y afectado.
- **Póliza:** aseguradora y número. En UNIQO: enlace a la póliza de la cartera, con su vigencia y coberturas.
- **Siniestro:** tipo o diagnóstico, folio, fecha del evento, descripción y "Ver ficha completa →".
- **Estado del siniestro:** reclamación actual con hitos (informe o denuncia vigente, gastos completos, franquicia alcanzada).
- **Resumen financiero:** pendiente, aprobado, rechazado, franquicia (alcanzada sí o no) y moneda.
- **Reportes / certificados:** estado (vigente o vencido), inicio y fin de vigencia, médico o perito, y "Ver todos los reportes →".
- **Reclamaciones:** lista con monto y estado (borrador → armada → presentada → aprobada / rechazada / pagada); "Agregar primer gasto" y "Crear nueva reclamación".

### 4.4 Panel de requisitos (se abre desde "Requisitos 6/10")
"Lo que la aseguradora pide para este expediente. El agente lo va completando a medida que recibe documentos; podés cambiar el estado de cualquiera en cualquier momento."
- Secciones: **Faltantes**, **Parciales** (recibidos con defectos) y **Completos**.
- Cada requisito muestra nombre, explicación del estado (qué falta o qué defecto tiene), documento adjunto, "Estado fijado por el agente" o "por vos" y un botón **"Marcar como…"** para cambiarlo a mano.

### 4.5 Documentos (desde "Documentos 7")
Lista de archivos con su tipo detectado, la confianza de la clasificación, las páginas, los datos extraídos y un visor. Se puede reclasificar a mano.

### 4.6 Reportes / certificados
Vista global de reportes médicos, peritajes y certificados por caso, con vencimientos. Alimenta el filtro "por vencer o vencidos" y los recordatorios del cron.

### 4.7 Configuración
- Requisitos por compañía × ramo × tipo de siniestro: plantilla de checklist editable, con el seed de la sección 3.
- Orden del legajo por compañía.
- Plazos por compañía (para las alertas).
- Voz y nombre del agente.
- Activación de IA y cuota (según el plan de la organización).
- **Conexiones:** la misma pantalla compartida con Cotización y el Validador. Por compañía: tipo de conexión, credenciales, capacidades disponibles para siniestros (denunciar, subir documentos, consultar estado), "Probar conexión" y salud del conector.

## 5. Cómo funciona por detrás (IA)

```
Subida de documentos
  └─ ia_trabajos: un trabajo por documento (en paralelo)
       1. Clasificar tipo de documento        → Haiku 5.5  (salida: {tipo, confianza, paginas})
       2. Extraer campos según el tipo        → Haiku 5.5  (salida: JSON por tipo, validado con zod)
          └─ si la validación falla o la confianza < umbral → reintento con Sonnet 5.5
  └─ Al terminar todos:
       3. Validaciones deterministas (src/lib/siniestros/validaciones.ts):
          CUIT/CUIL/CBU, fechas, vigencia de la póliza en la fecha del evento,
          coincidencias entre documentos, plazos
       4. Análisis del expediente             → Sonnet 5.5
          entrada: datos extraídos + resultado de las validaciones + checklist + póliza
          salida estructurada: {caso, ok[], defectos[], faltantes[], inconsistencias[],
                                preguntas[], orden_legajo[], acciones_realizadas[]}
       5. Actualizar ficha, checklist, reclamación y reportes (código, con bitácora)
       6. Renderizar el mensaje del agente en el chat a partir del JSON
Chat del productor
  └─ Sonnet 5.5 con herramientas: ver_documento, ver_checklist, marcar_requisito,
     actualizar_campo_ficha, crear_gasto, crear_reclamacion, armar_legajo (genera un PDF borrador)
     Las herramientas que cambian datos dejan registro en la bitácora; las que envían algo hacia afuera crean borradores.
```

**Puntos de diseño:**
- **El análisis se guarda como JSON, no como texto libre.** El chat muestra ese JSON formateado. Así el checklist y el panel se actualizan desde datos y no desde texto parseado.
- **Cada hallazgo cita su fuente** (archivo y página) para que el productor pueda verificarlo.
- **Caché de prompts** para las instrucciones fijas y el checklist de la compañía: se repiten en cada llamada del caso.
- **Imágenes y PDFs escaneados** van como documento o imagen al modelo, una página o un documento por llamada, para mantener cada prompt de Haiku por debajo de 100.000 tokens.
- **Re-análisis incremental:** cuando llega un documento nuevo o una respuesta del productor, se procesa solo lo nuevo y se vuelve a correr el paso 4.

**Costo estimado** (con precios de lista; validar con el set de prueba): un caso con unos 10 documentos y 5 intercambios de chat cuesta aproximadamente **USD 0,20 a 0,40**. Todo queda medido en `ia_uso`.

## 5 bis. Cómo trabaja el agente con compañías conectadas
> **Definición común:** la interfaz, los tipos de conector, los permisos (leer, cotizar, presentar, comprometer) y las tablas compartidas están en [[Radar Leads/Specs/Conectores de compañías]] (archivo `Conectores de compañías - spec común.md`). Si hay diferencias, manda esa spec.

**Capacidades del conector para Siniestros** (dentro de `ConectorCompania`; cada compañía declara cuáles tiene):
- `verificarPoliza(numero, fechaEvento)` → vigencia, coberturas, franquicias y estado de pago en la compañía;
- `obtenerRequisitos(ramo, tipoSiniestro)` → el checklist oficial de la compañía;
- `denunciarSiniestro(denunciaNormalizada)` → número de siniestro de la compañía;
- `subirDocumentos(numeroSiniestro, documentos[])` → lo que la compañía aceptó o rechazó;
- `consultarSiniestro(numeroSiniestro)` → estado, liquidador o perito, requerimientos nuevos, montos aprobados, rechazos y pagos;
- `descargarDocumentos(numeroSiniestro)` → órdenes de reparación, cartas de la compañía y liquidaciones.

**Qué hace la IA con compañías conectadas:**
- **Antes de presentar:** cruza el expediente con `verificarPoliza` (además de la cartera de UNIQO) y usa `obtenerRequisitos` como fuente del checklist. Si difiere de la plantilla local, gana la compañía, y la diferencia se muestra.
- **Mapea la denuncia** al formulario o la API de cada compañía (campos, códigos de causa, tipo de daño, terceros). Lo propone la IA (Haiku 5.5), se valida con zod y se guarda en `conector_mapeos` por compañía.
- **Agente de portal** (Sonnet 5.5 con herramientas de navegador) para las compañías sin API: carga la denuncia y los documentos aprobados, y lee el estado. **No acepta liquidaciones, no firma conformidades ni desiste de reclamos.** Si el portal pide algo que no está en el expediente, se detiene y lo pregunta en el chat.
- **Seguimiento automático:** un cron (`/api/cron/siniestros`, días hábiles, solo con el agente activo) llama a `consultarSiniestro` para los casos abiertos. La IA interpreta cada novedad ("el liquidador pidió el presupuesto actualizado", "rechazo parcial por franquicia", "pago transferido") y:
  - actualiza el estado, la reclamación y el resumen financiero (el código verifica los montos);
  - agrega los requisitos nuevos al checklist;
  - escribe en el chat del caso qué pasó y qué hay que hacer;
  - avisa al productor según la configuración de notificaciones.
- **Descarga y clasifica** los documentos que emite la compañía con el mismo pipeline de la sección 5.

**Aprobaciones en producción:**
- **Leer** (verificar póliza, requisitos, estado, descargar documentos) es automático.
- **Presentar la denuncia** y **subir el legajo o documentos** a la compañía requieren **aprobación explícita** del productor, caso por caso, con una vista previa de lo que se envía.
- **Aceptar una liquidación, dar conformidad, desistir o firmar** nunca lo hace el agente: lo hace el productor en la compañía.

**Canal con prioridad automática:** `api` → `portal` → presentación manual (el agente arma el legajo PDF y el productor lo presenta). Si un canal falla, se pasa al siguiente y queda registrado.

**Simulación ahora:** conectores `SimuladaApi` y `SimuladaPortal` con todas las capacidades anteriores. Simulan un siniestro que avanza por etapas (recibido → en análisis → requerimiento de documentación → liquidado → pagado o rechazado), para probar el seguimiento de punta a punta.

**Costo adicional estimado con conexiones:** interpretar novedades y sincronizar cuesta centavos por caso al mes. El agente de portal es lo más caro y se mide por compañía. Estimación inicial: **USD 0,30 a 0,80 por caso en total** (análisis más seguimiento), a confirmar con `ia_uso`.

## 6. Modelo de datos (orientativo)
Extender las tablas actuales de siniestros si ya existen; no duplicarlas.
- `siniestros`: más `folio`, `tipo_siniestro`, `ramo`, `poliza_id` (de la cartera), `afectado`, `contratante`, `titular`, `fecha_evento`, `lugar`, `descripcion`, `diagnostico_cie10` (opcional), `estado`, **`numero_siniestro_compania`**, **`canal_presentacion`** (`api` | `portal` | `manual`), **`estado_compania`**, **`ultima_sincronizacion`** y `org_id` / `producer_id`.
- `siniestro_sincronizaciones`: cada consulta a la compañía, con respuesta normalizada, novedades detectadas, interpretación de la IA, acciones aplicadas y errores.
- `siniestro_presentaciones`: cada envío a la compañía (denuncia o documentos), con contenido, aprobado por y cuándo, canal, resultado y comprobante.
- Compartidas con los otros agentes: `credenciales_portal`, `conector_mapeos` y la salud de conectores.
- `siniestro_documentos`: archivo, tipo detectado, confianza, páginas, datos extraídos (JSON), estado de la extracción y origen (subido o chat).
- `siniestro_requisitos`: requisito (desde la plantilla), estado (`faltante` | `parcial` | `completo` | `no_aplica`), explicación, documento vinculado y `fijado_por` (`agente` | `usuario`).
- `siniestro_analisis`: versiones del JSON del paso 4, con fecha, modelo y costo.
- `siniestro_mensajes`: el chat (rol, contenido, adjuntos).
- `siniestro_reclamaciones` y `siniestro_gastos`: montos, estado y moneda.
- `siniestro_reportes`: tipo, emisor, vigencia desde y hasta, estado.
- `siniestro_plantillas_requisitos` y `siniestro_config`: requisitos, orden del legajo y plazos por compañía, ramo y tipo de siniestro.

## 7. Criterios de aceptación
- [ ] Dado un caso con 7 documentos subidos, cuando termina el procesamiento, entonces cada uno tiene tipo, datos extraídos y página de origen, y el chat muestra el análisis con las 6 secciones.
- [ ] Dado un DNI y una denuncia con fechas de nacimiento distintas, entonces aparece un defecto formal citando ambos archivos y páginas.
- [ ] Dada una póliza de la cartera no vigente en la fecha del evento, entonces aparece una alerta bloqueante, detectada por código y no por la IA.
- [ ] Dado un requisito marcado a mano, cuando el agente vuelve a analizar, entonces no pisa el estado fijado por el usuario.
- [ ] Dadas las respuestas por número del productor, entonces el agente actualiza el checklist y las preguntas pendientes.
- [ ] "Armar legajo" genera un PDF borrador con los documentos en el orden configurado para la compañía, y solo se habilita con los requisitos bloqueantes completos.
- [ ] El filtro "por vencer o vencidos" y el cron de recordatorios usan los plazos configurados.
- [ ] Sin IA activa, se pueden subir documentos, completar el checklist a mano y ver plazos y reclamaciones.
- [ ] Ningún dato de informes médicos aparece en los logs, y cada llamada a la IA queda en `ia_uso` con su costo.
- [ ] Con `SimuladaApi`, al aprobar la presentación se obtiene el número de siniestro de la compañía, y el cron incorpora las novedades por etapas (requerimiento → liquidado → pagado), actualizando el checklist, el resumen financiero y el chat.
- [ ] Sin aprobación del productor, ningún conector ejecuta `denunciarSiniestro` ni `subirDocumentos`. Las acciones de aceptar, dar conformidad o desistir no existen en la interfaz.
- [ ] Si `obtenerRequisitos` devuelve un checklist distinto de la plantilla local, se usa el de la compañía y la diferencia se muestra.
- [ ] Si el conector falla, el caso pasa a presentación manual con el legajo PDF y queda registrado en la salud del conector.
- [ ] **Set de prueba:** con 10 expedientes reales anonimizados (que provee Julian), la clasificación acierta al menos el 95 % y la extracción de campos clave (CUIT/DNI, fechas, montos, póliza) al menos el 90 %. El script de evaluación queda en `scripts/evaluar-siniestros.ts`.

## 8. Fuera de alcance
- Conexiones reales con compañías (API o portal): quedan para el proyecto de integraciones. **Esta versión deja listo el modelo de producción completo**: capacidades de siniestros en `ConectorCompania`, presentación con aprobación, sincronización con interpretación de la IA, paso al canal siguiente y conectores simulados por etapas. Conectar una compañía real es agregar su implementación.
- Validación real de CAE contra ARCA (queda detrás de un adaptador simulado).
- Comunicación directa con el asegurado o con talleres.
- Copiar la marca, los textos o el diseño visual del producto de referencia: lo usamos solo como referencia funcional.

## 9. Entregables
`docs/PLAN-siniestros-v2.md` (antes de implementar: tabla "ya existe / falta / cambia" y migraciones, para aprobar), migraciones, código, tests, seed de demo (3 casos de automotor y 1 de AP, con documentos ficticios), script de evaluación, README actualizado y PR desde `feat/siniestros-v2`.

---

## Anexo — Qué muestra el video de referencia

**Fuente:** grabación de pantalla (2:53) de un video de YouTube de 3:46 que presenta el "Agente de Siniestros" de Handle (mercado mexicano, ramo Gastos Médicos Mayores). Lo que sigue sale de la pantalla y de los textos superpuestos. **El audio no se pudo transcribir.** Textos superpuestos: "Varios…", "ver data importante", "todos los documentos", "análisis del expediente", "Toda la información", "Experta en Siniestros", "Ver el check list", "Reportes Médicos", "¿Cómo mandar un nuevo…?", "Descripción del caso", "La mejor en tu equipo para siniestros".

1. **Lista "Siniestros"** (`/insurance/claims`):
   - tarjetas: total de casos 19 · abiertos 19 · cerrados 0 · archivados 0;
   - filtros: estado (Abierto / Cerrado / Archivado), aseguradora, fecha del evento (rango), reportes ("solo por vencer o vencidos"), "Limpiar filtros";
   - columnas: folio (SIN-5NSIM5…), paciente, aseguradora (AXA Seguros, GNP Seguros, Seguros Atlas o la etiqueta naranja "Sin aseguradora"), fecha del evento, estado OPEN, última actividad (hace 7 d … hace 60 d) y reportes (etiqueta roja "Vencido");
   - botones: Reportes médicos, + Nuevo Caso, Configuración.
2. **Detalle del caso** "Marco Fabián Olvera Cantú":
   - agente "Clarita · esperando tu respuesta", contadores "Requisitos 6/10" y "Documentos 7";
   - "Trabajando sobre SIN-XGELWQ · paciente · Seguros Atlas";
   - "Subiste 7 documentos: Honorarios (PDF y XML), Aviso de accidente, Informe médico, INE actualizada…" y "Procesamiento completado: 7 documentos · 7 OK", con chips por archivo.
3. **Resumen de acciones: "Análisis de expediente — Folio SIN-XGELWQ | Seguros Atlas GMM":**
   - **Caso:** reembolso inicial, paciente, titular, contratante, póliza, diagnóstico (Linfoma folicular, CIE-10 pendiente), evento (laparoscopia diagnóstica con biopsia en un hospital, fechas) y gasto facturado (USD/MXN 25.000, honorarios con CFDI completo PDF+XML).
   - **Lo que está bien:** aviso de accidente (formato oficial, firmado, fecha), informe médico ("con defectos a corregir"), INE vigente (verificada con la MRZ), CFDI de honorarios (UUID, monto, uso), orden de internamiento y resultados de laboratorio ("con observación importante").
   - **Defectos formales a corregir antes de empaquetar:** código CIE-10 en blanco (esperado C82; el médico debe corregir y refirmar), fecha de nacimiento incorrecta en el informe médico frente a la INE (diferencia de un día), campo "¿Estuvo hospitalizado?" sin marcar en el aviso, y CURP incompleto o con caracteres incorrectos.
   - **Documentos faltantes (checklist pendiente):** solicitud de reembolso firmada, reporte histopatológico de la biopsia, comprobante de domicilio (≤ 3 meses), reporte del PET scan, resultados de tele de tórax, electrocardiograma, valoración preoperatoria, carátula de estado de cuenta bancario (≤ 3 meses) y facturas CFDI del ayudante, el anestesiólogo y el hospital.
   - **Inconsistencias / alertas:** otra aseguradora (MetLife) como cliente en el informe de laboratorio (posible duplicidad de cobertura, "requiere aclaración urgente"), domicilio distinto entre INE y aviso, código postal del CFDI distinto del aviso y un error de tipeo en el nombre en la orden de internamiento.
   - **Preguntas al bróker (responder por número):** 10 preguntas. Por ejemplo: si tiene otro seguro vigente; si ya tiene CLABE registrada; si existe factura del hospital; si los médicos emitieron honorarios por separado; si existe el reporte del PET scan; si se puede pedir la solicitud de reembolso firmada.
   - **Cierre:** "Una vez recibidos los puntos 1–10, podremos empaquetar el expediente en el orden reglamentario: solicitud → informe médico (corregido) → aviso (corregido) → bancario → estado de cuenta → INE → comprobante de domicilio → estudios → orden médica → facturas".
   - **Acciones:** 7 documentos clasificados · 1 gasto creado · 1 reporte médico creado · 10 requisitos del checklist actualizados · encabezado completado (`patientName`, `policyNumber`, `contratante`, `titular`, `event.description`, `event.date`, `event.diagnosisText`).
   - **Pendientes:** con íconos ⛔ y ⚠️ y referencia a archivo y página.
   - Caja: "Pregunta o instruye a Clarita…" · "Enter para enviar · Shift+Enter salto de línea · Arrastra documentos al chat para procesarlos".
4. **Panel derecho:**
   - partes de la póliza (contratante, titular con RFC, afectado o paciente con CURP);
   - póliza (aseguradora, número);
   - siniestro (diagnóstico, código, folio, fecha del evento, descripción, "Ver ficha completa →");
   - estado del siniestro ("Reclamación 2": informe médico vigente, gastos completos, deducible alcanzado);
   - resumen financiero (pendiente 25.000; aprobado 0; rechazado 0; deducible alcanzado 20.000);
   - reporte médico (estado vigente, inicio y fin de cobertura, médico, "Ver todos los reportes →");
   - reclamaciones ("Reclamación de apertura · Empaquetada · 25.000,00"; "Reclamación 2 · Borrador"; "Agregar primer gasto"; "Crear nueva reclamación").
5. **Panel Requisitos:** "Lo que la aseguradora pide para este expediente. El agente lo va llenando conforme recibe documentos; tú puedes ajustar su estado en cualquier momento". "Faltan 4 de 10 requisitos". Grupos pendientes y parciales; cada uno con explicación, documento adjunto, "Estado fijado por el agente" y "Marcar como…".
6. **Nuevo siniestro (modal):** aseguradora (GNP Seguros, MetLife México, AXA Seguros, Seguros Atlas, "Sin aseguradora (asignar después)"); notas opcionales ("Aquí puedes agregar cualquier dato relevante: paciente, evento, póliza, fechas… También extraeremos la información de los archivos que adjuntes"); "Arrastra documentos aquí o haz clic para buscar · PDFs e imágenes · Opcional · Subir una carpeta"; botones Cancelar y Crear.
