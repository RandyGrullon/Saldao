// El nombre vive solo aquí: cambiarlo es una línea (manifest, título y textos lo leen de este objeto).
export const APP = {
  name: 'Saldao',
  short: 'Saldao',
  description: 'Divide gastos con tus amigos y sabe siempre quién debe qué, por qué y desde cuándo.',
  baseCurrency: 'DOP',
  /** El sitio publicado: la app nativa abre aquí los términos y arma los enlaces de invitación. */
  site: 'https://saldao-green.vercel.app',
  /** La clave pública de los avisos web (Web Push). La privada solo la tiene la función que los manda. */
  vapidPublicKey: 'BASA7TKjx2x9G9Tl_SkJz0IYdBs3xUEmhQZeYd3VuebWUI6IUQ8kmKlJJjrYlG1XLNlABydyyRy3HnoJX1ZUuSw',
} as const;
