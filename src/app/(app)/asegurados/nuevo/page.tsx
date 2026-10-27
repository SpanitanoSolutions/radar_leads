import Link from "next/link";
import { IconoAtras } from "@/components/iconos";
import { FormAsegurado } from "../FormAsegurado";
import "../asegurados.css";

export default function NuevoAsegurado() {
  return (
    <>
      <Link href="/asegurados" className="volver">
        <IconoAtras />
        Asegurados
      </Link>
      <header className="encabezado">
        <div className="encabezado-texto">
          <h1 className="titulo">Nuevo asegurado</h1>
          <p className="subtitulo">Cargá los datos a mano. Las pólizas se suman importando la planilla.</p>
        </div>
      </header>
      <FormAsegurado cancelarHref="/asegurados" />
    </>
  );
}
