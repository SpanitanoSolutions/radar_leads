import { textoAviso } from "@/lib/avisos";

/** Confirmación o error de la última acción (viene en ?aviso=). */
export function Aviso({ codigo }: { codigo?: string | string[] }) {
  const aviso = textoAviso(Array.isArray(codigo) ? codigo[0] : codigo);
  if (!aviso) return null;
  return (
    <p className={`aviso aviso-${aviso.tono}`} role={aviso.tono === "error" ? "alert" : "status"}>
      {aviso.texto}
    </p>
  );
}
