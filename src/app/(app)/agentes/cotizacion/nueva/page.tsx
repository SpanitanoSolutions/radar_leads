import Link from "next/link";
import { obtenerAseguradorasCotizacion, obtenerOpcionesSolicitud, obtenerPaquetesCotizacion } from "@/lib/datos-agentes";
import { ramosConPaquete } from "@/lib/cotizacion/configuracion";
import FormularioNuevaSolicitud from "./FormularioNuevaSolicitud";
import "../../agentes.css";

export const instant = false;

export default async function NuevaSolicitudCotizacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [opciones, aseguradoras, paquetes, sp] = await Promise.all([
    obtenerOpcionesSolicitud(),
    obtenerAseguradorasCotizacion(),
    obtenerPaquetesCotizacion(),
    searchParams,
  ]);
  const aviso = typeof sp.aviso === "string" ? sp.aviso : "";
  const conPaquete = ramosConPaquete(paquetes);

  return (
    <div className="cotizacion-nueva-pagina">
      <Link href="/agentes/cotizacion" className="cotizacion-volver">
        <span aria-hidden="true">←</span> Volver a Cotización
      </Link>
      <header className="cotizacion-nueva-cabecera">
        <div className="cotizacion-nueva-icono" aria-hidden="true">＋</div>
        <div>
          <p className="cotizacion-ceja">AGENTE DE COTIZACIÓN</p>
          <h1>Nueva solicitud</h1>
          <p>Completá los datos del riesgo y elegí las aseguradoras que querés consultar.</p>
        </div>
      </header>
      <FormularioNuevaSolicitud
        asegurados={opciones.asegurados}
        leads={opciones.leads}
        aseguradoras={aseguradoras.filter((aseguradora) => aseguradora.activa).map(({ id, nombre, ramos }) => ({ id, nombre, ramos, ramosConPaquete: conPaquete.get(id) ?? [] }))}
        aviso={aviso}
      />
    </div>
  );
}
