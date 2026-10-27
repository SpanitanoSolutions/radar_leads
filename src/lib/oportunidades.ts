import { normalizar } from "@/fuentes/clasificacion";
import { ramoCanonico } from "./ramos";

// Oportunidades de mejorar la cobertura de un asegurado: coberturas cortas,
// sumas sin actualizar, ramos que le faltan y datos de contacto incompletos.
// Cada una tiene una clave estable para poder agregarla a seguimiento.

export type TipoOportunidad = "Mejora de cobertura" | "Venta cruzada" | "Dato faltante";

export type Oportunidad = {
  /** Regla y póliza ("rc:12") o solo la regla ("hogar"). */
  clave: string;
  tipo: TipoOportunidad;
  titulo: string;
  detalle: string;
  /** Ramo a cotizar si se pide cotización desde la oportunidad. */
  ramo?: string;
  polizaId?: number;
};

export type PolizaParaReglas = {
  id: number;
  ramo: string;
  cobertura: string | null;
  bien: string | null;
  sumaActualizadaAnio: number | null;
};

export type AseguradoParaReglas = {
  tipo: "persona" | "empresa";
  telefono: string | null;
  email: string | null;
  /** Solo las pólizas vigentes. */
  polizas: PolizaParaReglas[];
};

/** Cobertura de responsabilidad civil sola (la "A" de las compañías). */
export function esSoloRC(cobertura: string | null): boolean {
  const c = normalizar(cobertura ?? "");
  return /^(a|rc|solo rc|responsabilidad civil( sola| solamente)?)$/.test(c) || (c.includes("responsabilidad civil") && !c.includes("terceros"));
}

export function esTercerosCompleto(cobertura: string | null): boolean {
  return /terceros completo|^c$/.test(normalizar(cobertura ?? ""));
}

export function oportunidadesDe(a: AseguradoParaReglas, anioActual: number): Oportunidad[] {
  const ramos = new Set(a.polizas.map((p) => ramoCanonico(p.ramo)));
  const tiene = (...rs: string[]) => rs.some((r) => ramos.has(r));
  const lista: Oportunidad[] = [];

  for (const p of a.polizas) {
    const ramo = ramoCanonico(p.ramo);
    const bien = p.bien ?? ramo;
    if ((ramo === "Auto" || ramo === "Moto") && esSoloRC(p.cobertura)) {
      lista.push({
        clave: `rc:${p.id}`,
        tipo: "Mejora de cobertura",
        titulo: "Subir a terceros completo",
        detalle: `${bien}: hoy solo tiene responsabilidad civil. Ante robo, incendio o destrucción total no cobra nada.`,
        ramo,
        polizaId: p.id,
      });
    } else if (ramo === "Auto" && esTercerosCompleto(p.cobertura)) {
      lista.push({
        clave: `todoriesgo:${p.id}`,
        tipo: "Mejora de cobertura",
        titulo: "Evaluar todo riesgo con franquicia",
        detalle: `${bien}: con terceros completo los daños parciales los paga el cliente. Cotizá todo riesgo y compará.`,
        ramo,
        polizaId: p.id,
      });
    }
    if (p.sumaActualizadaAnio !== null && p.sumaActualizadaAnio < anioActual) {
      lista.push({
        clave: `suma:${p.id}`,
        tipo: "Mejora de cobertura",
        titulo: "Actualizar la suma asegurada",
        detalle: `${p.ramo} · ${bien}: la suma no se actualiza desde ${p.sumaActualizadaAnio}. Con la inflación probablemente quedó corta y cobraría menos en un siniestro.`,
        ramo,
        polizaId: p.id,
      });
    }
  }

  if (a.tipo === "persona") {
    if (tiene("Auto", "Moto") && !tiene("Hogar")) {
      lista.push({
        clave: "hogar",
        tipo: "Venta cruzada",
        titulo: "Hogar o combinado familiar",
        detalle: "Ya le asegurás el vehículo. Sumar la vivienda en la misma compañía suele mejorar el precio de las dos.",
        ramo: "Hogar",
      });
    }
    if (!tiene("Vida", "AP")) {
      lista.push({
        clave: "vida",
        tipo: "Venta cruzada",
        titulo: "Vida o accidentes personales",
        detalle: "No tiene ninguna cobertura de personas. Es una conversación natural en la renovación.",
        ramo: "Vida",
      });
    }
  } else {
    if (tiene("Flota", "Carga") && !tiene("Integral", "Integral de comercio")) {
      lista.push({
        clave: "integral",
        tipo: "Venta cruzada",
        titulo: "Integral para la base operativa",
        detalle: "Asegura vehículos pero no el depósito ni las oficinas.",
        ramo: "Integral de comercio",
      });
    }
    if (tiene("Flota") && !tiene("RC")) {
      lista.push({
        clave: "rcflota",
        tipo: "Venta cruzada",
        titulo: "Responsabilidad civil general",
        detalle: "La póliza de flota no cubre daños fuera del uso de los vehículos, como en carga y descarga.",
        ramo: "RC",
      });
    }
    if (!tiene("ART")) {
      lista.push({
        clave: "art",
        tipo: "Venta cruzada",
        titulo: "ART",
        detalle: "Obligatoria si tiene personal en relación de dependencia. Confirmá cuántos empleados tiene.",
        ramo: "ART",
      });
    }
    if (tiene("RC profesional") && !tiene("Integral", "Integral de comercio")) {
      lista.push({
        clave: "consultorio",
        tipo: "Venta cruzada",
        titulo: "Integral del consultorio",
        detalle: "Cubre el equipamiento y el local, que la RC profesional no incluye.",
        ramo: "Integral",
      });
    }
  }
  if (tiene("Integral de comercio") && !tiene("RC")) {
    lista.push({
      clave: "rclocal",
      tipo: "Venta cruzada",
      titulo: "RC del local",
      detalle: "Cubre daños a clientes o terceros dentro del local.",
      ramo: "RC",
    });
  }

  const faltan = [!a.telefono && "teléfono", !a.email && "email"].filter(Boolean);
  if (faltan.length) {
    lista.push({
      clave: "contacto",
      tipo: "Dato faltante",
      titulo: `Completar ${faltan.join(" y ")}`,
      detalle: "Sin estos datos no podés avisarle de los vencimientos ni enviarle la póliza.",
    });
  }
  return lista;
}
