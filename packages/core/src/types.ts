import type { Cents, Expense, Id, Item, SplitMode } from './domain';

export type GroupKind = 'casa' | 'viaje' | 'pareja' | 'otro' | 'directo';
export interface Profile {
  id: Id; userId: Id | null; name: string; email: string | null; payout: string | null; username: string | null; deletedAt: string | null;
  fundOf: Id | null;   // el fondo común de ese grupo (no es una persona)
}
export interface Group {
  id: Id; name: string; kind: GroupKind; currency: string; inviteToken: string; createdAt: string;
  members: Id[]; roles: Record<Id, 'admin' | 'miembro'>;
  budget: number | null;      // presupuesto del mes, en centavos
  simplify: boolean;          // deudas simplificadas: el menor número de pagos
  archivedAt: string | null;
  photoPath: string | null;
  startsOn: string | null;    // grupo de fecha a fecha (un viaje): YYYY-MM-DD
  endsOn: string | null;
}
export interface ListItem { id: Id; groupId: Id; name: string; addedBy: Id; doneBy: Id | null; doneAt: string | null; createdAt: string }
export interface Comment { id: Id; expenseId: Id; profileId: Id; body: string; createdAt: string; pending?: boolean }
export type Verb = 'grupo_creado' | 'miembro_agregado' | 'se_unio' | 'gasto_creado' | 'gasto_editado' | 'gasto_borrado'
  | 'gasto_restaurado' | 'pago_registrado' | 'pago_confirmado' | 'comentario' | 'grupo_editado' | 'salio' | 'fondo_creado' | 'miembro_quitado';
export interface Activity { id: string; groupId: Id; actor: Id; verb: Verb; expenseId: Id | null; payload: Record<string, unknown>; createdAt: string }

export interface Snapshot {
  me: Id;
  profiles: Record<Id, Profile>;
  groups: Group[];
  expenses: Expense[];      // incluye borrados (para restaurarlos desde Actividad)
  comments: Comment[];
  activity: Activity[];
  items: ListItem[];        // listas de compras de los grupos
  legalOk: boolean;         // aceptó la versión vigente de los términos y la privacidad
}

export interface ExpenseInput {
  id?: Id; groupId: Id; description: string; category: string; date: string; currency: string; amount: Cents; fxRate: number;
  splitMode: SplitMode; splitParams: Expense['splitParams']; items: Item[] | null; tax: number; tip: number;
  note: string | null; repeat: string | null; payers: Record<Id, Cents>; shares: Record<Id, Cents>; isPayment: boolean;
}
/** Lo que se puede cambiar de un grupo (un admin). */
export interface GroupPatch {
  name?: string; budget?: number | null; simplify?: boolean; photoPath?: string | null; archived?: boolean;
  startsOn?: string | null; endsOn?: string | null;
}
/** Un archivo para subir: los datos y, si hay, una dirección local para mostrarlo ya (la demostración la usa). */
export interface Upload { data: Blob | ArrayBuffer; type: string; uri?: string }
/** Lo que se leyó de un recibo (montos en centavos). */
export interface ScanResult { merchant: string | null; date: string | null; items: { name: string; price: number }[]; tax: number; tip: number; total: number | null }
export interface InvitePreview { id: Id; name: string; kind: GroupKind; members: number; placeholders: { id: Id; name: string }[] }

// ── cambios que esperan conexión ─────────────────────────────
/** Lo que se puede anotar sin señal: gastos y pagos, borrar y restaurar, confirmar pagos y comentar. */
export type OpBody =
  | { kind: 'save_expense'; input: ExpenseInput & { id: Id }; create: boolean }
  | { kind: 'delete_expense' | 'restore_expense' | 'confirm_payment'; expenseId: Id }
  | { kind: 'add_comment'; commentId: Id; expenseId: Id; body: string };
/** Un cambio en la cola. El id lo pone la app: con el mismo id, la base lo aplica una sola vez. */
export type Op = OpBody & {
  id: Id;
  at: string;        // cuándo se hizo en el teléfono
  label: string;     // cómo se llama si hay que avisar: «Cena en la playa»
  done?: boolean;    // la base ya lo tiene; se quita al traer la foto nueva
  error?: string;    // la base lo rechazó: no se reintenta, se avisa
};

/** Lo que implementa cada backend: Supabase y la demostración en memoria. */
export interface Server {
  load(): Promise<Snapshot>;
  subscribe(onChange: () => void): () => void;
  /** Aplica un cambio de la cola (una sola vez por id). */
  applyOp(op: Op): Promise<unknown>;
  createGroup(name: string, kind: GroupKind): Promise<Id>;
  addPlaceholder(groupId: Id, name: string): Promise<Id>;
  addMember(groupId: Id, profileId: Id): Promise<void>;
  directGroup(other: Id): Promise<Id>;
  invitePreview(token: string): Promise<InvitePreview | null>;
  joinGroup(token: string, as: Id | null): Promise<Id>;
  updateProfile(p: { name: string; payout: string; username: string }): Promise<void>;
  acceptLegal(): Promise<void>;
  /** Borra la cuenta (hay que escribir BORRAR) y cierra la sesión. */
  deleteAccount(confirm: string): Promise<void>;
  signOut(): Promise<void>;
  // ── grupos ──
  updateGroup(groupId: Id, patch: GroupPatch): Promise<void>;
  setMemberRole(groupId: Id, profileId: Id, role: 'admin' | 'miembro'): Promise<void>;
  /** Quitar a alguien del grupo (un admin; con sus cuentas saldadas). */
  removeMember(groupId: Id, profileId: Id): Promise<void>;
  /** Cambiar el nombre de quien todavía no tiene cuenta. */
  renamePlaceholder(groupId: Id, profileId: Id, name: string): Promise<void>;
  leaveGroup(groupId: Id): Promise<void>;
  createFund(groupId: Id): Promise<Id>;
  /** Pone al día los gastos que se repiten; devuelve cuántos creó. */
  catchUpRecurring(): Promise<number>;
  // ── lista de compras ──
  addItem(groupId: Id, name: string): Promise<Id>;
  toggleItem(id: Id): Promise<void>;
  deleteItem(id: Id): Promise<void>;
  // ── fotos ──
  uploadPhoto(path: string, file: Upload): Promise<void>;
  /** Una dirección para ver la foto (firmada y por un rato: el almacenamiento es privado). */
  photoUrl(path: string): Promise<string>;
  setExpensePhoto(expenseId: Id, path: string | null): Promise<void>;
  // ── avisos y recibos ──
  savePushToken(kind: 'web' | 'expo', token: string): Promise<void>;
  deletePushToken(token: string): Promise<void>;
  scanReceipt(image: string, mime: string): Promise<ScanResult>;
}

/**
 * Lo que usan las pantallas (con run). Gastos, pagos, borrados y comentarios pasan por la cola: se ven al instante y se
 * envían cuando hay conexión. Lo demás (grupos, invitaciones, perfil) necesita internet.
 */
export interface Backend extends Omit<Server, 'load' | 'subscribe' | 'applyOp'> {
  saveExpense(e: ExpenseInput): Promise<Id>;
  deleteExpense(id: Id): Promise<void>;
  restoreExpense(id: Id): Promise<void>;
  confirmPayment(id: Id): Promise<void>;
  addComment(expenseId: Id, body: string): Promise<void>;
}
