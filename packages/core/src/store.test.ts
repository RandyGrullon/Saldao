// La cola sin conexión, contra una base de mentira a la que se le puede cortar la señal.
import { afterEach, describe, expect, it } from 'vitest';
import { OFFLINE, RetryLater } from './errors';
import { discard, getSnap, getSync, run, start, stop, sync, type KV } from './store';
import type { ExpenseInput, Op, Server, Snapshot } from './types';

function memory() {
  const m = new Map<string, string>();
  const kv: KV = { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } };
  return { kv, m };
}

function fakeServer() {
  const db: Snapshot = {
    me: 'me', profiles: {}, expenses: [], comments: [], activity: [], items: [], legalOk: true,
    groups: [{ id: 'g', name: 'Casa', kind: 'casa', currency: 'DOP', inviteToken: 't', createdAt: '2026-11-01', members: ['me', 'ana'], roles: {},
      budget: null, simplify: false, archivedAt: null, photoPath: null, startsOn: null, endsOn: null }],
  };
  const f = { db, online: true, reject: null as string | null, loseReply: false, seen: new Set<string>(), sent: [] as Op[] };
  const unused = async (): Promise<never> => { throw new Error('no se usa en estas pruebas'); };
  const server: Server = {
    load: async () => { if (!f.online) throw new RetryLater(OFFLINE); return structuredClone(db); },
    subscribe: () => () => {},
    async applyOp(op) {
      if (!f.online) throw new RetryLater(OFFLINE);
      f.sent.push(op);
      if (f.reject) throw new Error(f.reject);
      if (!f.seen.has(op.id)) { // como apply_op: cada id una sola vez
        f.seen.add(op.id);
        if (op.kind === 'save_expense') {
          const e = { ...op.input, createdBy: 'me', createdAt: op.at, deletedAt: null, paymentStatus: null };
          const i = db.expenses.findIndex(x => x.id === e.id);
          if (i < 0) db.expenses.push(e); else db.expenses[i] = e;
        }
        if (op.kind === 'delete_expense') db.expenses = db.expenses.map(e => (e.id === op.expenseId ? { ...e, deletedAt: op.at } : e));
        if (op.kind === 'add_comment') db.comments.push({ id: op.commentId, expenseId: op.expenseId, profileId: 'me', body: op.body, createdAt: op.at });
      }
      if (f.loseReply) { f.loseReply = false; throw new RetryLater(OFFLINE); } // llegó, pero la respuesta se perdió
    },
    createGroup: unused, addPlaceholder: unused, addMember: unused, directGroup: unused, invitePreview: unused, joinGroup: unused,
    updateProfile: unused, acceptLegal: unused, deleteAccount: unused,
    signOut: async () => {},
    catchUpRecurring: async () => 0,
    updateGroup: unused, setMemberRole: unused, removeMember: unused, renamePlaceholder: unused, leaveGroup: unused, createFund: unused, addItem: unused, toggleItem: unused, deleteItem: unused,
    uploadPhoto: unused, photoUrl: unused, setExpensePhoto: unused, savePushToken: unused, deletePushToken: unused, scanReceipt: unused,
  };
  return Object.assign(f, { server });
}

const hielo = (o: Partial<ExpenseInput> = {}): ExpenseInput => ({
  groupId: 'g', description: 'Hielo', category: 'super', date: '2026-11-06', currency: 'DOP', amount: 1000, fxRate: 1,
  splitMode: 'equal', splitParams: {}, items: null, tax: 0, tip: 0, note: null, repeat: null,
  payers: { me: 1000 }, shares: { me: 500, ana: 500 }, isPayment: false, ...o,
});
const expense = (id: string) => getSnap()!.expenses.find(e => e.id === id);

afterEach(() => stop());

describe('cola sin conexión', () => {
  it('con conexión, el gasto llega a la base y se ve sin marca de pendiente', async () => {
    const f = fakeServer(), { kv } = memory();
    await start(f.server, { storage: kv, key: 'u1' });
    const id = await run(b => b.saveExpense(hielo()));
    expect(f.db.expenses.map(e => e.id)).toEqual([id]);
    expect(expense(id)?.pending).toBeFalsy();
    expect(getSync()).toMatchObject({ offline: false, pending: 0, failed: [] });
  });

  it('sin conexión se ve al instante como pendiente y sale solo al volver, una sola vez', async () => {
    const f = fakeServer(), { kv } = memory();
    await start(f.server, { storage: kv, key: 'u1' });
    f.online = false;
    const id = await run(b => b.saveExpense(hielo()));
    expect(expense(id)).toMatchObject({ description: 'Hielo', pending: true });
    expect(getSync()).toMatchObject({ offline: true, pending: 1 });
    expect(f.db.expenses).toHaveLength(0);
    f.online = true;
    await sync();
    expect(f.db.expenses.map(e => e.id)).toEqual([id]);
    expect(expense(id)?.pending).toBeFalsy();
    expect(getSync()).toMatchObject({ offline: false, pending: 0 });
  });

  it('se guarda en el teléfono: al abrir sin conexión se ve lo último y lo pendiente', async () => {
    const f = fakeServer(), { kv } = memory();
    await start(f.server, { storage: kv, key: 'u1' });
    f.online = false;
    const id = await run(b => b.saveExpense(hielo()));
    stop();
    await start(f.server, { storage: kv, key: 'u1' }); // sin conexión: abre con lo guardado
    expect(expense(id)).toMatchObject({ pending: true });
    f.online = true;
    await sync();
    expect(f.db.expenses).toHaveLength(1);
  });

  it('si la respuesta se pierde, reenviar no duplica', async () => {
    const f = fakeServer(), { kv } = memory();
    await start(f.server, { storage: kv, key: 'u1' });
    f.loseReply = true;
    const id = await run(b => b.saveExpense(hielo()));
    expect(getSync().pending).toBe(1);
    await sync();
    expect(f.sent.map(o => o.id)).toEqual([f.sent[0].id, f.sent[0].id]); // el mismo cambio, dos veces
    expect(f.db.expenses.map(e => e.id)).toEqual([id]);
    expect(getSync().pending).toBe(0);
  });

  it('con conexión, si la base dice que no, la pantalla recibe el error y no queda en la cola', async () => {
    const f = fakeServer(), { kv } = memory();
    await start(f.server, { storage: kv, key: 'u1' });
    f.reject = 'No cuadra';
    await expect(run(b => b.saveExpense(hielo()))).rejects.toThrow('No cuadra');
    expect(getSync()).toMatchObject({ pending: 0, failed: [] });
    expect(getSnap()!.expenses).toHaveLength(0);
  });

  it('lo que la base rechaza en segundo plano se avisa, no se muestra y se puede descartar', async () => {
    const f = fakeServer(), { kv } = memory();
    await start(f.server, { storage: kv, key: 'u1' });
    f.online = false;
    const id = await run(b => b.saveExpense(hielo()));
    f.online = true; f.reject = 'Ya no perteneces a ese grupo';
    await sync();
    const { failed } = getSync();
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ label: '«Hielo»', error: 'Ya no perteneces a ese grupo' });
    expect(expense(id)).toBeUndefined();
    discard(failed[0].id);
    expect(getSync().failed).toEqual([]);
  });

  it('crear, comentar y borrar sin conexión llega en el mismo orden', async () => {
    const f = fakeServer(), { kv } = memory();
    await start(f.server, { storage: kv, key: 'u1' });
    f.online = false;
    const id = await run(b => b.saveExpense(hielo()));
    await run(b => b.addComment(id, 'Del colmado'));
    await run(b => b.deleteExpense(id));
    expect(expense(id)?.deletedAt).not.toBeNull();
    expect(getSnap()!.comments).toMatchObject([{ expenseId: id, body: 'Del colmado', pending: true }]);
    f.online = true;
    await sync();
    expect(f.sent.map(o => o.kind)).toEqual(['save_expense', 'add_comment', 'delete_expense']);
    expect(f.db.expenses[0].deletedAt).not.toBeNull();
    expect(f.db.comments).toHaveLength(1);
  });

  it('otra cuenta en el mismo teléfono no ve ni envía lo de la primera', async () => {
    const f = fakeServer(), g = fakeServer(), { kv } = memory();
    await start(f.server, { storage: kv, key: 'u1' });
    f.online = false;
    await run(b => b.saveExpense(hielo()));
    stop();
    await start(g.server, { storage: kv, key: 'u2' });
    await sync();
    expect(getSnap()!.expenses).toHaveLength(0);
    expect(g.sent).toEqual([]);
  });

  it('la primera vez, sin conexión y sin nada guardado, avisa', async () => {
    const f = fakeServer(), { kv } = memory();
    f.online = false;
    await expect(start(f.server, { storage: kv, key: 'nuevo' })).rejects.toThrow(OFFLINE);
  });

  it('al salir, la foto y la cola se van del teléfono', async () => {
    const f = fakeServer(), { kv, m } = memory();
    await start(f.server, { storage: kv, key: 'u1' });
    f.online = false;
    await run(b => b.saveExpense(hielo()));
    expect([...m.keys()].sort()).toEqual(['saldao:cola:u1', 'saldao:foto:u1']);
    await run(b => b.signOut());
    expect([...m.keys()]).toEqual([]);
  });
});
