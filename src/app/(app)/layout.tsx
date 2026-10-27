import { Marco } from "@/components/Marco";
import { requerirSesion } from "@/lib/auth";
import { obtenerMarco } from "@/lib/datos";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requerirSesion();
  const { cuenta, contadores } = await obtenerMarco();
  return (
    <Marco cuenta={cuenta} contadores={contadores}>
      {children}
    </Marco>
  );
}
