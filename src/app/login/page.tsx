import type { Metadata } from "next";
import { IconoRadar } from "@/components/iconos";
import { FormLogin } from "./FormLogin";

export const metadata: Metadata = { title: "Entrar · Radar de leads" };

export default function LoginPage() {
  return (
    <main className="login">
      <div className="login-card">
        <div className="marca">
          <span className="marca-icono" aria-hidden="true">
            <IconoRadar />
          </span>
          <span className="marca-nombre marca-nombre-oscuro">Radar de leads</span>
        </div>
        <h1 className="login-titulo">Entrar</h1>
        <FormLogin />
      </div>
    </main>
  );
}
