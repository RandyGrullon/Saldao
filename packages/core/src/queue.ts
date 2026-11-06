// La foto que se ve = lo último que dio la base + los cambios que siguen en la cola, aplicados encima.
import type { Expense } from './domain';
import type { Op, Snapshot } from './types';

/** Un uuid para cada cambio (y para lo nuevo: gastos y comentarios llevan su id desde el teléfono). */
export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });

export function overlay(s: Snapshot, ops: Op[]): Snapshot {
  const live = ops.filter(o => !o.error);
  if (!live.length) return s;
  let expenses = s.expenses, comments = s.comments;
  const patch = (id: string, f: (e: Expense) => Expense) => { expenses = expenses.map(e => (e.id === id ? f(e) : e)); };
  for (const o of live) {
    const pending = !o.done;
    switch (o.kind) {
      case 'save_expense': {
        const prev = expenses.find(e => e.id === o.input.id);
        const e: Expense = {
          ...o.input, createdBy: prev?.createdBy ?? s.me, createdAt: prev?.createdAt ?? o.at, deletedAt: prev?.deletedAt ?? null,
          paymentStatus: o.input.isPayment ? (prev?.paymentStatus ?? (o.input.shares[s.me] ? 'confirmado' : 'pendiente')) : null,
          pending: pending || !!prev?.pending,
        };
        expenses = prev ? expenses.map(x => (x.id === e.id ? e : x)) : [...expenses, e];
        break;
      }
      case 'delete_expense': patch(o.expenseId, e => ({ ...e, deletedAt: e.deletedAt ?? o.at, pending: pending || !!e.pending })); break;
      case 'restore_expense': patch(o.expenseId, e => ({ ...e, deletedAt: null, pending: pending || !!e.pending })); break;
      case 'confirm_payment': patch(o.expenseId, e => ({ ...e, paymentStatus: 'confirmado', pending: pending || !!e.pending })); break;
      case 'add_comment':
        if (!comments.some(c => c.id === o.commentId))
          comments = [...comments, { id: o.commentId, expenseId: o.expenseId, profileId: s.me, body: o.body, createdAt: o.at, pending }];
        break;
    }
  }
  return { ...s, expenses, comments };
}
