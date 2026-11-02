import type { IconName } from '../ui/icons';

export const CATS: Record<string, { name: string; icon: IconName }> = {
  alquiler: { name: 'Alquiler', icon: 'home' },
  luz: { name: 'Luz', icon: 'bolt' },
  agua: { name: 'Agua', icon: 'drop' },
  internet: { name: 'Internet y teléfono', icon: 'wifi' },
  super: { name: 'Supermercado', icon: 'cart' },
  comida: { name: 'Comida y bebida', icon: 'food' },
  gasolina: { name: 'Gasolina', icon: 'fuel' },
  transporte: { name: 'Transporte', icon: 'car' },
  hospedaje: { name: 'Hospedaje', icon: 'bed' },
  paseo: { name: 'Excursión y ocio', icon: 'compass' },
  salud: { name: 'Salud', icon: 'heart' },
  regalos: { name: 'Regalos', icon: 'gift' },
  general: { name: 'General', icon: 'receipt' },
  pago: { name: 'Pago', icon: 'swap' },
};
export const cat = (k: string) => CATS[k] ?? CATS.general;

const GUESS: [RegExp, string][] = [
  [/alquil|renta/i, 'alquiler'], [/luz|ede(norte|sur|este)|electric/i, 'luz'], [/agua|caasd|coraasan|botell[oó]n/i, 'agua'],
  [/internet|claro|altice|wifi|cable|celular|recarga/i, 'internet'],
  [/super|sirena|colmado|bravo|nacional|jumbo|compra|hielo/i, 'super'], [/gasolin|combust|peaje/i, 'gasolina'],
  [/uber|taxi|guagua|metro|pasaje|vuelo|avi[oó]n|parqueo/i, 'transporte'], [/hotel|villa|airbnb|hosped|caba[ñn]a/i, 'hospedaje'],
  [/cena|almuer|desayun|comida|pizza|pollo|bar|cerveza|presidente|caf[eé]|helado|delivery|pedidos/i, 'comida'],
  [/excurs|tour|entrada|bote|cine|playa|fiesta/i, 'paseo'], [/farmacia|m[eé]dic|consulta|seguro/i, 'salud'], [/regalo|cumple/i, 'regalos'],
];
/** Categoría sugerida a partir de lo que escribe la persona; siempre se puede cambiar. */
export const guessCat = (s: string) => GUESS.find(([r]) => r.test(s))?.[1] ?? 'general';
