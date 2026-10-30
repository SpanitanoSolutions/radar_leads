import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { ALCANCE_CARTERA, configValidador } from "@/agentes/validador/cartera";
import { ultimaCorridaCron } from "@/agentes/validador/corrida";
import { iaDisponible, OPERACIONES_IA } from "@/agentes/validador/ia";
import { canalesConectados } from "@/agentes/validador/notificaciones";
import { agenteConfigurado } from "@/lib/datos-agentes";
import { obtenerFilasGracia, obtenerNombresCompanias, obtenerUltimasCorridas } from "@/lib/datos-validador";
import { COMPANIAS } from "@/lib/importacion";
import { RAMOS_CARTERA } from "@/lib/ramos";
import { grillaDeGracia, TODOS_LOS_RAMOS } from "@/lib/validador/gracia";
import { leerNotificaciones } from "@/lib/validador/notificaciones";
import { PASADAS_CRON_UTC, proximaPasada } from "@/lib/validador/programacion";
import { PestanaGeneral, PestanaNotificaciones, PestanaProgramacion, type InfoEtapa } from "./Secciones";
import "../../agentes.css";
import "../validador.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const PESTANAS = [
  { id: "general", texto: "General" },
  { id: "programacion", texto: "Programación" },
  { id: "notificaciones", texto: "Notificaciones" },
] as const;
type Pestana = (typeof PESTANAS)[number]["id"];

const unico = (valor: string | string[] | undefined) => (typeof valor === "string" ? valor : "");

export default async function ConfiguracionValidador({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  // Las credenciales y la plantilla de los listados se mudaron a la pantalla común.
  if (sp.tab === "credenciales") redirect(`/configuracion/companias?${new URLSearchParams({ agente: "validador", ...(unico(sp.cia) ? { cia: unico(sp.cia) } : {}) })}`);
  const pestana: Pestana = PESTANAS.find((p) => p.id === sp.tab)?.id ?? "general";
  const alcance = ALCANCE_CARTERA;

  async function contenido() {
    if (pestana === "general") {
      const ramo = RAMOS_CARTERA.find((r) => r.id === sp.ramo)?.id ?? TODOS_LOS_RAMOS;
      const [filas, nombres, config] = await Promise.all([obtenerFilasGracia(), obtenerNombresCompanias(), configValidador(alcance)]);
      const grilla = grillaDeGracia(filas, nombres, ramo, alcance);
      return (
        <PestanaGeneral
          ramo={ramo}
          grilla={grilla}
          graciaHabilitada={config.graciaHabilitada}
          otras={COMPANIAS.filter((c) => !grilla.some((g) => g.compania === c))}
          tolerancia={config.toleranciaMonto}
        />
      );
    }
    if (pestana === "programacion") {
      const ahora = new Date();
      const [config, ultimas, activo, conIA, cronValidacion, cronEnriquecimiento] = await Promise.all([
        configValidador(alcance),
        obtenerUltimasCorridas(),
        agenteConfigurado("validador"),
        iaDisponible(OPERACIONES_IA.resumir, alcance),
        ultimaCorridaCron("validacion"),
        ultimaCorridaCron("enriquecimiento"),
      ]);
      const info: Record<"validacion" | "enriquecimiento", InfoEtapa> = {
        validacion: { ultima: ultimas.validacion, proxima: proximaPasada(config, "validacion", cronValidacion, ahora) },
        enriquecimiento: { ultima: ultimas.enriquecimiento, proxima: proximaPasada(config, "enriquecimiento", cronEnriquecimiento, ahora) },
      };
      return <PestanaProgramacion config={config} info={info} agenteActivo={activo} conIA={conIA} pasadas={PASADAS_CRON_UTC} />;
    }
    const [config, conectados, conIA] = await Promise.all([configValidador(alcance), canalesConectados(), iaDisponible(OPERACIONES_IA.resumir, alcance)]);
    return <PestanaNotificaciones config={leerNotificaciones(config.notificaciones)} conectados={conectados} conIA={conIA} />;
  }

  return (
    <>
      <header className="encabezado encabezado-arriba">
        <div className="encabezado-texto">
          <Link href="/agentes/validador" className="volver">
            ← Volver al Validador
          </Link>
          <h1 className="titulo">Configuración del Validador</h1>
          <p className="subtitulo descripcion-agente">Períodos de gracia, cuándo corre la validación automática y a quién avisarle.</p>
        </div>
      </header>

      <Aviso codigo={sp.aviso} />

      <nav aria-label="Configuración" className="pestanas">
        {PESTANAS.map((p) => (
          <Link key={p.id} href={`/agentes/validador/configuracion?tab=${p.id}`} scroll={false} aria-current={p.id === pestana ? "page" : undefined} className="pestana">
            {p.texto}
          </Link>
        ))}
        <Link href="/configuracion/companias?agente=validador" className="pestana">
          Compañías y credenciales ↗
        </Link>
      </nav>

      {await contenido()}
    </>
  );
}
