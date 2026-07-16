/**
 * Error de regla de negocio: su mensaje está escrito para el usuario y se puede
 * mostrar tal cual (ej. "Stock insuficiente de Flanax: disponible 88").
 *
 * Cualquier otro error (fallo de BD, bug, etc.) NO debe mostrarse: puede filtrar
 * rutas del servidor, SQL o datos internos. El manejador de errores solo muestra
 * el mensaje de esta clase; el resto se registra en consola y devuelve un texto
 * genérico.
 */
export class ErrorNegocio extends Error {
  readonly status: number;

  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.name = "ErrorNegocio";
    this.status = status;
  }
}
