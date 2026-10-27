import type { NextRequest } from "next/server";
import { esVigente, filtrarAsegurados, leerFiltrosAsegurados, resumirAsegurado } from "@/lib/asegurados";
import { requerirSesion } from "@/lib/auth";
import { aCsv, fechaCsv, montoCsv, respuestaCsv } from "@/lib/csv";
import { obtenerAsegurados } from "@/lib/datos-cartera";
import { diaEnArgentina } from "@/lib/fechas";

/**
 * Baja la cartera en CSV, una fila por póliza vigente, con las mismas columnas
 * que reconoce "Importar cartera". Acepta los filtros de la lista o ?ids=1,2,3.
 */
export async function GET(request: NextRequest) {
  await requerirSesion();
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const hoy = diaEnArgentina(new Date());
  const todos = await obtenerAsegurados();
  let elegidos: Set<number>;
  if (params.ids) {
    elegidos = new Set(params.ids.split(",").map(Number).filter(Number.isInteger));
  } else {
    const filas = todos.map((a) => resumirAsegurado(a, hoy));
    elegidos = new Set(filtrarAsegurados(filas, leerFiltrosAsegurados(params)).map((f) => f.id));
  }

  const filas: (string | number | null)[][] = [
    [
      "Tipo",
      "Asegurado",
      "DNI/CUIT",
      "Localidad",
      "Teléfono",
      "Email",
      "Domicilio",
      "Contacto",
      "Ramo",
      "Compañía",
      "N° de póliza",
      "Bien asegurado",
      "Cobertura",
      "Vigencia desde",
      "Vigencia hasta",
      "Prima anual",
      "Cuotas",
      "Forma de pago",
    ],
  ];
  for (const a of todos) {
    if (!elegidos.has(a.id)) continue;
    const datos = [
      a.tipo === "empresa" ? "Empresa" : "Persona",
      a.nombre,
      a.documento,
      a.localidad,
      a.telefono ?? a.contactoTelefono,
      a.email ?? a.contactoEmail,
      a.domicilio,
      a.contactoNombre,
    ];
    const vigentes = a.polizas.filter((p) => esVigente(p, hoy));
    if (!vigentes.length) filas.push([...datos, ...Array(10).fill("")]);
    for (const p of vigentes) {
      filas.push([
        ...datos,
        p.ramo,
        p.compania,
        p.numero,
        p.bien,
        p.cobertura,
        fechaCsv(p.vigenciaDesde),
        fechaCsv(p.vigenciaHasta),
        montoCsv(p.prima),
        p.cantidadCuotas,
        p.formaPago,
      ]);
    }
  }
  return respuestaCsv(aCsv(filas), `cartera_${hoy}.csv`);
}
