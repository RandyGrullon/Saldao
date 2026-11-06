/**
 * Un error que se arregla solo: sin conexión, la base ocupada, la sesión renovándose o un límite de intentos. La cola
 * lo reintenta más tarde. Cualquier otro error es la base diciendo que no (no cuadra, sin permiso): no se reintenta.
 */
export class RetryLater extends Error {
  readonly retry = true;
}
export const isRetry = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { retry?: unknown }).retry === true;
export const OFFLINE = 'Sin conexión. Esto necesita internet: inténtalo cuando vuelva la señal.';
