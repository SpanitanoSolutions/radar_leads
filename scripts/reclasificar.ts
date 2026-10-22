/**
 * Vuelve a clasificar los leads ya guardados con las reglas actuales (sector,
 * tipo de transporte, rubro, ramos y score base). Sin --aplicar solo muestra
 * qué cambiaría.
 *
 *   npm run db:reclasificar              # muestra los cambios
 *   npm run db:reclasificar -- --aplicar # los guarda
 */
import "dotenv/config";
import { eq, isNotNull } from "drizzle-orm";
import { db, schema } from "../src/db";
import { reclasificar } from "../src/fuentes/reclasificar";

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const leads = await db.select().from(schema.leads).where(isNotNull(schema.leads.clave));
  let cambiados = 0;
  for (const lead of leads) {
    const cambios = reclasificar(lead);
    if (!cambios) continue;
    cambiados++;
    if (cambiados <= 20) {
      const detalle = Object.entries(cambios)
        .map(([campo, valor]) => `${campo}: ${JSON.stringify(lead[campo as keyof typeof lead])} → ${JSON.stringify(valor)}`)
        .join(" | ");
      console.log(`· ${lead.empresa}: ${detalle}`);
    }
    if (aplicar) {
      await db
        .update(schema.leads)
        .set({ ...cambios, actualizadoEl: new Date() })
        .where(eq(schema.leads.id, lead.id));
    }
  }
  console.log(
    `${cambiados} de ${leads.length} leads cambian.` + (aplicar ? " Cambios guardados." : " Corré con --aplicar para guardarlos."),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
