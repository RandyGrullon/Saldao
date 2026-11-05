import type { Cents, Expense, Id, Item, SplitMode } from '../lib/domain';

export type GroupKind = 'casa' | 'viaje' | 'pareja' | 'otro' | 'directo';
export interface Profile { id: Id; userId: Id | null; name: string; email: string | null; payout: string | null; username: string | null; deletedAt: string | null }
export interface Group {
  id: Id; name: string; kind: GroupKind; currency: string; inviteToken: string; createdAt: string;
  members: Id[]; roles: Record<Id, 'admin' | 'miembro'>;
}
export interface Comment { id: Id; expenseId: Id; profileId: Id; body: string; createdAt: string }
export type Verb = 'grupo_creado' | 'miembro_agregado' | 'se_unio' | 'gasto_creado' | 'gasto_editado' | 'gasto_borrado'
  | 'gasto_restaurado' | 'pago_registrado' | 'pago_confirmado' | 'comentario';
export interface Activity { id: string; groupId: Id; actor: Id; verb: Verb; expenseId: Id | null; payload: Record<string, unknown>; createdAt: string }

export interface Snapshot {
  me: Id;
  profiles: Record<Id, Profile>;
  groups: Group[];
  expenses: Expense[];      // incluye borrados (para restaurarlos desde Actividad)
  comments: Comment[];
  activity: Activity[];
  legalOk: boolean;         // aceptó la versión vigente de los términos y la privacidad
}

export interface ExpenseInput {
  id?: Id; groupId: Id; description: string; category: string; date: string; currency: string; amount: Cents; fxRate: number;
  splitMode: SplitMode; splitParams: Expense['splitParams']; items: Item[] | null; tax: number; tip: number;
  note: string | null; repeat: string | null; payers: Record<Id, Cents>; shares: Record<Id, Cents>; isPayment: boolean;
}
export interface InvitePreview { id: Id; name: string; kind: GroupKind; members: number; placeholders: { id: Id; name: string }[] }

/** Lo que la app necesita del backend. Hay dos: Supabase y uno de demostración en memoria. */
export interface Backend {
  load(): Promise<Snapshot>;
  subscribe(onChange: () => void): () => void;
  saveExpense(e: ExpenseInput): Promise<Id>;
  deleteExpense(id: Id): Promise<void>;
  restoreExpense(id: Id): Promise<void>;
  confirmPayment(id: Id): Promise<void>;
  addComment(expenseId: Id, body: string): Promise<void>;
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
}
