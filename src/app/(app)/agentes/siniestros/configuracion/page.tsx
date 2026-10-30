import Link from "next/link";
import { obtenerConfiguracionSiniestros } from "@/lib/datos-agentes";
import { TIPOS_SINIESTRO } from "@/lib/siniestros";
import { guardarConfiguracionSiniestro } from "../actions";
import "../../agentes.css";

export const instant = false;

type Regla = Awaited<ReturnType<typeof obtenerConfiguracionSiniestros>>[number];

function FormularioRegla({ regla }: { regla?: Regla }) {
  return (
    <form action={guardarConfiguracionSiniestro} className="siniestro-form siniestro-config-form">
      <label>
        <span>Compañía</span>
        <input name="compania" defaultValue={regla?.compania ?? ""} maxLength={120} required />
      </label>
      <label>
        <span>Ramo</span>
        <input name="ramo" defaultValue={regla?.ramo ?? ""} maxLength={100} placeholder="Automotor, Hogar, Accidentes personales…" required />
      </label>
      <label>
        <span>Tipo de siniestro</span>
        <select name="tipo" defaultValue={regla?.tipo ?? "otro"}>
          {TIPOS_SINIESTRO.map((tipo) => <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>)}
        </select>
      </label>
      <label>
        <span>Días del plazo operativo desde el hecho</span>
        <input name="plazoAvisoDias" type="number" min="1" max="365" defaultValue={regla?.plazoAvisoDias ?? ""} placeholder="Usar base interna: 3" />
      </label>
      <label>
        <span>Días sin novedades para marcar seguimiento</span>
        <input name="diasSinNovedades" type="number" min="1" max="365" defaultValue={regla?.diasSinNovedades ?? ""} placeholder="Usar base interna: 14" />
      </label>
      <label>
        <span>Voz o instrucciones del agente</span>
        <input name="vozAgente" defaultValue={regla?.vozAgente ?? ""} maxLength={250} placeholder="Opcional; no selecciona un modelo de IA" />
      </label>
      <label className="siniestro-campo-ancho">
        <span>Requisitos del checklist, uno por línea</span>
        <textarea
          name="requisitos"
          defaultValue={regla?.requisitos.map((item) => `${item.bloqueante ? "" : "? "}${item.nombre}`).join("\n") ?? ""}
          rows={5}
          maxLength={4000}
          placeholder="Fotos del vehículo\nDenuncia firmada\n? Presupuesto del taller (opcional)"
        />
        <small>Anteponé “?” a un requisito opcional. Los cambios manuales en un expediente no se reemplazan al guardar esta plantilla.</small>
      </label>
      <label className="siniestro-campo-ancho">
        <span>Orden de documentos del dossier, uno por línea</span>
        <textarea name="ordenDossier" defaultValue={regla?.ordenDossier.join("\n") ?? ""} rows={3} maxLength={2500} />
      </label>
      <div className="siniestro-config-pie siniestro-campo-ancho">
        {regla && <span className="texto-suave">Actualizada el {new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(regla.actualizadoEl)}</span>}
        <button type="submit" className="boton boton-primario">{regla ? "Guardar cambios" : "Crear regla"}</button>
      </div>
    </form>
  );
}

export default async function ConfiguracionSiniestros({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [reglas, sp] = await Promise.all([obtenerConfiguracionSiniestros(), searchParams]);
  return (
    <main className="contenido-pagina siniestro-configuracion">
      <header className="siniestro-config-cabecera">
        <div>
          <Link href="/agentes/siniestros" className="siniestro-config-volver">← Volver a Siniestros</Link>
          <h1>Reglas del agente de siniestros</h1>
          <p className="texto-suave">Configurá requisitos, orden del dossier y plazos operativos por compañía, ramo y tipo.</p>
        </div>
      </header>
      {sp.aviso === "guardado" && <p role="status" className="siniestro-aviso">Guardaste la regla.</p>}
      <p className="siniestro-config-nota">
        Los valores base de 3 y 14 días son recordatorios operativos de la aplicación; no representan plazos legales. Definí valores revisados para cada compañía. Los proveedores y modelos de IA se elegirán más adelante.
      </p>
      <p className="siniestro-config-nota">
        Cómo se conecta UNIQO con cada compañía para verificar pólizas, denunciar y seguir los siniestros, y el usuario y la clave de sus portales, está en{" "}
        <Link href="/configuracion/companias?agente=siniestros">Conexiones con las compañías</Link>.
      </p>
      <section className="tarjeta siniestro-config-seccion">
        <h2>Nueva regla</h2>
        <FormularioRegla />
      </section>
      <section className="siniestro-config-reglas" aria-label="Reglas guardadas">
        <h2>Reglas guardadas <span className="contador-gris">{reglas.length}</span></h2>
        {reglas.length ? reglas.map((regla) => (
          <details key={regla.id} className="tarjeta siniestro-config-regla">
            <summary><strong>{regla.compania}</strong><span>{regla.ramo} · {TIPOS_SINIESTRO.find((tipo) => tipo.id === regla.tipo)?.nombre ?? regla.tipo}</span></summary>
            <FormularioRegla regla={regla} />
          </details>
        )) : <p className="tarjeta siniestro-vacio texto-suave">Todavía no guardaste reglas específicas. Se aplican los requisitos base del tipo.</p>}
      </section>
    </main>
  );
}
