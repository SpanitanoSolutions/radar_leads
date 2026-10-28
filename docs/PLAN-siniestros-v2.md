# Plan de implementación: Agente de siniestros v2

Estado: **aprobado; base v2 implementada, IA pendiente de configuración**  
Rama de trabajo: `feat/siniestros-v2`

Este documento convierte la especificación de Siniestros v2 en un plan contrastado con el repositorio. El usuario aprobó avanzar, excluyó informes médicos y dejó para más adelante la selección de proveedores/modelos y del scheduler. No se activan envíos a compañías ni verificaciones reales ante ARCA.

## 1. Estado inicial antes de esta rama

- `/agentes/siniestros` ya ofrece una lista de casos abiertos/cerrados, indicadores, carga manual, etapas, eventos y edición de montos aprobados/pagados.
- El formulario actual exige una póliza y una compañía existentes. No permite iniciar un expediente sin póliza, cargar varios archivos ni hacer una búsqueda asistida de posibles coincidencias.
- `siniestros` exige `poliza_id` y no tiene folio, estado archivado ni alcance de organización/productor. La consulta actual también depende de la póliza para encontrar al asegurado.
- `siniestro_documentos` representa requisitos estáticos con recibido/faltante; no es un registro de archivos subidos y analizados. Los eventos del siniestro sí dejan una bitácora básica.
- `src/lib/siniestros.ts` contiene reglas deterministas y requisitos por tipo, incluyendo avisos de 3 y 14 días. Las reglas existentes tienen pruebas unitarias.
- La IA existente está orientada a Cotización (`src/lib/ia/`). Usa Claude y registra eventos propios de Cotización. No hay `ia_uso`, `ia_trabajos`, cuota general ni procesamiento de Siniestros en segundo plano.
- La sesión actual es compartida y no identifica al productor autenticado. Las columnas de organización/productor se mantienen nullable hasta que exista identidad multi-tenant.
- Las tablas de archivos almacenan el contenido en la base de datos y no tienen alcance propio por organización/productor. El nuevo flujo deberá comprobar los permisos del expediente antes de leer o descargar un archivo.
- Las migraciones existentes llegan a `0017`; las siguientes deben conservar los datos y el estilo de migraciones del proyecto.

## 2. Ya existe / falta / cambia / entrega de esta rama

| Área | Ya existía | Alcance v2 | Entrega de esta rama |
|---|---|---|---|
| Casos | Lista, pestañas abiertos/cerrados, KPIs, etapas e historial | Folio `SIN-XXXXXX`, archivados, búsqueda y filtros por estado, compañía y fecha; vista global de informes | Folio, archivado, búsqueda/filtros por compañía y fecha, 5 KPIs y vista global de informes implementados |
| Alta | Formulario manual asociado a póliza | Compañía y póliza opcionales, asegurado/afectado, notas, carga múltiple y progreso de análisis | Formulario amplio, coincidencias manuales por documento/nombre y póliza/patente, carga protegida; el productor confirma la vinculación |
| Documentos | Filas de checklist con recibido/faltante | Archivos adjuntos, clasificación, páginas y estado de análisis | Requisitos y archivos separados; checklist migrado; clasificación queda pendiente hasta elegir modelos y scheduler |
| Requisitos | Reglas estáticas por tipo y edición manual | Plantillas por compañía × ramo × tipo, bloqueo configurable y trazabilidad de cambios | Configuración, estado recibido/faltante y marca de edición manual implementados |
| Análisis | Reglas deterministas de etapas y alertas | Clasificación y extracción estructurada, comparación entre documentos, preguntas numeradas | Validaciones puras y marca de vigencia de póliza implementadas; análisis con modelo queda pendiente |
| Asistente | No hay chat de expediente | Preguntas sobre documentos y respuestas por número | Tabla de conversación creada; interfaz/respuestas quedan pendientes de elegir e integrar modelos |
| Informes | Texto de denuncia y datos de pagos en el caso | Gastos, informes/certificados y dossier PDF por compañía | Gastos, resumen financiero, borradores de resumen/constancia/denuncia, lista global y dossier imprimible habilitados; sin envío automático |
| IA común | Cliente de Claude para Cotización | Registro de uso, trabajos, configuración de proveedor/modelo y cuotas | Tablas de uso/trabajos/configuración y registro de proveedores intercambiables; sin proveedor ni modelo predeterminado |
| Configuración | Sin configuración v2 de Siniestros | Reglas por compañía/ramo/tipo, orden de dossier y plazos operativos | Reglas por compañía/ramo/tipo implementadas. El scheduler y la herencia multi-tenant se dejan para una fase futura |
| Seguridad | Login compartido | Acceso por productor y protección de datos | Descargas requieren sesión. Informes médicos excluidos; ACL por productor depende de identidad multi-tenant futura |
| Evaluación | Pruebas unitarias para reglas actuales | Fixtures sintéticos y evaluador de 10 expedientes anonimizados | Caso sintético de AP y runner agregador implementados; falta el set de 10 expedientes para medir las metas |

## 3. Migraciones propuestas

Las migraciones de esta rama llegan a `0023`. Las tablas de checklist y archivos anteriores se conservan; la nueva interfaz usa las tablas v2.

### `0018_siniestros_v2.sql`

- Crea `ia_uso`, `ia_trabajos`, `siniestro_requisitos`, `siniestro_archivos` y `siniestro_conversaciones`.
- Amplía `siniestros` con folio, vínculo directo al asegurado, compañía/ramo, afectado y estado archivado; hace nullable `poliza_id` y cambia su FK a `SET NULL`.
- Completa vínculos existentes y folios; copia el checklist anterior y adjuntos referenciados a las tablas v2, sin borrar la tabla anterior.
- No registra prompts ni contenido de documentos en errores o métricas IA.

### `0019_siniestros_configuracion.sql`

- Crea reglas por compañía/ramo/tipo, gastos e informes/certificados en borrador.

### `0020_siniestros_config_unica.sql`

- Añade la clave única por compañía/ramo/tipo para guardar reglas con upsert.

### `0021_siniestros_ejemplos.sql`

- Añade y completa `es_ejemplo` para limpiar expedientes sintéticos sin afectar expedientes reales desvinculados de póliza.

### `0022_siniestros_alcance.sql` y `0023_ia_configuracion.sql`

- Añaden `org_id` y `producer_id` nullable a las tablas v2, además de la configuración futura de proveedor/modelo y límites por operación IA.

## 4. Fases de implementación

### Fase 1 — Infraestructura de IA y cola

- Añadidos contratos de adjuntos, registro intercambiable de proveedores y tablas de uso, trabajos, configuración de modelos y topes.
- No hay proveedor/modelo predeterminado ni scheduler. Los adjuntos se conservan con estado `pendiente_configuracion`; cuando se definan ambos, se podrá activar el procesamiento manual o en segundo plano.
- Mantener Cotización sin cambios y usar la carga/revisión manual hasta configurar los agentes IA.

### Fase 2 — Dominio Siniestros y validaciones puras

- Aplicadas las migraciones de Siniestros v2 y copiado el checklist anterior sin borrar su tabla.
- Añadidas funciones puras para CUIT/CUIL, CBU/CVU, fecha del hecho, montos y vigencia de póliza.
- La vigencia se compara en código determinista y se agrega un evento si la póliza no figura vigente en la fecha informada.
- Los plazos de 3/14 días quedan como valores operativos ajustables por compañía/ramo/tipo; la pantalla aclara que no son asesoramiento legal.

### Fase 3 — Lista, alta y carga de expedientes

- Implementada lista con folio, KPIs, pestañas, búsqueda, filtros por compañía/fecha y archivado.
- Implementado formulario amplio con póliza/compañía opcionales, asegurado/afectado, ramo, relato, nota interna y múltiples archivos PDF/JPG/PNG hasta 25 MB.
- Las coincidencias por documento/nombre y por número/patente son sugerencias; la vinculación requiere selección explícita.
- Se crea un registro de trabajo por archivo; el progreso de análisis queda pendiente hasta definir scheduler/modelo.

### Fase 4 — Análisis documental y sugerencias

- Pendiente hasta definir e integrar proveedores/modelos IA. La cola y los metadatos ya admiten estado de análisis y referencias futuras por archivo.
- Mantener las comprobaciones deterministas de fecha y vigencia activas, sin presentar resultados de modelo que no se ejecutaron.
- Excluir informes médicos y su análisis de este alcance.

### Fase 5 — Ficha del caso y asistente

- La lista/detalle actual incluye requisitos, adjuntos, bitácora, gastos e informes; la tabla de conversación queda lista para integrar el chat.
- El chat y las respuestas numeradas quedan pendientes de integrar el modelo seleccionado.
- Los mensajes y reportes existentes siguen siendo borradores hasta la acción explícita del productor.

### Fase 6 — Gastos, informes y dossier

- Añadidos registro de gastos y resumen de reclamado/aprobado/pagado.
- Añadidos borradores de resumen, constancia y denuncia, y vista global con filtros.
- El dossier se bloquea mientras falta un requisito bloqueante; al completarse se abre un documento listo para imprimir/guardar como PDF desde el navegador, ordenado según la configuración.
- No se integrará envío a portales ni se presentará nada ante ARCA en esta versión.

### Fase 7 — Configuración, alertas y plazos

- Añadida configuración por compañía/ramo/tipo para checklist, orden del dossier, plazos operativos e instrucciones de voz.
- La UI aclara que los plazos son operativos y no legales.
- Los campos de organización/productor y scheduler están preparados para una fase futura; no se eligió cron, hosting o worker.

### Fase 8 — Datos de ejemplo, documentación y evaluación

- Conservados los casos sintéticos existentes y añadido un expediente sintético de accidentes personales sin informe médico.
- Documentados carga manual, migraciones, cola pendiente y reglas en `README.md`.
- Añadido `scripts/evaluar-siniestros.ts`; falta que se proporcione el conjunto de 10 expedientes anonimizados.
- No se ejecutaron pruebas automatizadas en esta implementación.

## 5. Criterios de aceptación y estado

- Clasificación/extracción con referencias por página: pendiente de configuración del modelo y del conjunto documental.
- Vigencia de póliza en fecha del hecho: cubierta por validación determinista y evento de revisión.
- Preservación de overrides manuales durante reanálisis: pendiente, porque el análisis IA aún no se ejecuta.
- Conversación numerada: pendiente de integración de modelo; las tablas existen.
- El dossier se bloquea mientras haya requisitos bloqueantes; cuando está completo abre la vista imprimible/guardar PDF sin envío externo.
- Carga manual y revisión siguen disponibles sin IA.
- Los errores no incluyen contenido de archivos; informes médicos excluidos.
- Filtros de compañía/fecha y reglas operativas configurables están disponibles. El progreso/recuperación de trabajos queda pendiente del scheduler.
- El runner mide clasificación ≥95% y extracción ≥90% cuando se proporcione el set de 10 casos; el umbral no se verificó en esta rama.

## 6. Decisiones acordadas y pendientes

1. **Informes médicos:** fuera del alcance aprobado.
2. **Ejecución de trabajos:** el contrato queda desacoplado del scheduler y hosting; el despliegue elegirá más adelante cron, worker o servicio externo.
3. **Plazos:** se presentan como reglas operativas configurables, no como asesoramiento legal.
4. **Evaluación:** se requieren 10 casos anonimizados con resultado esperado para verificar precisión.
5. **Modelos y presupuesto:** proveedor, modelos y cuotas se definirán más adelante para los agentes de la aplicación.

## 7. Secuencia de revisión

1. Plan aprobado e implementado en `feat/siniestros-v2` hasta el flujo manual, configuración, documentos, informes y dossier imprimible.
2. Ejecutar las migraciones `0018`–`0023` en el entorno correspondiente antes de usar la nueva base de datos.
3. Definir modelos/proveedor y scheduler en una fase futura; luego implementar análisis documental y conversación del agente.
4. Incorporar los 10 casos anonimizados y correr el evaluador antes de declarar alcanzadas las métricas.
5. No activar integraciones externas ni enviar comunicaciones automáticamente.
