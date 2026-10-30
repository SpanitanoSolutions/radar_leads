import type { AlcanceCredencial } from "@/lib/conectores/credenciales";

/**
 * Las claves de los portales viven en credenciales_portal (src/lib/conectores/credenciales.ts),
 * compartidas con el Validador: por ahora todo es de una sola cuenta, el mismo alcance que su cartera.
 */
export const ALCANCE_CREDENCIALES: AlcanceCredencial = { orgId: null, producerId: null };
