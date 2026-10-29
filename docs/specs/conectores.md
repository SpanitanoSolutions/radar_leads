---
tipo: spec
proyecto: UNIQO (antes Radar Leads)
estado: borrador
creada: 2026-10-29
---
# Conectores de compañías — spec común

> Fuente única para la conexión de UNIQO con las compañías de seguros. La usan [[Radar Leads/Specs/Agente de cotización v2]], [[Radar Leads/Specs/Agente de siniestros v2]] y [[Radar Leads/Specs/Agente validador de pagos v2]]. El agente que se programe primero crea esta capa y los demás la reutilizan.

## Principio
En producción, **las compañías van a estar conectadas** y los agentes van a acceder a ellas para hacer su trabajo: cotizar, validar pagos y gestionar siniestros. Hoy los conectores son **simulados**, pero todo se construye como va a funcionar en producción. Conectar una compañía real tiene que ser **agregar una implementación**, sin tocar los agentes.

## Interfaz (`src/lib/conectores/`)
```ts
interface ConectorCompania {
  compania: string
  tipo: 'api' | 'portal' | 'archivo'
  capacidades: Capacidad[]
  probarConexion(cred): Promise<ResultadoPrueba>
  // Cotización
  cotizar?(solicitud, coberturas): Promise<RespuestaCotizacion>
  consultarCotizacion?(numero): Promise<RespuestaCotizacion>
  obtenerCoberturas?(ramo): Promise<Cobertura[]>
  // Validador de pagos
  obtenerEstadoCobranza?(desde, hasta): Promise<PagoNormalizado[]>
  obtenerCuotas?(poliza): Promise<CuotaNormalizada[]>
  obtenerCancelaciones?(desde, hasta): Promise<Cancelacion[]>
  // Siniestros
  verificarPoliza?(numero, fecha): Promise<EstadoPoliza>
  obtenerRequisitos?(ramo, tipoSiniestro): Promise<Requisito[]>
  denunciarSiniestro?(denuncia): Promise<{ numeroSiniestro }>
  subirDocumentos?(numeroSiniestro, docs): Promise<ResultadoSubida>
  consultarSiniestro?(numeroSiniestro): Promise<EstadoSiniestro>
  descargarDocumentos?(numeroSiniestro): Promise<Documento[]>
}
```
Los nombres y las firmas pueden ajustarse a las convenciones del repo; lo importante es que **un agente nunca sabe si el dato vino de una API, de un portal o de un archivo**.

## Tipos de conector
- **`api`:** servicio web de la compañía. Es el más confiable y barato.
- **`portal`:** un agente con IA (Sonnet 5.5 con herramientas de navegador) entra al portal del productor con su credencial y hace la tarea. Es el más caro y frágil: tiene límites de tiempo y de pasos, deja registro completo y se detiene si algo no coincide.
- **`archivo`:** importación de listados o documentos (Excel, CSV o PDF), con parser conocido o extracción con IA.
- **Prioridad automática:** `api` → `portal` → `archivo` o canal manual (correo o presentación manual). Si uno falla, se pasa al siguiente y queda registrado.

## Rol de la IA
- **Mapear** los datos de UNIQO a lo que pide cada compañía (campos, códigos, catálogos). Haiku 5.5 propone el mapeo, se valida con zod y se guarda en `conector_mapeos` (compañía × ramo × operación, con versión) para no repetir llamadas.
- **Normalizar** lo que devuelve cada compañía al esquema común de UNIQO.
- **Interpretar novedades y excepciones** (pagos que no coinciden, requerimientos del liquidador, rechazos) y proponer acciones.
- **Navegar portales** cuando no hay API.
- Todo pasa por `src/lib/ia/`, con registro en `ia_uso` y cuota por organización.

## Permisos: qué puede hacer un agente solo
| Tipo de acción | Ejemplos | Regla |
|---|---|---|
| Leer | estado de cobranza, verificar póliza, consultar siniestro o cotización, requisitos, coberturas, descargar documentos | Automático |
| Cotizar | pedir una cotización por API o portal | Autorizado al aprobar la solicitud (o con "Cotizar automáticamente") |
| Enviar o presentar | correo a compañía, denuncia de siniestro, subir documentos | Aprobación explícita, caso por caso, con vista previa |
| Comprometer | emitir póliza, aceptar liquidación, dar conformidad, desistir, firmar, anular | **Nunca** el agente. No existe en la interfaz |

La regla se aplica en el código del conector (lista de capacidades permitidas por tipo de acción), no solo en la UI.

## Datos compartidos
- `credenciales_portal`: compañía, etiqueta, usuario, secreto cifrado (AES-GCM con una clave de entorno), estado, último uso y `org_id` / `producer_id`. Nunca en logs.
- `conector_mapeos`: mapeos aprendidos y confirmados.
- `conector_salud`: último éxito, último error, credencial vencida, portal cambiado y latencia.
- `conector_llamadas`: auditoría de cada llamada (agente, operación, canal, duración, resultado y costo de IA). Sin datos personales en texto libre.

## Pantalla común: Configuración → Conexiones
Por compañía: tipo de conexión, credenciales, capacidades disponibles, orden de canales, "Probar conexión" y salud. Es la misma pantalla para los tres agentes; cada agente muestra solo lo suyo.

## Simulación (ya, para todos los agentes)
Dos conectores falsos con datos realistas y todas las capacidades:
- `SimuladaApi`: responde al instante o en 2 pasos asincrónicos.
- `SimuladaPortal`: responde con demora, a veces pide un dato extra y a veces falla.

Sirven para el seed, los tests y el E2E de cada agente, incluido el paso al canal siguiente cuando uno falla.

## Fuera de alcance (por ahora)
Implementaciones reales por compañía. Cada una será un proyecto chico: conseguir el acceso (API o credencial de portal), implementar el conector, probarlo con el set de prueba y activarlo para las organizaciones que lo usen.
