---
tipo: spec
proyecto: UNIQO (antes Radar Leads)
estado: borrador
creada: 2026-10-29
origen: video de demo del "Agente Validador de Pagos" de Handle (usehandle.ai), grabado el 29/10/2026
---
# Agente Validador de Pagos v2 — directrices para desarrollo con IA

> **Para quién:** el desarrollador de IA de UNIQO o Claude Code, en el repo `SpanitanoSolutions/radar_leads`. Está escrito para pegarse completo, anexo incluido.
> **Relacionado:** [[Radar Leads/Specs/Agente de cotización v2]] (capa de IA y reglas comunes) · [[Radar Leads/Specs/Agente de siniestros v2]] · [[Radar Leads/Specs/Arquitectura multi-tenant y empaquetado]]

---

## 0. Antes de escribir código
1. Leé `README.md`, el esquema de Drizzle y todo lo que hoy existe del Validador de pagos (`/agentes/validador`: revisión de cuotas y comprobantes). Revisá también Cobranza (`/agentes/cobranza`), Conciliador (`/agentes/conciliador`), la cartera (`/asegurados`, pólizas y cuotas) y Vencimientos (`/vencimientos`).
2. Escribí `docs/PLAN-validador-v2.md` con una tabla **"ya existe / falta / cambia"**, las migraciones y las fases. Mostrámelo y esperá mi OK antes de implementar.
3. Si algo del Anexo choca con las reglas de la sección 2, anotalo como **pregunta abierta** en vez de implementarlo.

## 1. Qué hace el agente y dónde encaja
El Validador es **la fuente de verdad del estado de pago de cada cuota** de la cartera: pendiente, pagada, vencida o cancelada. Cada día:
1. **trae** el estado de cobranza de cada compañía;
2. **lo cruza** con las cuotas de la cartera de UNIQO;
3. **marca** cuál se pagó, cuál está por vencer, cuál está vencida (respetando el período de gracia de cada compañía y ramo) y cuál fue cancelada;
4. **muestra** los totales y la lista para actuar, y avisa por WhatsApp o email (con aprobación).

**Límites con los otros agentes:**
- **Validador:** decide el *estado* de cada cuota.
- **Cobranza:** *actúa* sobre las cuotas vencidas o por vencer (borradores de mensajes al asegurado). Lee del Validador.
- **Conciliador:** cruza *comisiones* contra liquidaciones. Usa las cuotas pagadas del Validador.
- **Vencimientos y Renovaciones:** la pestaña Renovaciones del Validador reutiliza la lógica de `/vencimientos`; no la duplica.

## 2. Reglas de UNIQO que no se rompen
- **La IA pasa siempre por `src/lib/ia/`:** modelo por tarea, salidas estructuradas validadas con zod, registro en `ia_uso` y cuota por organización. Sin IA, el agente funciona con importaciones en formatos conocidos y carga manual.
- **La IA trabaja; el código verifica.** Hoy la IA extrae datos de listados y comprobantes. Cuando las compañías estén conectadas (sección 4.1), va a tener un rol mucho mayor: interpretar lo que devuelve cada conector, resolver excepciones, priorizar y proponer acciones. En todos los casos, el **matching** (cuota ↔ pago) y el **cálculo de estados** se verifican con funciones puras y deterministas en `src/lib/validador/`, con tests. Lo que la IA concluye y el código no puede verificar queda "a revisar" hasta que el productor lo confirme.
- **Nada sale solo:** los avisos por WhatsApp o email al asegurado o al productor salen como borradores o como notificaciones internas, según la configuración. Ningún mensaje a un asegurado sale sin aprobación.
- **Conexiones simuladas:** los portales de compañías siguen detrás de un adaptador simulado. No hagas scraping de portales reales ni guardes contraseñas en texto plano: las credenciales van cifradas con AES-GCM y una clave de entorno, nunca aparecen en los logs y por ahora solo existe la UI y el modelo.
- **Multi-tenant:** toda tabla nueva lleva `org_id` y `producer_id`. Los períodos de gracia y la programación se resuelven en cascada: plataforma → organización → productor.
- **Convenciones del repo:**
  - código en español, lógica en `src/lib/` con tests al lado;
  - CSS propio, Server Actions;
  - migraciones a partir de la última;
  - rama `feat/validador-v2` y PR;
  - UI en rioplatense con voseo, montos con formato argentino (`$ 1.915,61`).
- **Las tareas largas van en segundo plano** (la cola `ia_trabajos`). Validar miles de cuotas o procesar un PDF de 40 páginas no entra en una request.

## 3. Adaptación al mercado argentino

| En el video (México) | En UNIQO (Argentina) |
|---|---|
| MXN, USD, UDI | ARS y USD (no hay UDI). Si no hay cotización configurada, no se suman monedas distintas: se muestra una línea por moneda |
| Recibo | Cuota o cupón de pago (cuota n de N) |
| Serie "4/12" | Número de cuota y total de cuotas |
| Inciso | Ítem o unidad de la póliza (clave en **flotas**: un vehículo por ítem) |
| Endoso | Endoso (igual) |
| Formas de pago | Débito automático (tarjeta o CBU), Pago Fácil / Rapipago, transferencia, Mercado Pago, efectivo al productor |
| Ramos: Automóviles, Vida, GMM, RC, Daños, Marítimo y Transportes, Otros | Automotor, Flotas, Vida, AP / Salud, RC, Combinado familiar / Integral de comercio, Incendio, Transporte, Caución, ART, Otros |
| Aseguradoras: GNP, Qualitas, Banorte, SMNYL, Chubb, Mapfre, MetLife, HDI… | Catálogo de UNIQO (Sancor, La Segunda, Federación Patronal, Rivadavia, San Cristóbal, Mercantil Andina, Allianz, Zurich, Meridional, Rus, Provincia Seguros, Mapfre…) |
| Zona horaria America/Mexico_City | America/Argentina/Buenos_Aires |
| Cancelación por falta de pago | Suspensión o anulación por falta de pago según las condiciones de cada compañía (motivo configurable) |

**Período de gracia:** la cantidad de días después del vencimiento antes de marcar la cuota como vencida, configurable por **compañía × ramo**, con dos valores: **primera cuota** y **cuotas siguientes**. Los valores por defecto los carga el productor; no inventamos plazos.

## 4. De dónde salen los datos de pago

### 4.1 Hacia dónde vamos: compañías conectadas
> **Definición común:** la interfaz, los tipos de conector, los permisos (leer, cotizar, presentar, comprometer) y las tablas compartidas están en [[Radar Leads/Specs/Conectores de compañías]] (archivo `Conectores de compañías - spec común.md`). Si hay diferencias, manda esa spec.

En el futuro, **las compañías van a estar conectadas** y la IA va a trabajar sobre esos datos todos los días. La arquitectura tiene que quedar lista desde ahora, aunque hoy los conectores sean simulados:
- **Interfaz única de conector** en `src/lib/conectores/`. Cada compañía implementa `ConectorCompania` con, al menos, `obtenerEstadoCobranza(credencial, desde, hasta)`, `obtenerCuotas(poliza)` y `obtenerCancelaciones(desde, hasta)`, y declara su tipo: `api` (servicio web de la compañía), `portal` (un agente con IA que navega el portal del productor) o `archivo` (importación). El resto del Validador **no sabe** de dónde vino el dato.
- **La IA normaliza la salida de cada conector.** Cada compañía devuelve campos, estados y códigos distintos. La IA (Haiku 5.5) traduce esa respuesta al esquema normalizado, y el mapeo aprendido se guarda por compañía para no repetir llamadas cuando el formato es estable.
- **Agente de portal (fase futura).** Para las compañías sin API, un agente con IA (Sonnet 5.5 con herramientas de navegador) entra al portal con la credencial cifrada, descarga o lee la cobranza y devuelve el resultado normalizado. Solo lee: nunca modifica nada en el portal. Corre en segundo plano, con límites de tiempo y registro completo en la bitácora.
- **La IA resuelve excepciones**, no solo extrae:
  - pagos que no matchean (monto distinto, otra cuota, pago agrupado de varias cuotas o de una flota completa);
  - cambios de estado raros (una cuota pagada que vuelve a impaga, o una anulación sin aviso);
  - diferencias entre lo que dice la compañía y lo que tiene la cartera.
  Para cada una explica qué pasa, propone la acción (confirmar, revisar, enviar a Cobranza, avisar al productor) y la deja para aprobar.
- **Resumen diario con IA:** después de cada corrida, un resumen corto para el productor ("se confirmaron 39 pagos; 12 cuotas vencen esta semana; 3 casos raros para revisar") por la app, WhatsApp o email, según la configuración.
- **Salud de cada conector:** último éxito, errores, credencial vencida o portal cambiado. Si un conector falla, el Validador vuelve solo a la importación manual para esa compañía y lo avisa.

### 4.2 Fuentes disponibles hoy (mientras no hay conexiones reales)
1. **Importación del listado de cobranza de cada compañía**, como implementación `archivo` del conector. El productor descarga de cada portal el listado de cuotas pagas o impagas (Excel, CSV o PDF) y lo sube. Formatos conocidos van a un parser determinista por compañía; formatos desconocidos o PDFs, a la extracción con IA (Haiku 5.5) hacia un esquema normalizado. El productor confirma el mapeo la primera vez y queda guardado como plantilla de esa compañía.
2. **Comprobantes del asegurado:** foto o PDF de una transferencia, un ticket de Pago Fácil o un pago de Mercado Pago. Se suben a mano (más adelante, por WhatsApp). La IA extrae monto, fecha, medio, referencia, CBU o CUIT de destino y nombre; el matching determinista propone la cuota, y el productor confirma.
3. **Conectores simulados:** implementaciones falsas de `ConectorCompania` (una de tipo `api` y una de tipo `portal`) para el seed, los tests y el E2E. Así el flujo de compañías conectadas queda probado de punta a punta antes de tener una conexión real.
4. **Carga manual:** marcar una cuota como pagada con fecha, medio y comprobante opcional.

## 5. Funcionalidades

### 5.1 Inicio del agente (`/agentes/validador`)
- Botones arriba: **Configuración**, **Actividad** (bitácora de corridas y cambios) y **Ejecutar validación** (corre ahora, en segundo plano, con progreso).
- Tarjetas: **Cuotas monitoreadas** · **Pagos confirmados hoy** · **Cuotas pendientes** · **Cuotas vencidas**.
- Pestañas: **Pendientes · Pagadas · Canceladas · Renovaciones**.
- Buscador por póliza o asegurado, filtros (compañía, ramo, medio de pago, productor, rango de fechas) y exportar.

### 5.2 Pendientes
- Vistas: **Cobranza** (por defecto), **Calendario** y **Tabla**.
- **Cobranza:** tres bloques de totales por moneda.
  - **Esta semana:** monto total por moneda, cantidad de pagos y de asegurados.
  - **Próximos:** lo mismo, para lo que vence más adelante.
  - **Vencidos:** lo mismo, para lo que ya pasó el período de gracia.
- Debajo, una lista agrupada por **asegurado**: nombre, cantidad de cuotas, compañía, monto y etiqueta de días ("Hoy", "en 3 d", "vencida hace 5 d"), con paginación ("Mostrando 1–10 de 89").
- Al **expandir** un asegurado, se ve una sub-tabla por cuota con: póliza, cuota (4/12), ítem, endoso, número de cupón, monto, vencimiento, medio de pago, estado (con punto de color) y última revisión ("hace 46 d").
- **Calendario:** cuotas por día del mes, con el monto por moneda.
- **Tabla:** todas las columnas planas, ordenables y exportables.
- Acciones por cuota: marcar pagada (con comprobante), adjuntar comprobante, ver la póliza en la cartera y **"Enviar a Cobranza"** (crea el borrador en el agente de Cobranza).

### 5.3 Pagadas
- Vistas Resumen y Tabla.
- **Este mes** y **Anteriores:** monto por moneda, cantidad de pagos y de asegurados.
- Lista por asegurado: compañía, monto y fecha de pago; al expandir, el detalle de cuotas y el **origen de la confirmación** (listado de la compañía, comprobante, portal o manual).

### 5.4 Canceladas
Tabla con asegurado, compañía, póliza, endoso, cuota, ítem, cupón, monto, fecha de cancelación, motivo, estado y última revisión.

### 5.5 Renovaciones
Tarjetas **Por renovar** y **Renovadas** (monto y cantidad de pólizas) y la lista correspondiente. Reutiliza los datos de Vencimientos. Estado vacío: "No hay pólizas por renovar".

### 5.6 Configuración (`/agentes/validador/configuracion`), con cuatro pestañas
1. **Credenciales:** lista de compañías (con contador, por ejemplo "31") y un punto de estado (verde si hay credencial activa, naranja si no tiene). El detalle de cada una muestra el portal de la compañía, credenciales "2 (2 activas)", un identificador de proveedor y una tabla de credenciales (etiqueta, estado, último uso, creada) con agregar, editar y borrar. Hoy es solo UI y almacenamiento cifrado; el adaptador sigue simulado. Además, en UNIQO: **plantilla de importación** por compañía (el mapeo de columnas guardado).
2. **General — Períodos de gracia por ramo:** "Días adicionales después del vencimiento antes de marcar una cuota como vencida. Se configura por ramo y compañía". Interruptor "Habilitar períodos de gracia", pestañas por ramo y una grilla compañía × (**1.ª cuota** días, **cuotas siguientes** días). Botón "Guardar cambios".
3. **Programación — Validación automática programada:**
   - frecuencia (diaria, semanal o mensual);
   - hora de ejecución (con zona horaria);
   - hora de **enriquecimiento** (un segundo paso más tarde, que procesa con IA los listados y comprobantes pendientes y completa datos faltantes);
   - información de ejecución: última ejecución, estado ("OK" o "Con errores", con detalle) y próxima ejecución;
   - botón "Guardar configuración".
4. **Notificaciones:** canales **WhatsApp** y **Email**, cada uno con un interruptor "Activar". Hay que definir destinatarios, qué avisar (pagos confirmados, cuotas por vencer, vencidas, errores de la corrida) y si va como resumen diario o evento por evento. Los avisos a asegurados se generan siempre como borradores.

## 6. Cómo funciona por detrás

```
Cron /api/cron/validador  (CRON_SECRET; hora de la Programación; solo si el agente está activo)
  1. Por cada compañía con fuente disponible (listado importado pendiente o adaptador de portal):
       ├─ formato conocido → parser determinista
       └─ formato desconocido / PDF → ia_trabajos → Haiku 5.5 extrae al esquema normalizado
                                         (si falla la validación zod → reintento con Sonnet 5.5)
  2. Normalización: {compania, poliza, item, endoso, cuota_n, cuota_total, cupon,
                     monto, moneda, vencimiento, fecha_pago?, medio?, estado_compania}
  3. Matching determinista (src/lib/validador/matching.ts):
       póliza + cuota + monto (tolerancia configurable) + moneda + vencimiento
       → coincidencia exacta: actualiza el estado
       → coincidencia parcial: queda "a revisar" con candidatos y puntaje
       → sin coincidencia: "pago no identificado"
  4. Cálculo de estados (src/lib/validador/estados.ts):
       pendiente / por vencer / vencida (vencimiento + gracia[compañía][ramo][1.ª o siguiente]) / pagada / cancelada
  5. Bitácora y resumen de la corrida (OK / con errores)
Hora de enriquecimiento
  6. Comprobantes subidos → Haiku 5.5 extrae → matching → propuestas para confirmar
  7. Casos "a revisar" → Sonnet 5.5 explica el candidato más probable y por qué (solo sugiere)
  8. Notificaciones según la configuración (borradores para asegurados)
```

**Costo estimado de IA:**
- **Hoy (importaciones y comprobantes):** un listado PDF de unas 20 páginas con Haiku cuesta alrededor de un centavo de dólar; un comprobante, menos de una décima de centavo. Un productor típico gastaría menos de USD 1 o 2 por mes.
- **Con compañías conectadas:** se suman la normalización diaria de cada conector (barata con Haiku, y casi nula si el mapeo queda guardado), las excepciones y el resumen diario (Sonnet). El agente de portal es lo más caro, porque cada navegación consume más tokens: hay que medirlo por compañía cuando exista. Estimación inicial: **USD 2 a 6 por productor al mes**, a confirmar con `ia_uso`.

## 7. Modelo de datos (orientativo)
Extender las tablas existentes de pólizas y cuotas; no duplicarlas.
- `cuotas`: más `item`, `endoso`, `cupon`, `moneda`, `medio_pago`, `estado_validacion`, `fecha_pago`, `origen_confirmacion` (`listado` | `comprobante` | `portal` | `manual`), `ultima_revision` y `motivo_cancelacion`.
- `validador_corridas`: inicio, fin, estado, compañías procesadas, cuotas actualizadas, errores (JSON) y costo de IA.
- `validador_fuentes`: archivos importados o resultados del adaptador, con compañía, período, formato, estado de procesamiento y filas extraídas.
- `validador_pagos_detectados`: cada pago normalizado, con su match (cuota_id, puntaje, estado `confirmado` | `a_revisar` | `no_identificado`).
- `validador_comprobantes`: archivo, datos extraídos, cuota propuesta y confirmación.
- `validador_gracia`: org_id, producer_id?, compañía, ramo, días de la 1.ª cuota, días de las siguientes y habilitado.
- `validador_config`: frecuencia, hora de ejecución, hora de enriquecimiento, zona horaria, tolerancia de monto y notificaciones (canales, destinatarios, eventos, modo).
- `credenciales_portal`: compañía, etiqueta, usuario, secreto cifrado, estado y último uso. Compartida con Cotización.
- `plantillas_importacion`: compañía y mapeo de columnas.

## 8. Criterios de aceptación
- [ ] Dada una cuota de automotor que vence hoy en una compañía con 15 días de gracia para la 1.ª cuota, entonces aparece en "Esta semana" y no en "Vencidos" hasta el día 16.
- [ ] Dadas una 1.ª cuota y una siguiente de la misma compañía y ramo con gracias distintas, entonces cada una usa la suya.
- [ ] Dado un listado XLSX de una compañía con formato guardado, cuando se importa, entonces se actualizan las cuotas coincidentes y las demás quedan en "a revisar" o "no identificado", sin llamar a la IA.
- [ ] Dado un listado PDF desconocido, entonces la IA lo extrae, el productor confirma el mapeo y queda la plantilla guardada.
- [ ] Dado un comprobante de transferencia subido, entonces se propone la cuota correcta con su puntaje, y no se marca pagada sin confirmación.
- [ ] Los totales por moneda nunca mezclan ARS con USD.
- [ ] "Ejecutar validación" crea una corrida visible en Actividad con su estado y errores.
- [ ] El cron respeta la frecuencia, la hora y la zona horaria, y no corre si el agente está desactivado.
- [ ] Ninguna credencial aparece en texto plano en la base ni en los logs.
- [ ] "Enviar a Cobranza" crea un borrador en el agente de Cobranza con los datos de la cuota.
- [ ] Sin IA activa, todo funciona con formatos conocidos y carga manual, y los controles de IA se ocultan.
- [ ] Con los conectores simulados `api` y `portal`, la corrida diaria trae datos, la IA los normaliza, las excepciones quedan explicadas con su acción propuesta y se genera el resumen diario. Cambiar de conector no requiere tocar el resto del Validador.
- [ ] Si un conector falla, la compañía vuelve a importación manual, se registra el error en la salud del conector y el productor recibe aviso.
- [ ] **Set de prueba:** con listados reales anonimizados de 3 compañías y 20 comprobantes (que provee Julian), la extracción de monto, fecha y póliza acierta al menos el 95 % y el matching sugiere la cuota correcta al menos el 90 %. El script queda en `scripts/evaluar-validador.ts`.
- [ ] E2E: importar listado → ver totales → expandir asegurado → confirmar comprobante → cuota pagada → enviar vencida a Cobranza.

## 9. Fuera de alcance
- Conexiones reales con compañías (API o agente de portal). Quedan para el proyecto de integraciones, pero **esta versión deja lista la interfaz `ConectorCompania`, los conectores simulados, la normalización con IA, el manejo de excepciones y la salud de conectores**, para que conectar una compañía real sea agregar una implementación y no rehacer el agente.
- Débito automático o cobro real (Mercado Pago, bancos).
- Envío real por WhatsApp (queda simulado hasta el proyecto de integraciones).
- Copiar la marca, los textos o el diseño visual del producto de referencia: lo usamos solo como referencia funcional.

## 10. Entregables
`docs/PLAN-validador-v2.md`, migraciones, código, tests, seed de demo (6 compañías, unas 300 cuotas en ARS y USD en todos los estados, 2 listados de ejemplo y 5 comprobantes ficticios), script de evaluación, README actualizado (incluida la tabla de crons) y PR desde `feat/validador-v2`.

---

## Anexo — Qué muestra el video de referencia

**Fuente:** grabación de pantalla (2:25) de un video de YouTube de 3:18 que presenta el "Agente Validador de Pagos" de Handle (mercado mexicano). Lo que sigue sale de la pantalla y de los textos superpuestos. **El audio no se pudo transcribir.** Textos superpuestos: "Agente de Cl…", "Información de pagos", "Periodos de Gracia", "Dependiendo la compañía".

1. **Inicio** (`/insurance/agents/payments`):
   - botones Configuración, Actividad y **Ejecutar Validación**;
   - tarjetas: Recibos monitoreados 3321 · Pagos confirmados hoy 39 · Recibos pendientes 1600 · Recibos vencidos 1707;
   - pestañas: Pendientes · Pagados · Cancelados · Renovaciones;
   - buscador "Buscar póliza o cliente…", Filtros y Exportar.
2. **Pendientes → vista Cobranza** (también Calendario y Tabla):
   - Esta semana: $753.142,44 MXN · 436,46 UDI · 93 pagos · 89 clientes;
   - Próximos: $3.079.067,30 MXN · 9.559,64 UDI · $5.614,45 USD · 383 pagos · 356 clientes;
   - Vencidos: $16.399.806,13 MXN · $66.910,87 USD · 1715 pagos · 1201 clientes;
   - lista: cliente (con contador de recibos), aseguradora (GNP, Chubb, Inbursa, Banorte, SMNYL), monto y días (etiqueta "Hoy"); paginación "Mostrando 1–10 de 89 resultados";
   - fila expandida: póliza 664794781 · serie 4/12 · inciso — · endoso — · recibo 29933892721 · monto $1.915,61 MXN · vencimiento Hoy · forma de pago Mensual · estado Pendiente · última revisión hace 46 d.
3. **Pagados:**
   - vistas Resumen y Tabla;
   - Este mes: $6.111.401,60 MXN · $437.176,02 USD · 612,00 UDI · 142 pagos · 166 clientes;
   - Anteriores: $22.025.548,85 MXN · $11.270,56 USD · 3490 pagos · 1312 clientes;
   - lista: cliente, aseguradora, monto y fecha de pago.
4. **Cancelados:** tabla con cliente, aseguradora (Chubb), póliza (UY 41999728…), endoso, serie (1/3, 1/2), inciso, recibo, monto, fecha de cancelación, motivo, estado "Cancelado" y última revisión (hace 12 d…).
5. **Renovaciones:** Por renovar $0,00 (0 pólizas) · Renovadas $0,00 (35 pólizas) · "No se encontraron pólizas por renovar".
6. **Configuración → Credenciales:**
   - "Proveedores 31": GNP Seguros (2 credenciales), Qualitas, Seguros Banorte, SMNYL, Chubb, Mapfre, MetLife México (0, punto naranja), HDI, Ana Seguros, Allianz, Zurich, Inbursa, AXA, Afirme, Meridional, Mercantil Andina, Bupa, Insignia Life, SURA, Prevem, Reale, Sancor, BBVA Seguros (Uruguay), Provincia Seguros, Qualitas Salud, Plan Seguro, Red Bridge, Best Doctors, Bradesco y "¿No encontrás tu aseguradora?";
   - detalle: "GNP Seguros · Portal de aseguradora · Credenciales 2 (2 activas) · Slug del proveedor gnp"; tabla de credenciales con etiqueta, estado, último uso, creada, editar y borrar; "+ Agregar credencial".
7. **Configuración → General:** "Periodos de Gracia por Ramo — Días adicionales después del vencimiento antes de marcar un recibo como vencido. Se configura por ramo y aseguradora". "Habilitar periodos de gracia". Ramos: Automóviles, Vida, Gastos Médicos Mayores, Responsabilidad Civil, Daños, Marítimo y Transportes, Otros. Grilla de aseguradoras con columnas "1er recibo" y "Subsecuentes" en días (por ejemplo GNP Seguros 15 / 0). Botón "Guardar cambios".
8. **Configuración → Programación:** "Validación automática programada — Ejecuta la validación de pagos automáticamente según la frecuencia configurada". Frecuencia Diario / Semanal / Mensual; hora de ejecución 07:00 America/Mexico_City; hora de enrichment 08:00; información de ejecución: última 07-07-2026 07:00, estado "Con errores", próxima 08-07-2026 07:00. Botón "Guardar configuración".
9. **Configuración → Notificaciones:** canales WhatsApp y Email, cada uno con "Activar".
