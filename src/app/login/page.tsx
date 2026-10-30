import type { Metadata } from "next";
import Link from "next/link";
import { IconoRadar } from "@/components/iconos";
import { FormLogin } from "./FormLogin";

export const metadata: Metadata = { title: "Entrar · UNIQO" };

export default function LoginPage() {
  return (
    <main className="login">
      <div className="login-card">
        <div className="marca">
          <span className="marca-icono" aria-hidden="true">
            <IconoRadar />
          </span>
          <span className="marca-nombre">UNIQO</span>
          <span className="barra-producto">Administración de seguros</span>
        </div>
        <h1 className="login-titulo">Entrar</h1>
        <FormLogin />
      </div>
      <footer className="login-pie">
        <Link href="/privacidad">Política de privacidad</Link>
      </footer>
    </main>
  );
}
