// La referencia de la API de Cobranza (/agentes/cobranza/api). Cada endpoint
// documentado tiene su route.ts (lo verifica api-docs.test.ts).

export type Endpoint = {
  id: string;
  seccion: "configuracion" | "corridas" | "casos" | "universo" | "entrantes";
  metodo: "GET" | "POST" | "PUT";
  ruta: string;
  titulo: string;
  descripcion: string;
  parametros?: [nombre: string, tipo: string, descripcion: string][];
  cuerpo?: Record<string, unknown>;
  respuesta: unknown;
};

export const BASE_API = "/api/v1/agentes/cobranza";

const casoEjemplo = {
  id: 128,
  estado: "sin_respuesta",
  estadoTexto: "Sin contacto",
  motivo: null,
  asegurado: { id: 77, nombre: "Correa, Valentina", tipo: "persona", documento: "28455120" },
  contacto: { telefono: "223 512-0087", email: "vcorrea@ejemplo.com.ar" },
  compania: "Rivadavia",
  ramo: "Hogar",
  poliza: "RIV-HO-8187265",
  recibo: "8187265006",
  cuota: { numero: 6, de: 12 },
  moneda: "ARS",
  monto: 22459.97,
  vencimiento: "2026-10-20",
  diasParaVencer: -11,
  tramo: { id: "vencido_reciente", nombre: "Vencido entre 1 y 14 días" },
  intentos: 3,
  ultimoContacto: "2026-10-28T13:05:00.000Z",
  puedeContactarHoy: true,
  motivoNoContactar: null,
  canalesDisponibles: ["whatsapp", "email"],
};

export const ENDPOINTS: Endpoint[] = [
  {
    id: "configuracion-leer",
    seccion: "configuracion",
    metodo: "GET",
    ruta: "/configuracion",
    titulo: "Leer la configuración",
    descripcion: "La configuración del agente con los valores por defecto aplicados. `guardada` es false si todavía no se guardó nunca.",
    respuesta: { configuracion: { modoPrueba: true, maxIntentos: 5, horaEjecucion: "10:00", "…": "…" }, guardada: true },
  },
  {
    id: "configuracion-cambiar",
    seccion: "configuracion",
    metodo: "PUT",
    ruta: "/configuracion",
    titulo: "Cambiar la configuración",
    descripcion: "Cambios parciales: los objetos se combinan y las listas se reemplazan enteras. Se valida la configuración completa; si algo no cierra, responde 400 y no guarda nada.",
    cuerpo: { maxIntentos: 4, prueba: { email: "yo@miagencia.com.ar" } },
    respuesta: { configuracion: { maxIntentos: 4, "…": "…" } },
  },
  {
    id: "corridas-crear",
    seccion: "corridas",
    metodo: "POST",
    ruta: "/corridas",
    titulo: "Disparar una corrida",
    descripcion: "Arranca una corrida en segundo plano y responde 202 con su id. `modoPrueba: true` la fuerza en modo prueba; si no, manda la configuración. `limite` acota los recibos a contactar. 409 si ya hay una en curso; 403 si el agente está desactivado y la corrida sería real.",
    cuerpo: { modoPrueba: true, limite: 10 },
    respuesta: { id: 42, estado: "en_curso" },
  },
  {
    id: "corridas-listar",
    seccion: "corridas",
    metodo: "GET",
    ruta: "/corridas",
    titulo: "Listar corridas",
    descripcion: "Las últimas 100 corridas, la más nueva primero.",
    respuesta: { datos: [{ id: 42, origen: "api", estado: "ok", modoPrueba: true, procesados: 3, contactados: 3, errores: 0, resumen: "Procesó 3 recibos, contactó 3 (modo prueba)." }] },
  },
  {
    id: "corridas-leer",
    seccion: "corridas",
    metodo: "GET",
    ruta: "/corridas/:id",
    titulo: "Detalle de una corrida",
    descripcion: "La corrida (estado, números, por qué no le escribió a los demás) y lo que hizo, caso por caso.",
    respuesta: { corrida: { id: 42, estado: "ok", detalle: { omitidos: { temprano: 59, espera: 16 } } }, eventos: [{ casoId: 128, tipo: "whatsapp_enviado", resumen: "Cuarto intento. Póliza vencida hace 11 días, $ 22.459,97." }] },
  },
  {
    id: "casos-listar",
    seccion: "casos",
    metodo: "GET",
    ruta: "/casos",
    titulo: "Listar casos",
    descripcion: "Los casos como en el tablero. Antes de responder, se ponen al día con la cartera.",
    parametros: [
      ["pestana", "activos | sin_datos | excluidos", "Por defecto, activos (en gestión y pagados del mes)."],
      ["estado", "texto", "pendiente, sin_respuesta, respondio, promesa, informo_pago, escalado, rechazado, pagado, excluido o sin_datos."],
      ["compania", "texto", "Nombre de la aseguradora, tal como figura."],
      ["q", "texto", "Busca en el asegurado, la póliza y el recibo."],
      ["pagina, porPagina", "enteros", "Paginación (ver arriba)."],
    ],
    respuesta: { datos: [casoEjemplo], pagina: 1, porPagina: 50, total: 72 },
  },
  {
    id: "casos-leer",
    seccion: "casos",
    metodo: "GET",
    ruta: "/casos/:id",
    titulo: "Detalle de un caso",
    descripcion: "El caso y su actividad: cada intento, respuesta, promesa, escalado y error, lo más nuevo primero.",
    respuesta: { caso: casoEjemplo, actividad: [{ tipo: "whatsapp_enviado", canal: "whatsapp", resumen: "Cuarto intento…", esPrueba: false, creadoEl: "2026-10-28T13:05:00.000Z" }] },
  },
  {
    id: "casos-pagado",
    seccion: "casos",
    metodo: "POST",
    ruta: "/casos/:id/pagado",
    titulo: "Marcar como pagado",
    descripcion: "Marca pagadas las cuotas del cobro y cierra el caso. 409 si ya estaba pagado.",
    respuesta: { id: 128, estado: "pagado" },
  },
  {
    id: "casos-reactivar",
    seccion: "casos",
    metodo: "POST",
    ruta: "/casos/:id/reactivar",
    titulo: "Reactivar",
    descripcion: "Vuelve a la gestión un caso escalado, rechazado, excluido o en espera, desde el primer intento. 409 si el asegurado pidió la baja.",
    respuesta: { id: 128, estado: "pendiente" },
  },
  {
    id: "universo",
    seccion: "universo",
    metodo: "GET",
    ruta: "/universo",
    titulo: "Universo de recibos",
    descripcion: "Todo lo que evalúa el agente, excluidos y sin datos incluidos, con si hoy le escribiría (`puedeContactarHoy`) y por qué no (`motivoNoContactar`).",
    parametros: [["pagina, porPagina", "enteros", "Paginación."]],
    respuesta: { datos: [casoEjemplo], pagina: 1, porPagina: 50, total: 113 },
  },
  {
    id: "entrantes-whatsapp",
    seccion: "entrantes",
    metodo: "POST",
    ruta: "/entrantes/whatsapp",
    titulo: "WhatsApp entrante",
    descripcion: "Un mensaje del asegurado. Se lo reconoce por el número; en modo prueba, también por el WhatsApp de prueba. El agente registra la respuesta (promesa, ya pagó, consulta, rechazo o baja) y contesta si hace falta. 404 si no corresponde a un recibo abierto.",
    cuerpo: { de: "+54 9 223 512-0087", texto: "Hola, el viernes lo pago." },
    respuesta: { estado: "procesado", casoIds: [128], conIa: true, resumen: "El agente leyó la respuesta y la registró." },
  },
  {
    id: "entrantes-email",
    seccion: "entrantes",
    metodo: "POST",
    ruta: "/entrantes/email",
    titulo: "Correo entrante",
    descripcion: "Igual que WhatsApp, por correo. Si el asunto trae la referencia `C-<id>`, va directo a ese caso.",
    cuerpo: { de: "administracion@empresa.com.ar", asunto: "Re: Tu seguro · Ref. C-128", texto: "Ya lo transferimos ayer." },
    respuesta: { estado: "procesado", casoIds: [128], conIa: true, resumen: "El agente leyó la respuesta y la registró." },
  },
];

export const SECCIONES_API = [
  { id: "primeros-pasos", texto: "Primeros pasos" },
  { id: "autenticacion", texto: "Autenticación" },
  { id: "errores", texto: "Errores" },
  { id: "paginacion", texto: "Paginación" },
  { id: "actividad", texto: "Actividad" },
  { id: "configuracion", texto: "Configuración" },
  { id: "corridas", texto: "Corridas" },
  { id: "casos", texto: "Casos" },
  { id: "universo", texto: "Universo" },
  { id: "entrantes", texto: "Entrantes" },
  { id: "esquemas", texto: "Esquemas" },
] as const;

/** Ejemplo cURL de un endpoint. */
export function ejemploCurl(e: Endpoint, base: string): string {
  const ruta = `${base}${BASE_API}${e.ruta.replace(":id", "128")}`;
  const lineas = [`curl ${e.metodo === "GET" ? "" : `-X ${e.metodo} `}"${ruta}" \\`, `  -H "Authorization: Bearer $UNIQO_API_KEY"`];
  if (e.cuerpo) {
    lineas[lineas.length - 1] += " \\";
    lineas.push(`  -H "Content-Type: application/json" \\`, `  -d '${JSON.stringify(e.cuerpo)}'`);
  }
  return lineas.join("\n");
}

/** Ejemplo en JavaScript (fetch). */
export function ejemploJs(e: Endpoint, base: string): string {
  const ruta = `${base}${BASE_API}${e.ruta.replace(":id", "128")}`;
  const opciones = [
    ...(e.metodo !== "GET" ? [`  method: "${e.metodo}",`] : []),
    `  headers: { Authorization: \`Bearer \${process.env.UNIQO_API_KEY}\`${e.cuerpo ? ', "Content-Type": "application/json"' : ""} },`,
    ...(e.cuerpo ? [`  body: JSON.stringify(${JSON.stringify(e.cuerpo)}),`] : []),
  ];
  return [`const respuesta = await fetch("${ruta}", {`, ...opciones, "});", "const datos = await respuesta.json();"].join("\n");
}
