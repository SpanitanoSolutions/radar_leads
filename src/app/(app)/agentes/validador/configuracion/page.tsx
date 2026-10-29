import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { ALCANCE_CARTERA, configValidador } from "@/agentes/validador/cartera";
import { ultimaCorridaCron } from "@/agentes/validador/corrida";
import { iaDisponible, OPERACIONES_IA } from "@/agentes/validador/ia";
import { canalesConectados } from "@/agentes/validador/notificaciones";
import { listarCredenciales } from "@/lib/conectores/credenciales";
import { registroConectores } from "@/lib/conectores/registro";
import { agenteConfigurado } from "@/lib/datos-agentes";
import {
  obtenerFilasGracia,
  obtenerNombresCompanias,
  obtenerPlantillasListado,
  obtenerSaludConectores,
  obtenerUltimasCorridas,
} from "@/lib/datos-validador";
import { COMPANIAS, companiaCanonica } from "@/lib/importacion";
import { RAMOS_CARTERA } from "@/lib/ramos";
import { grillaDeGracia, TODOS_LOS_RAMOS } from "@/lib/validador/gracia";
import { leerNotificaciones } from "@/lib/validador/notificaciones";
import { PASADAS_CRON_UTC, proximaPasada } from "@/lib/validador/programacion";
import { PestanaCredenciales, PestanaGeneral, PestanaNotificaciones, PestanaProgramacion, type CompaniaCredenciales, type InfoEtapa } from "./Secciones";
import "../../agentes.css";
import "../validador.css";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

const PESTANAS = [
  { id: "credenciales", texto: "Credenciales" },
  { id: "general", texto: "General" },
  { id: "programacion", texto: "Programación" },
  { id: "notificaciones", texto: "Notificaciones" },
] as const;
type Pestana = (typeof PESTANAS)[number]["id"];

const unico = (valor: string | string[] | undefined) => (typeof valor === "string" ? valor : "");

export default async function ConfiguracionValidador({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pestana: Pestana = PESTANAS.find((p) => p.id === sp.tab)?.id ?? "credenciales";
  const alcance = ALCANCE_CARTERA;

  async function contenido() {
    if (pestana === "credenciales") {
      const [nombres, todas, plantillas, salud] = await Promise.all([
        obtenerNombresCompanias(),
        listarCredenciales(alcance),
        obtenerPlantillasListado(),
        obtenerSaludConectores(),
      ]);
      const lista = [...new Set([...COMPANIAS, ...nombres, ...todas.map((c) => companiaCanonica(c.compania))])].sort((a, b) => a.localeCompare(b, "es"));
      const companias: CompaniaCredenciales[] = lista.map((nombre) => {
        const suyas = todas.filter((c) => companiaCanonica(c.compania) === nombre);
        return { nombre, total: suyas.length, activas: suyas.filter((c) => c.estado === "activa").length };
      });
      const pedida = companiaCanonica(unico(sp.cia));
      const seleccionada = lista.includes(pedida) ? pedida : (companias.find((c) => c.total)?.nombre ?? lista[0]);
      return (
        <PestanaCredenciales
          companias={companias}
          seleccionada={seleccionada}
          credenciales={todas.filter((c) => companiaCanonica(c.compania) === seleccionada)}
          plantillas={plantillas.filter((p) => companiaCanonica(p.compania) === seleccionada && p.orgId === alcance.orgId && p.producerId === alcance.producerId)}
          salud={salud.filter((s) => companiaCanonica(s.compania) === seleccionada)}
          conectores={registroConectores.conectoresPara(seleccionada).length}
          editando={Number(unico(sp.editar)) || null}
        />
      );
    }
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
          <p className="subtitulo descripcion-agente">Credenciales de los portales, períodos de gracia, cuándo corre la validación automática y a quién avisarle.</p>
        </div>
      </header>

      <Aviso codigo={sp.aviso} />

      <nav aria-label="Configuración" className="pestanas">
        {PESTANAS.map((p) => (
          <Link key={p.id} href={`/agentes/validador/configuracion?tab=${p.id}`} scroll={false} aria-current={p.id === pestana ? "page" : undefined} className="pestana">
            {p.texto}
          </Link>
        ))}
      </nav>

      {await contenido()}
    </>
  );
}
