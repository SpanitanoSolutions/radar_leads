import { Lateral } from "@/components/Lateral";
import { requerirSesion } from "@/lib/auth";

// Pantalla privada con datos que cambian: se arma en cada pedido.
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requerirSesion();
  return (
    <div className="app">
      <Lateral />
      <main className="contenido">{children}</main>
    </div>
  );
}
