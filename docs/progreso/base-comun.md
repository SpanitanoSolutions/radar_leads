# Progreso — Base común de agentes

Spec: [conectores.md](../specs/conectores.md) y las secciones "Reglas" y "Cómo funciona por detrás" de [validador-v2.md](../specs/validador-v2.md).
Rama: `feat/base-agentes`.

## Estado
Hecha (29/10/2026). `npm test`: 338 de 343 pasan. Los 5 que fallan (`catalogo.test.ts`, `menu.test.ts`, `siniestros.test.ts`) ya fallaban en `main` antes de esta rama. `npm run lint` sin errores y `npm run build` OK.

| Parte | Estado |
|---|---|
| 1. Capa IA (`src/lib/ia/`, con `ia_uso` y cuota) | Hecha |
| 2. Cola `ia_trabajos` | Hecha |
| 3. Conectores (`src/lib/conectores/`, `SimuladaApi` y `SimuladaPortal`) | Hecha |

## Hecho
- Specs movidas a `docs/specs/` con los nombres que usa el README.
- `zod` 4.6.7 como dependencia directa.
- **Parte 1, capa IA:**
  - `modelos.ts`: modelo, esfuerzo y tope de tokens por tarea. Haiku 5.5 para extraer, clasificar, normalizar y mapear; Sonnet 5.5 para explicar, analizar y portal. Si Haiku no valida, se reintenta una vez con Sonnet.
  - `configuracion.ts`: cascada de `ia_configuracion` plataforma → organización → productor, con comodín `*` en agente y operación. La fila más específica decide si está activa. La cuota se mide por organización (o por productor si el límite es suyo) en el mes calendario argentino.
  - `motor.ts`: núcleo puro (proveedor y registro inyectados). Valida con zod, reintenta y registra cada intento en `ia_uso`, también los bloqueados por cuota, sin prompts ni contenido.
  - `ejecutar.ts`: `ejecutarIA()` y `estadoIA()`, la puerta de los agentes. Nunca lanza por la IA: devuelve `ok: false` con el motivo.
  - `claude.ts`: `generarEstructurado()` con salidas estructuradas (`output_config.format` + `betaZodOutputFormat`), adjuntos PDF o imagen, esfuerzo y `fallbacks: "default"` solo en Sonnet 5.5. `generar()` sigue igual para Cotización.
  - `index.ts`: precios de lista actualizados. Un modelo sin precio se estima con el más caro.
  - Tests: `modelos.test.ts`, `configuracion.test.ts`, `motor.test.ts`.
- **Parte 2, cola `ia_trabajos` (sin migración):**
  - `trabajos.ts`: reglas puras. Hay 3 intentos con esperas de 1 y 5 minutos entre ellos. La espera de 30 minutos del plan se sacó porque con 3 intentos nunca se usaba. Un trabajo con más de 15 minutos en `procesando` cuenta como caído. `ErrorTrabajo` lleva el único mensaje que se guarda en `error_seguro`; cualquier otro error queda como texto genérico.
  - `cola.ts`:
    - `encolarTrabajo(datos, tx?)`.
    - `tomarTrabajos()`, atómico con `FOR UPDATE SKIP LOCKED`. Solo toma operaciones con manejador; no toca `pendiente_configuracion`.
    - `procesarTrabajos()` toma de a uno con tope de tiempo. Las escrituras verifican `intentos` para no pisar un trabajo que otro proceso volvió a tomar.
  - `manejadores.ts`: el mapa `MANEJADORES` (vacío; cada agente suma los suyos) y `despachadorTrabajos`, que procesa la cola con `after()` después de responder.
  - `/api/cron/ia-trabajos` con `CRON_SECRET`, una vez por día en `vercel.json`. Si el plan de Vercel lo permite, conviene llevarlo a cada 10 minutos.
  - Test: `trabajos.test.ts`. El SQL de la toma se revisó con `toSQL()`. No hay base local para probarlo contra Postgres.

- **Parte 3, conectores (`src/lib/conectores/`):**
  - `tipos.ts`:
    - `ConectorCompania` con las 12 capacidades de la spec y tipos normalizados (`PagoNormalizado` según la sección 6 del Validador).
    - `ErrorConector` con código: `credencial_vencida`, `portal_cambiado`, `timeout`, `no_disponible`, `requiere_dato` (con la pregunta), `no_encontrado` y `sin_permiso`.
    - Las acciones que comprometen (emitir, aceptar, firmar…) no existen en la interfaz.
  - `permisos.ts`:
    - Mapa capacidad → `leer` / `cotizar` / `enviar`.
    - `conPermisos()` aplica la regla en código. Cotizar requiere la solicitud aprobada o "Cotizar automáticamente". Cada envío necesita su aprobación, que sirve para una sola vez y se gasta solo si el envío sale bien.
    - Las capacidades que una implementación no declara no se exponen.
  - `canales.ts`:
    - Orden `api` → `portal` → `archivo` → manual. Se saltean los canales con la credencial vencida o el portal cambiado.
    - Hay un tope de tiempo por llamada y cada intento queda registrado.
    - `requiere_dato` frena y devuelve la pregunta.
    - Un **envío** que vence por tiempo queda `incierto` y no se repite por otro canal, para no duplicar una denuncia.
  - `simulacion.ts`:
    - Datos con semilla: 6 pólizas por compañía (una flota de 3 ítems con endoso y una en USD), cuotas n de N con medios de pago argentinos, una deuda y una anulación por falta de pago a los 30 días.
    - Coberturas por ramo, requisitos de `documentosPara()` y cotización con impuestos.
    - Un PDF mínimo válido para las constancias.
  - `simulada-api.ts`:
    - Cotiza al instante o en 2 pasos (`dos_pasos`).
    - El siniestro avanza: denunciado → en análisis → pide documentación → (con documentos) inspección → liquidado.
  - `simulada-portal.ts`: mismos datos con demora, fallas con semilla y el pedido del uso del vehículo al cotizar si falta. Con `forzar` se reproducen la falla o el dato extra en el E2E.
  - `registro.ts`: `RegistroConectores`, vacío por defecto. `crearRegistroSimulado()` para el seed, los tests y el E2E. `CONECTORES_SIMULADOS=1` lo prende, nunca con `VERCEL_ENV=production`.
  - `auditoria.ts` + `ejecutar.ts`: `ejecutarEnCompania()` (la puerta de los agentes) y `probarConexion()`. Cada intento se escribe en `conector_llamadas` y actualiza `conector_salud`.
  - Migración `0024_conectores.sql` (generada con drizzle-kit, solo esas dos tablas).
  - Tests: `simulacion.test.ts`, `simulada.test.ts`, `canales.test.ts` (canales, permisos y registro).

## Pendiente (fuera de esta base)
- `credenciales_portal` (AES-GCM con clave de entorno), `conector_mapeos` (mapeo con Haiku validado con zod) y la pantalla Configuración → Conexiones.
- Pasar Cotización (`src/lib/ia/cotizacion.ts`) a `ejecutarIA()` para que registre en `ia_uso`.
- Siniestros: registrar su manejador `siniestros:analizar_documento` en `MANEJADORES` y encolar en `pendiente` cuando la IA esté configurada.
- Una UI o un seed que cargue filas en `ia_configuracion`: sin filas, la IA queda apagada.
- La migración 0024 se aplica en el próximo deploy de producción (`preparar-db`). No se probó contra Postgres porque no hay base local.

## Próximo paso exacto
Hecho: el Validador v2 es el primer agente sobre la base. Plan en `docs/PLAN-validador-v2.md` y progreso en [validador-v2.md](validador-v2.md).
