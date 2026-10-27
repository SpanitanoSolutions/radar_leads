# UNIQO: de radar de leads a gestión de cartera con agentes

Este documento es el encargo completo. Leelo entero antes de escribir código y trabajá fase por fase, en orden, con un commit por fase. Si algo de lo que sigue no coincide con lo que encontrás en el repo, gana el repo: adaptá el plan y anotá la decisión en el mensaje del commit.

## 1. Contexto

UNIQO es una app para un **productor asesor de seguros independiente de Mar del Plata** (miembro de HR Productores). Hoy la app es un radar de leads: detecta empresas que podrían necesitar seguros (licitaciones de COMPR.AR, Boletín Oficial de PBA) y las muestra como "Leads del día".

**Cambia el foco del producto.** Lo principal pasa a ser:

1. **Organizar la cartera del productor**: sus asegurados, pólizas, vencimientos y oportunidades de mejorar coberturas, importada desde un CSV.
2. **Agentes** que le sacan trabajo operativo: Cotización, Validador de pagos, Cobranza, Siniestros y Conciliador.
3. **Captación de clientes** (los leads de hoy): queda como sección aparte del menú, complementaria.

El usuario no es técnico y trabaja desde la computadora. Todo el texto de la interfaz va en **español rioplatense, con voseo** ("Importá tu cartera", "Revisá"), frases cortas y sin jerga técnica.

## 2. Reglas del proyecto (leer antes de empezar)

- **Next.js 16.4.** Leé `AGENTS.md` y las guías de `node_modules/next/dist/docs/` antes de tocar rutas, caché o middleware. En este proyecto ya se usa:
  - `cacheComponents`;
  - `src/proxy.ts` en lugar de middleware;
  - `export const instant = false` en las pantallas privadas;
  - `await connection()` antes de leer la base (ver `src/lib/datos.ts`).

  Seguí esos mismos patrones.
- **Base de datos**: Postgres con Drizzle (`src/db/schema.ts`). Cada cambio de esquema va con su migración generada por `npm run db:generate`, en `drizzle/`, numerada a continuación de la última. `scripts/preparar-db.ts` las aplica en cada build. **Nunca borres datos reales.** Las migraciones tienen que funcionar sobre una base que ya tiene leads y cartera cargados.
- **Estilos**: CSS propio en `src/app/globals.css`, con las variables de `:root`. No agregues Tailwind ni librerías de componentes. Podés reorganizar el CSS en archivos por pantalla si crece demasiado.
- **Código en español**, como el resto del repo: nombres de archivos, funciones, variables y comentarios.
- **Lógica de negocio en funciones puras** dentro de `src/lib/`, con tests en Vitest al lado (`*.test.ts`). Las pantallas solo arman la vista. Los cambios se guardan con server actions.
- **Accesibilidad y responsive**:
  - todo usable con teclado;
  - objetivos táctiles de al menos 40px;
  - contraste AA;
  - sin scroll horizontal de página a 390px de ancho (las tablas pueden scrollear dentro de su contenedor).
- **Datos de personas**: la cartera tiene nombres, DNI/CUIT, teléfonos y direcciones. Todo queda detrás del login que ya existe (`src/lib/auth.ts`). No mandes esos datos a servicios externos ni los pongas en logs.
- **Nada se manda solo.** Ningún agente envía mensajes, emails ni reclamos sin que el productor lo apruebe, salvo que él lo active explícitamente en la configuración del agente.
- Al terminar cada fase tienen que pasar `npm run lint`, `npm test` y `npm run build`.

## 3. Preparación (fase 0)

1. La rama `mejoras-valor` tiene trabajo que todavía no está en `main`: tabla `cartera` simple, `/cartera`, resumen diario, teléfonos, guion de contacto, etc. Mergeala en `main` en local, resolvé los conflictos y corré tests y build. **No hagas push a `main`.** Vercel despliega `main` a producción.
2. Creá la rama `cartera-agentes` desde ese `main` local. Todo el trabajo de este plan va ahí.
3. Los diseños de referencia están en **`docs/diseno/`**. Si la carpeta no existe, pedímela antes de seguir.

### Cómo leer los diseños

Cada `docs/diseno/<Pantalla>.dc.html` es una maqueta interactiva:

- HTML con estilos en línea.
- Huecos `{{variable}}` que se completan desde una clase `Component` con un método `renderVals()` al final del archivo.
- `<sc-for list="{{x}}" as="y">` es un bucle y `<sc-if value="{{x}}">` un condicional.

**No copies ese código.** Usalo como especificación de:

- la estructura y jerarquía de cada pantalla;
- los textos exactos de la interfaz, que ya están revisados: usalos tal cual;
- los estados (vacío, error, seleccionado, confirmado);
- los datos de ejemplo, que tienen que coincidir con los del seed;
- las reglas de negocio que están en `renderVals()`: oportunidades, chequeos del validador, secuencia de cobranza, cálculo de diferencias del conciliador.

Pasalo a componentes de React, con clases CSS en vez de estilos en línea.

| Archivo | Pantalla | Ruta nueva |
|---|---|---|
| `Cartera.dc.html` | Lista de asegurados + panel lateral | `/asegurados` (y `?ver=<id>` abre el panel) |
| `Asegurado.dc.html` | Ficha completa del asegurado | `/asegurados/[id]` |
| `Importar.dc.html` | Importar cartera (CSV, 3 pasos) | `/importar` |
| `Cotizacion.dc.html` | Agente de cotización | `/agentes/cotizacion` |
| `Validador.dc.html` | Agente validador de pagos | `/agentes/validador` |
| `Cobranza.dc.html` | Agente de cobranza | `/agentes/cobranza` |
| `Siniestros.dc.html` | Agente de siniestros | `/agentes/siniestros` |
| `Conciliador.dc.html` | Agente conciliador | `/agentes/conciliador` |
| `Configuracion.dc.html` | Configuración · Conexiones | `/configuracion` |
| `Main.dc.html` | Leads del día | `/leads` |
| `Lead.dc.html` | Ficha de un lead | `/leads/[id]` (ya existe) |
| `Sectores.dc.html` | Mis sectores | `/sectores` (ya existe) |

`/` redirige a `/asegurados`. La ruta vieja `/cartera` de `mejoras-valor` redirige a `/importar`.

## 4. Fases

### Fase 1: Estructura y navegación

Reemplazá el lateral oscuro (`src/components/Lateral.tsx`) por la estructura de los diseños.

- **Barra superior blanca** de 56px con:
  - logo y "UNIQO · Administración de seguros";
  - nombre del productor y "HR Productores", leídos de la configuración (no hardcodeados);
  - Ayuda;
  - Salir.
- **Menú lateral claro** con tres grupos:
  - **Mi cartera**: Asegurados (cantidad), Vencimientos (cantidad que vence en 30 días, en ámbar), Importar cartera.
  - **Agentes**: Cotización, Validador de pagos, Cobranza, Siniestros, Conciliador. Cada uno con un contador de "lo que requiere tu atención". Si el agente no está configurado, lleva la etiqueta "Configurar".
  - **Captación de clientes**: Leads del día (cantidad), Mis sectores.
  - Al pie: "Última importación · fecha · archivo" y **Configuración**, con una insignia si hay conexiones pendientes.
- **Ítem activo**: fondo `--acento-suave`, texto `--acento-texto`, `aria-current="page"`.
- **En celular** el menú se colapsa en un botón que lo abre como panel.
- Mové las pantallas de leads actuales a `/leads` sin romper `/leads/[id]` ni `/sectores`.
- Los contadores salen de una sola consulta liviana por pedido, en una función de `src/lib/`. No hagas una consulta por ítem.

### Fase 2: Modelo de datos

Diseñá el esquema nuevo en `src/db/schema.ts`. Como guía, ajustable:

- `asegurados`:
  - tipo (`persona` | `empresa`), nombre o razón social, DNI/CUIT, localidad;
  - teléfono, email, domicilio;
  - contacto de administración (nombre, teléfono, email) para empresas;
  - cliente desde, notas;
  - `esEjemplo`.
- `polizas`:
  - asegurado, ramo, compañía, número, bien asegurado, cobertura;
  - vigencia desde/hasta, prima, cantidad de cuotas, forma de pago;
  - año de la última actualización de suma asegurada.
- `cuotas`: póliza, número, monto, vencimiento, estado (`pendiente` | `pagada` | `vencida`), pagada el, medio de pago.
- `comprobantes`: cuota, canal (WhatsApp/email/manual), medio, fecha, monto, destino, número de operación, archivo, resultado de cada chequeo, estado (`por_revisar` | `confirmado` | `rechazado`).
- `seguimientos_cobranza`: cuota, paso de la secuencia, estado (activo/pausado/terminado), motivo de pausa, promesa de pago.
- `mensajes`: asegurado, canal, texto, estado (`borrador` | `aprobado` | `enviado` | `omitido`), agente que lo generó, motivo ("por qué ahora"), enviado el.
- `siniestros`: póliza, tipo, fecha, lugar, relato, número en la compañía, etapa (aviso → documentación → en la compañía → inspección → liquidación → pago), cerrado, monto pagado.
- `siniestro_documentos` y `siniestro_eventos`, para el historial.
- `solicitudes_cotizacion`: asegurado o lead, ramo, bien, origen, estado, cotizaciones recibidas por compañía.
- `liquidaciones_comision`: compañía, período, recibida el, monto liquidado, depositado, retenciones.
- `liquidacion_items`, el detalle por póliza.
- `acuerdos_comision`: compañía, ramo, porcentaje.
- `conexiones`: tipo (whatsapp, email, mercadopago, banco, google_calendar, portal de cada compañía), estado, datos no secretos.
- `configuracion_agentes`: pasos de la secuencia de cobranza, qué pasos se mandan sin aprobación, reglas.
- `importaciones`: archivo, fecha, filas, errores, resumen.

Migrá los datos de la tabla `cartera` de `mejoras-valor` al modelo nuevo dentro de la migración: un asegurado por cliente y una póliza por ramo. Después de verificar, dejá la tabla vieja sin usar; no la borres en esta rama.

Actualizá `scripts/datos-iniciales.ts` y `scripts/limpiar-ejemplos.ts` para que siembren y limpien también los datos de cartera de ejemplo. Los datos de ejemplo tienen que ser **los mismos que en los diseños**:

- los 16 asegurados de `Cartera.dc.html` (Transportes Del Atlántico SRL, Gómez Lucía, Panadería La Espiga SA, etc.), con sus pólizas;
- las cuotas del Validador y de Cobranza;
- los siniestros;
- las liquidaciones del Conciliador.

Así la app se ve igual que el diseño en la primera carga.

### Fase 3: Cartera (lo principal)

**`/asegurados`**, según `Cartera.dc.html`:

- **Vistas rápidas** en tarjetas: vencen en 30 días, un solo ramo, contacto incompleto, empresas.
- **Filtros**: búsqueda por nombre, documento o número de póliza (sin importar tildes); ramo; compañía; vencimiento; "Más filtros" con localidad y tipo.
- Los filtros viven en la URL (`searchParams`) para poder compartir y volver.
- **Selección múltiple** con barra de acciones en lote.
- **Panel lateral** en `?ver=<id>`, que se cierra con Esc y devuelve el foco a la fila. Muestra:
  - datos y acciones;
  - los 3 próximos vencimientos (los urgentes, ≤ 30 días, con botones);
  - oportunidades de mejora con el interruptor "Agregar a seguimiento";
  - pólizas;
  - contacto.

**Reglas de oportunidades**: van en `src/lib/oportunidades.ts`, con un test por regla.

- Auto o moto con solo RC → subir a terceros completo.
- Auto con terceros completo → evaluar todo riesgo.
- Suma asegurada sin actualizar desde el año anterior → actualizar suma.
- Persona con auto y sin hogar → ofrecer hogar.
- Persona sin vida ni accidentes personales → ofrecer vida/AP.
- Empresa con flota o carga y sin integral → ofrecer integral.
- Flota sin RC → ofrecer RC.
- Empresa sin ART → revisar ART.
- RC profesional sin integral → ofrecer integral de consultorio.
- Integral de comercio sin RC → ofrecer RC.
- Falta teléfono o email → completar contacto.

**`/asegurados/[id]`**, según `Asegurado.dc.html`: ficha completa con pestañas Pólizas / Siniestros / Notas / Documentos.

**`/vencimientos`**: lista de pólizas que vencen, agrupadas por semana, con acceso a la ficha.

### Fase 4: Importar cartera

**`/importar`**, según `Importar.dc.html`: asistente de 3 pasos.

1. **Subir**: arrastrar o elegir un CSV o XLSX, con una planilla modelo descargable.
2. **Columnas**: mapeo de columnas con detección automática por nombre de encabezado, tolerante a mayúsculas, tildes y sinónimos ("Asegurado", "Cliente", "Razón social"). Muestra una vista previa de las primeras filas.
3. **Revisar**: resumen con filas OK, filas con advertencias y filas con errores, explicadas en castellano ("Fila 14: la fecha '31/02/2026' no existe"). El usuario elige **combinar** con lo existente (por DNI/CUIT + número de póliza) o **reemplazar**. Confirma y se guarda.

Detalles:

- Reutilizá el parser de `src/fuentes/csv.ts` si sirve. Las fechas pueden venir en `dd/mm/aaaa` y los montos con formato argentino (`1.234.567,89`).
- La lógica de mapeo y validación va en `src/lib/importacion.ts`, con tests: encabezados raros, filas vacías, separador `;`, CUIT con y sin guiones, fechas inválidas.
- Cada importación queda registrada en `importaciones`, y eso alimenta "Última importación" del menú.

### Fase 5: Configuración y conexiones

**`/configuracion`**, según `Configuracion.dc.html`.

- **Pestañas**: Conexiones / Mi cuenta / Equipo / Notificaciones / Facturación. En esta rama solo Conexiones y Mi cuenta tienen que funcionar; las demás muestran "Próximamente".
- **Grupos de conexiones**:
  - Mensajería: WhatsApp Business, Correo.
  - Compañías: Mapfre, Sancor, Federación Patronal, La Segunda, Fianzas y Crédito "Por email".
  - Pagos y bancos: Mercado Pago, Cuenta bancaria.
  - Calendario: Google Calendar.
- **WhatsApp**: el panel lateral reproduce el flujo del diseño: sin conectar → código → conectado, más el estado de las plantillas de mensaje.

**Importante: en esta rama no se integra ningún servicio real.**

- Definí una interfaz por tipo de conexión (`src/conexiones/<tipo>.ts`), con un adaptador **simulado** que guarda el estado en la base y devuelve datos de ejemplo.
- Dejá anotado en cada adaptador qué API real lo va a reemplazar: WhatsApp Business Cloud API, Gmail/IMAP, API de Mercado Pago, portales de productores de cada compañía.
- Ningún secreto va a la base en texto plano. Si hace falta, usá variables de entorno.

**Mi cuenta**: nombre del productor, matrícula, organización (HR Productores), teléfono y email. Esos datos se usan en la barra superior y en la firma de los mensajes (`[Nombre del productor]` en los diseños).

### Fase 6: Agentes

Para los cinco agentes vale lo mismo:

- La "inteligencia" (leer un comprobante, redactar un mensaje, armar una denuncia) va detrás de una interfaz en `src/agentes/<agente>/`, con una implementación determinista basada en reglas y plantillas.
- **No llames a ningún modelo de IA en esta rama.** Dejá el punto de enchufe documentado.
- Toda acción que "envía" algo pasa por la conexión simulada y deja registro en `mensajes` o en el historial correspondiente.

**6.1 Validador de pagos** (`/agentes/validador`):

- KPIs: cuotas del mes, pagos confirmados hoy, comprobantes por revisar, cuotas vencidas.
- Pestañas Pendientes / Por revisar / Vencidos / Pagados.
- Montos por cubo: vencen esta semana, próximos 30 días, vencidas.
- Tabla con fila expandible: comprobante recibido, chequeos con ✓ ✕ ! y acciones.
- Chequeos, en `src/lib/validador.ts` con tests:
  - el monto coincide con la cuota (si no, informar la diferencia exacta);
  - el destino es una cuenta de la compañía;
  - pagó antes del vencimiento (si no, avisar que hay que revisar vigencia);
  - el número de operación no se usó antes.
- "Confirmar pago" marca la cuota como pagada y corta la secuencia de cobranza.
- Si el comprobante tiene problemas, ofrece "Pedir otro comprobante" o "Confirmar igual".
- Aviso de conexiones: sin WhatsApp solo lee email; sin Mercado Pago o banco no confirma pagos sin comprobante.

**6.2 Cobranza** (`/agentes/cobranza`):

- KPIs del mes: por cobrar, cobrado con %, vencidas, cerca de quedar sin cobertura.
- **Para aprobar**: tarjetas con el borrador del mensaje, el "por qué ahora" y las acciones Aprobar y enviar / Editar / Omitir, más "Aprobar y enviar N mensajes". Las tarjetas de **llamada** no son mensajes: muestran teléfono e historial, con las acciones "Registrar promesa de pago" / "Llamé y no atendió" / "Posponer".
- **Seguimiento**: tabla de cuotas en curso con paso de la secuencia, última novedad y próximo paso. Filtros: Todas / Vencidas / Por vencer / En pausa.
- **Secuencia**: los 5 pasos con su plantilla y el interruptor "se envía sin pedirte aprobación".
  1. Recordatorio 3 días antes.
  2. Vence hoy.
  3. Vencida a los 3 días.
  4. Llamada tuya a los 10 días.
  5. Riesgo de cobertura, 5 días antes del fin del plazo de gracia de esa póliza.
- **Reglas**:
  - cortar la secuencia cuando el validador confirma el pago;
  - mandar solo de lunes a sábado, de 9 a 20 h;
  - en empresas, escribirle al contacto de administración;
  - avisarme cuando alguien responde.
- El cálculo de qué paso le toca a cada cuota, y si está en pausa (promesa de pago, problema detectado por el validador, sin contacto), va en `src/lib/cobranza.ts` con tests.
- Las plantillas usan variables: `{nombre}`, `{compañía}`, `{ramo}`, `{cuota}`, `{monto}`, `{vence}`, `{medios de pago}`, `{productor}`.
- Agregá un cron diario en `vercel.json`, siguiendo el patrón de `src/app/api/cron/`. Genera los borradores del día y **no envía nada** que no esté marcado como automático.

**6.3 Siniestros** (`/agentes/siniestros`):

- KPIs, pestañas Abiertos / Cerrados.
- Lista a la izquierda y detalle a la derecha (en celular, el detalle debajo), con:
  - barra de etapas;
  - recuadro "Ahora" con su tono (acción / alerta / espera / ok) y acciones;
  - borrador de la denuncia cuando corresponde;
  - documentación recibida y faltante;
  - historial.
- Las reglas de "qué falta" por tipo de siniestro (auto con tercero, hogar por agua, robo, cristales) van en `src/lib/siniestros.ts`.
- Alertas:
  - plazo de denuncia de 3 días desde el hecho;
  - más de 14 días sin novedades de la compañía → proponer reclamo.
- "Cargar siniestro" abre un formulario manual.

**6.4 Conciliador** (`/agentes/conciliador`):

- Selector de período.
- KPIs: te corresponde, liquidado, depositado, para reclamar.
- Tabla por compañía con esperado / liquidado / depositado / diferencia / estado, y fila de totales.
- Detalle de la compañía elegida, con lo que encontró el agente y el email de reclamo listo para enviar.
- Cálculo, en `src/lib/conciliacion.ts` con tests:
  - comisión esperada = cuotas cobradas en el período × porcentaje acordado (`acuerdos_comision`);
  - diferencias por póliza: falta en la liquidación, porcentaje distinto, liquidación no recibida;
  - **retenciones** (IIBB, Ganancias) explican la diferencia entre liquidado y depositado. No son un error.
- "Subir liquidación" acepta un CSV con el mismo asistente de mapeo de la fase 4. "Exportar para el contador" baja un CSV.

**6.5 Cotización** (`/agentes/cotizacion`):

- Checklist de configuración inicial.
- Pestañas Solicitudes / Bitácora / Desempeño.
- KPIs, donde "requieren tu atención" filtra al hacer clic.
- Filtros en forma de píldora: búsqueda, estado, ramo, origen.
- Tabla de solicitudes con los estados del diseño: Requiere tu atención / Esperando compañías / Comparativa lista / Enviada al cliente / Ganada / Perdida.
- Cada solicitud se vincula con un asegurado de la cartera o con un lead. Desde la ficha del lead y desde una oportunidad de la cartera hay un botón "Pedir cotización" que crea la solicitud.

### Fase 7: Captación de clientes

- Mové "Leads del día" y "Mis sectores" a la sección nueva, con el layout nuevo, según `Main.dc.html`, `Lead.dc.html` y `Sectores.dc.html`.
- La lógica de captura existente no cambia.
- Agregá el vínculo con la cartera: si un lead tiene el mismo CUIT que un asegurado, mostrar "Ya es cliente" con enlace a su ficha.

### Fase 8: Verificación final

1. Ampliá `e2e/flujos.mjs` con estos flujos:
   - login → asegurados → filtrar → abrir panel → abrir ficha;
   - importar un CSV de ejemplo (dejalo en `e2e/fixtures/`) con una fila con error → combinar → ver los asegurados nuevos;
   - validador: confirmar un pago → la cuota aparece en Pagados y desaparece de Cobranza;
   - cobranza: aprobar un mensaje;
   - siniestros: aprobar la denuncia;
   - conciliador: enviar un reclamo;
   - configuración: conectar WhatsApp simulado;
   - todo de nuevo a 390px de ancho, verificando que no haya scroll horizontal.
2. `npm run lint`, `npm test`, `npm run build` y `npm run test:e2e` contra una base local con el seed.
3. Compará cada pantalla con su diseño (captura con Playwright) y corregí las diferencias de estructura o de textos.
4. Actualizá el `README.md`: qué hace cada sección, cómo importar la cartera y qué conexiones son simuladas todavía.

## 5. Entrega

- Un commit por fase, con mensaje descriptivo en español.
- Al final, push de la rama `cartera-agentes` y un **pull request contra `main`** que incluya:
  - resumen por fase;
  - capturas de las pantallas principales;
  - lista de lo que quedó simulado;
  - cualquier decisión en la que te hayas apartado de este plan.
- **No mergees a `main`.** Vercel va a crear un deploy de preview del PR. Ojo: los deploys de preview no corren migraciones (ver `scripts/preparar-db.ts`), así que la preview va a fallar contra la base de producción. Explicá en el PR cómo probarlo: una base de preview aparte con su propia `DATABASE_URL` en el entorno Preview de Vercel, o probarlo en local.
- Si en algún momento una decisión no tiene vuelta atrás (borrar datos, cambiar la contraseña, tocar variables de entorno de producción), frená y preguntá.
