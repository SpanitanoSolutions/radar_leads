const SOLO_DIGITOS = /\D/g;

export function normalizarDigitos(valor: string): string {
  return valor.replace(SOLO_DIGITOS, "");
}

export function validarCuitCuil(valor: string): boolean {
  const digitos = normalizarDigitos(valor);
  if (!/^\d{11}$/.test(digitos)) return false;
  const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = factores.reduce((total, factor, indice) => total + Number(digitos[indice]) * factor, 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return Number(digitos[10]) === verificador;
}

export function validarCbuCvu(valor: string): boolean {
  const digitos = normalizarDigitos(valor);
  if (!/^\d{22}$/.test(digitos)) return false;
  const primerBloque = [7, 1, 3, 9, 7, 1, 3];
  const segundoBloque = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
  const digitoVerificador = (bloque: string, factores: number[]) =>
    (10 - (factores.reduce((total, factor, indice) => total + Number(bloque[indice]) * factor, 0) % 10)) % 10;
  return Number(digitos[7]) === digitoVerificador(digitos.slice(0, 7), primerBloque)
    && Number(digitos[21]) === digitoVerificador(digitos.slice(8, 21), segundoBloque);
}

export function validarFechaHecho(fecha: Date, ahora = new Date()): boolean {
  return Number.isFinite(fecha.getTime()) && fecha.getTime() <= ahora.getTime();
}

export function validarMontoSiniestro(monto: number): boolean {
  return Number.isFinite(monto) && monto >= 0;
}

export function polizaVigenteEnFecha(
  poliza: { vigenciaDesde: string | null; vigenciaHasta: string | null },
  fechaHecho: Date,
): boolean {
  if (!Number.isFinite(fechaHecho.getTime())) return false;
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fechaHecho);
  return (!poliza.vigenciaDesde || poliza.vigenciaDesde <= fecha)
    && (!poliza.vigenciaHasta || poliza.vigenciaHasta >= fecha);
}
