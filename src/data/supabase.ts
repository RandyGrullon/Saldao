import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Expense, Id } from '../lib/domain';
import { typedUser } from '../lib/format';
import { LEGAL_VERSION } from '../lib/legal';
import type { Activity, Backend, ExpenseInput, Group, InvitePreview, Snapshot } from './types';

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local');
  return (client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }));
}
export const isConfigured = () => !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// ── sesión: correo y contraseña ──────────────────────────────
/** Marca para que la pantalla de entrar diga que la cuenta se borró. */
export const DELETED = 'saldao:cuenta-borrada';
export const UNCONFIRMED = 'Todavía no confirmas tu correo. Abre el enlace que te enviamos (revisa también spam).';
const TAKEN = 'Ese usuario ya lo tiene otra persona. Elige otro.';
// Supabase responde en inglés; estos son los mensajes que una persona puede ver al entrar o registrarse.
const AUTH_ES: [RegExp, string][] = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, UNCONFIRMED],
  [/already (been )?registered/i, 'Ya existe una cuenta con ese correo. Entra o recupera tu contraseña.'],
  [/password should be at least (\d+)/i, 'La contraseña debe tener al menos $1 caracteres.'],
  [/weak|pwned|known to be/i, 'Esa contraseña es muy débil o apareció en filtraciones. Usa otra.'],
  [/same.*password|different from the old/i, 'La contraseña nueva tiene que ser distinta de la anterior.'],
  [/rate limit|too many|security purposes/i, 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'],
  [/signups? not allowed|signup.*disabled/i, 'El registro está cerrado por ahora.'],
  [/invalid.*email|unable to validate email/i, 'Ese correo no parece válido.'],
  [/database error saving new user/i, TAKEN], // el usuario se lo llevó otra persona en el mismo instante
];
function authError(e: { message: string }) {
  for (const [r, t] of AUTH_ES) { const m = e.message.match(r); if (m) return new Error(t.replace('$1', m[1] ?? '')); }
  return new Error(e.message);
}
/** Con correo o con usuario. Con usuario, la base devuelve el correo solo si la contraseña es la correcta. */
export async function signIn(login: string, password: string) {
  let email = login;
  if (!login.includes('@')) {
    const { data, error } = await sb().rpc('login_email', { p_username: typedUser(login), p_password: password });
    if (error) throw dbError(error);
    if (!data) throw new Error('Usuario o contraseña incorrectos.');
    email = data;
  }
  const { error } = await sb().auth.signInWithPassword({ email, password });
  // el correo va con el error para poder reenviar la confirmación aunque haya escrito su usuario
  if (error) throw Object.assign(authError(error), { email });
}
export async function usernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await sb().rpc('username_available', { p_username: username });
  if (error) throw dbError(error);
  return !!data;
}
/** Devuelve si hace falta confirmar el correo antes de entrar (depende de "Confirm email" en Supabase). */
export async function signUp(name: string, username: string, email: string, password: string) {
  if (!(await usernameAvailable(username))) throw new Error(TAKEN);
  const { data, error } = await sb().auth.signUp({ email, password, options: { data: { full_name: name, username, legal: LEGAL_VERSION }, emailRedirectTo: location.origin } });
  if (error) throw authError(error);
  // con "Confirm email" activo, un correo ya registrado no da error: vuelve un usuario sin identidades
  if (data.user && !data.user.identities?.length) throw authError({ message: 'already registered' });
  return { needsConfirm: !data.session };
}
export async function resendConfirmation(email: string) {
  const { error } = await sb().auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin } });
  if (error) throw authError(error);
}
export async function signInWithGoogle() {
  // Si Google no está activado, Supabase redirige a una página de error en JSON: mejor avisar antes de salir de la app.
  const settings = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } })
    .then(r => r.json()).catch(() => null);
  if (settings && !settings.external?.google) throw new Error('Entrar con Google todavía no está activado. Usa tu correo y contraseña.');
  const { error } = await sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  if (error) throw authError(error);
}
export async function sendPasswordReset(email: string) {
  const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  if (error) throw authError(error);
}
export async function setNewPassword(password: string) {
  const { error } = await sb().auth.updateUser({ password });
  if (error) throw authError(error);
}

// ── errores de la base ───────────────────────────────────────
// Los mensajes propios de las funciones (en español) se muestran tal cual; los de Postgres, que vienen en inglés y con
// nombres de tablas, se cambian por uno claro sin detalles internos.
const DB_ES: Record<string, string> = {
  '42501': 'No tienes permiso para hacer eso.',
  '23505': 'Eso ya existe.',
  '23514': 'Algún dato no es válido. Revísalo e intenta de nuevo.',
  '22P02': 'Algún dato no es válido. Revísalo e intenta de nuevo.',
  '22001': 'Un texto es demasiado largo.',
  'PGRST301': 'Tu sesión venció. Vuelve a entrar.',
};
type DbErr = { message?: string; code?: string };
const english = (m: string) => /permission denied|row-level security|violates|constraint|syntax|relation|column|function|JWT/i.test(m);
export function dbError(e: DbErr): Error {
  const m = e.message ?? '';
  if (m && !english(m) && ['P0001', '22023', '28000', '42501'].includes(e.code ?? '')) return new Error(m);
  return new Error(DB_ES[e.code ?? ''] ?? 'No se pudo completar. Revisa tu conexión e intenta de nuevo.');
}

// ── lectura ──────────────────────────────────────────────────
async function ok<T>(q: PromiseLike<{ data: T | null; error: DbErr | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw dbError(error);
  return data as T;
}
type Row = Record<string, any>;
const toExpense = (r: Row): Expense => ({
  id: r.id, groupId: r.group_id, description: r.description, category: r.category, date: r.date, currency: r.currency,
  amount: Number(r.amount), fxRate: Number(r.fx_rate), isPayment: r.is_payment, paymentStatus: r.payment_status,
  splitMode: r.split_mode, splitParams: r.split_params ?? {}, items: r.items, tax: Number(r.tax), tip: Number(r.tip),
  note: r.note, repeat: r.repeat, createdBy: r.created_by, createdAt: r.created_at, deletedAt: r.deleted_at,
  payers: Object.fromEntries((r.expense_payers ?? []).map((x: Row) => [x.profile_id, Number(x.amount)])),
  shares: Object.fromEntries((r.expense_shares ?? []).map((x: Row) => [x.profile_id, Number(x.amount)])),
});
const toGroup = (r: Row): Group => ({
  id: r.id, name: r.name, kind: r.kind, currency: r.currency, inviteToken: r.invite_token, createdAt: r.created_at,
  members: (r.group_members ?? []).map((m: Row) => m.profile_id),
  roles: Object.fromEntries((r.group_members ?? []).map((m: Row) => [m.profile_id, m.role])),
});

let me: Id | null = null;
const toSnake = (e: ExpenseInput) => ({
  id: e.id ?? null, group_id: e.groupId, description: e.description, category: e.category, date: e.date, currency: e.currency,
  amount: e.amount, fx_rate: e.fxRate, split_mode: e.splitMode, split_params: e.splitParams, items: e.items, tax: e.tax, tip: e.tip,
  note: e.note, repeat: e.repeat, payers: e.payers, shares: e.shares, is_payment: e.isPayment,
});
const rpc = async <T = unknown>(fn: string, args: Record<string, unknown>) => ok<T>(sb().rpc(fn, args));

export const supabaseBackend: Backend = {
  async load(): Promise<Snapshot> {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) throw new Error('Sesión vencida');
    const c = sb();
    const [profiles, groups, expenses, comments, activity, legal] = await Promise.all([
      // el correo no se pide: los demás no lo ven; el tuyo viene de la sesión
      ok<Row[]>(c.from('profiles').select('id, user_id, name, payout, username, deleted_at')),
      ok<Row[]>(c.from('groups').select('id, name, kind, currency, invite_token, created_at, group_members(profile_id, role)').is('archived_at', null)),
      ok<Row[]>(c.from('expenses').select('*, expense_payers(profile_id, amount), expense_shares(profile_id, amount)').order('date', { ascending: false }).limit(3000)),
      ok<Row[]>(c.from('comments').select('id, expense_id, profile_id, body, created_at').is('deleted_at', null).order('created_at')),
      ok<Row[]>(c.from('activity').select('*').order('id', { ascending: false }).limit(300)),
      ok<Row[]>(c.from('legal_acceptances').select('version').eq('version', LEGAL_VERSION)),
    ]);
    me = profiles.find(p => p.user_id === user.id)?.id ?? null;
    if (!me) throw new Error('No encontramos tu perfil');
    return {
      me,
      profiles: Object.fromEntries(profiles.map(p => [p.id, { id: p.id, userId: p.user_id, name: p.name, email: p.user_id === user.id ? user.email ?? null : null,
        payout: p.payout, username: p.username, deletedAt: p.deleted_at }])),
      groups: groups.map(toGroup),
      expenses: expenses.map(toExpense),
      comments: comments.map(r => ({ id: r.id, expenseId: r.expense_id, profileId: r.profile_id, body: r.body, createdAt: r.created_at })),
      activity: activity.map((r): Activity => ({ id: String(r.id), groupId: r.group_id, actor: r.actor, verb: r.verb, expenseId: r.expense_id, payload: r.payload ?? {}, createdAt: r.created_at })),
      legalOk: legal.length > 0,
    };
  },
  subscribe(onChange) {
    const ch = sb().channel('saldao-cambios');
    for (const table of ['expenses', 'expense_payers', 'expense_shares', 'comments', 'activity', 'group_members', 'groups', 'profiles'])
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    ch.subscribe();
    return () => { sb().removeChannel(ch); };
  },
  saveExpense: e => rpc<Id>('save_expense', { p: toSnake(e) }),
  deleteExpense: async id => { await rpc('delete_expense', { p_id: id }); },
  restoreExpense: async id => { await rpc('restore_expense', { p_id: id }); },
  confirmPayment: async id => { await rpc('confirm_payment', { p_id: id }); },
  async addComment(expenseId, body) { await ok(sb().from('comments').insert({ expense_id: expenseId, profile_id: me, body })); },
  createGroup: (name, kind) => rpc<Id>('create_group', { p_name: name, p_kind: kind }),
  addPlaceholder: (groupId, name) => rpc<Id>('add_placeholder', { p_group: groupId, p_name: name }),
  addMember: async (groupId, profileId) => { await rpc('add_member', { p_group: groupId, p_profile: profileId }); },
  directGroup: other => rpc<Id>('direct_group', { p_other: other }),
  invitePreview: token => rpc<InvitePreview | null>('invite_preview', { p_token: token }),
  joinGroup: (token, as) => rpc<Id>('join_group', { p_token: token, p_as: as }),
  async updateProfile(p) {
    const { error } = await sb().from('profiles').update({ name: p.name, payout: p.payout || null, username: p.username || null }).eq('id', me!);
    if (error?.code === '23505') throw new Error(TAKEN);
    if (error) throw dbError(error);
  },
  acceptLegal: async () => { await rpc('accept_legal', { p_version: LEGAL_VERSION }); },
  async deleteAccount(confirm) {
    await rpc('delete_account', { p_confirm: confirm });
    try { sessionStorage.setItem(DELETED, '1'); } catch { /* sin almacenamiento: no sale el aviso */ }
    // la cuenta ya no existe: la sesión se cierra en este teléfono (el servidor ya no la reconoce)
    await sb().auth.signOut({ scope: 'local' });
  },
  async signOut() { await sb().auth.signOut(); },
};
