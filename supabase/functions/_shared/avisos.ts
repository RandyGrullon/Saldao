// Qué dice cada aviso según lo que pasó en el grupo. Solo los movimientos que le importan a los demás: gastos, pagos,
// comentarios y quien entra; los cambios de ajustes no avisan.
export interface ActivityRow { id: number; group_id: string; actor: string; verb: string; expense_id: string | null; payload: Record<string, unknown> }
export interface AvisoCtx {
  actorName: string;
  group: { name: string; kind: string } | null;
  expense: { description: string; amount: number; currency: string; is_payment: boolean } | null;
}
export interface Aviso { title: string; body: string; path: string; tag: string }

export const money = (cents: number, cur = 'DOP') =>
  `${cur === 'USD' ? 'US$' : cur === 'EUR' ? '€' : 'RD$'} ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function avisoDe(a: ActivityRow, c: AvisoCtx): Aviso | null {
  const who = c.actorName.trim().split(/\s+/)[0] || 'Alguien';
  const p = a.payload ?? {};
  const desc = cut(String(c.expense?.description ?? p.descripcion ?? 'un gasto'), 60);
  const amount = c.expense ? money(c.expense.amount, c.expense.currency) : typeof p.monto === 'number' ? money(p.monto, String(p.moneda ?? 'DOP')) : '';
  const title = !c.group || c.group.kind === 'directo' ? 'Saldao' : cut(c.group.name, 50);
  const toExpense = a.expense_id ? `/gasto/${a.expense_id}` : `/grupo/${a.group_id}`;
  const mk = (body: string, path = toExpense): Aviso => ({ title, body: cut(body, 180), path, tag: `${a.verb}-${a.expense_id ?? a.group_id}` });
  switch (a.verb) {
    case 'gasto_creado': return mk(p.repetido ? `Se anotó solo: «${desc}»${amount ? ` · ${amount}` : ''}` : `${who} añadió «${desc}»${amount ? ` · ${amount}` : ''}`);
    case 'gasto_editado': return mk(`${who} editó «${desc}»`);
    case 'gasto_borrado': return mk(`${who} borró «${desc}»`, `/grupo/${a.group_id}`);
    case 'pago_registrado': return mk(`${who} registró un pago${amount ? ` de ${amount}` : ''}. Confírmalo si te llegó.`);
    case 'pago_confirmado': return mk(`${who} confirmó que le llegó el pago`);
    case 'comentario': return mk(`${who} en «${desc}»: ${String(p.texto ?? '')}`);
    case 'se_unio': return mk(`${who} se unió al grupo`, `/grupo/${a.group_id}`);
    default: return null;
  }
}
