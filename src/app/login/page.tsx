import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import logoUniqo from "@/app/icon.png";
import { FormLogin } from "./FormLogin";

export const metadata: Metadata = { title: "Entrar · UNIQO" };

export default function LoginPage() {
  return (
    <main className="login">
      <div className="login-card">
        <div className="marca">
          <Image src={logoUniqo} alt="UNIQO" width={40} height={40} loading="eager" className="login-logo" />
          <span className="barra-producto">Tecnología aplicada a seguros</span>
        </div>
        <h1 className="login-titulo">Entrar</h1>
        <FormLogin />
      </div>
      <footer className="login-pie">
        <Link href="/terminos">Términos y condiciones</Link>
        <Link href="/privacidad">Política de privacidad</Link>
      </footer>
    </main>
  );
}
