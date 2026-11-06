import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import type { Database, Json, Tables } from './database.types';
import type { Expense, Id, Item } from './domain';
import { OFFLINE, RetryLater } from './errors';
import { typedUser } from './format';
import { LEGAL_VERSION } from './legal';
import type { Activity, ExpenseInput, Group, InvitePreview, ListItem, Op, ScanResult, Server, Snapshot } from './types';

// ── conexión ─────────────────────────────────────────────────
// Cada app la configura al arrancar: la web con sus variables de Vite y el origen de la página; la nativa con las suyas,
// su almacenamiento seguro y sin leer la sesión de la URL.
export interface SupabaseConfig {
  url: string;
  anonKey: string;
  /** Adónde vuelven los enlaces de los correos y de Google. En la web, el origen de la página. */
  redirectTo: string;
  /** La web recibe la sesión en la URL al volver de un enlace; la app nativa, no. */
  detectSessionInUrl?: boolean;
  /** Dónde guardar la sesión. Sin esto, localStorage (la web). */
  storage?: SupportedStorage;
  /** Justo después de borrar la cuenta y antes de cerrar la sesión (la web deja un aviso para la pantalla de entrar). */
  onAccountDeleted?: () => void;
}
export type Client = SupabaseClient<Database>;

let cfg: SupabaseConfig | null = null;
let client: Client | null = null;
export function initSupabase(c: SupabaseConfig) { cfg = c; client = null; }
const conf = () => { if (!cfg) throw new Error('Falta configurar Supabase'); return cfg; };
// Con señal débil una petición puede quedarse colgada: a los 20 s se corta y la cola la reintenta luego.
const TIMEOUT = 20_000;
const timedFetch: typeof fetch = (input, init) => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
  init?.signal?.addEventListener('abort', () => ctl.abort());
  return fetch(input, { ...init, signal: ctl.signal }).finally(() => clearTimeout(t));
};
export function sb(): Client {
  const c = conf();
  return (client ??= createClient<Database>(c.url, c.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: c.detectSessionInUrl ?? false, ...(c.storage ? { storage: c.storage } : {}) },
    global: { fetch: timedFetch },
  }));
}
/** El usuario de la sesión guardada (sin ir a la red, salvo para renovarla). Sin señal para renovarla: reintentar. */
async function sessionUser() {
  const { data: { session }, error } = await sb().auth.getSession();
  if (!session) throw error ? new RetryLater(OFFLINE) : new Error('Sesión vencida');
  return session.user;
}

// ── sesión: correo y contraseña ──────────────────────────────
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
export function authError(e: { message: string }) {
  for (const [r, t] of AUTH_ES) { const m = e.message.match(r); if (m) return new Error(t.replace('$1', m[1] ?? '')); }
  return new Error(e.message);
}
/** Con correo o con usuario. Con usuario, la base devuelve el correo solo si la contraseña es la correcta. */
export async function signIn(login: string, password: string) {
  let email = login;
  if (!login.includes('@')) {
    const data = await ok(sb().rpc('login_email', { p_username: typedUser(login), p_password: password }));
    if (!data) throw new Error('Usuario o contraseña incorrectos.');
    email = data;
  }
  const { error } = await sb().auth.signInWithPassword({ email, password });
  // el correo va con el error para poder reenviar la confirmación aunque haya escrito su usuario
  if (error) throw Object.assign(authError(error), { email });
}
export async function usernameAvailable(username: string): Promise<boolean> {
  return !!(await ok(sb().rpc('username_available', { p_username: username })));
}
/** Devuelve si hace falta confirmar el correo antes de entrar (depende de "Confirm email" en Supabase). */
export async function signUp(name: string, username: string, email: string, password: string) {
  if (!(await usernameAvailable(username))) throw new Error(TAKEN);
  const { data, error } = await sb().auth.signUp({ email, password, options: { data: { full_name: name, username, legal: LEGAL_VERSION }, emailRedirectTo: conf().redirectTo } });
  if (error) throw authError(error);
  // con "Confirm email" activo, un correo ya registrado no da error: vuelve un usuario sin identidades
  if (data.user && !data.user.identities?.length) throw authError({ message: 'already registered' });
  return { needsConfirm: !data.session };
}
export async function resendConfirmation(email: string) {
  const { error } = await sb().auth.resend({ type: 'signup', email, options: { emailRedirectTo: conf().redirectTo } });
  if (error) throw authError(error);
}
/** Si Google no está activado, Supabase redirige a una página de error en JSON: mejor avisar antes de salir de la app. */
export async function requireGoogle() {
  const c = conf();
  const settings = await fetch(`${c.url}/auth/v1/settings`, { headers: { apikey: c.anonKey } }).then(r => r.json()).catch(() => null);
  if (settings && !settings.external?.google) throw new Error('Entrar con Google todavía no está activado. Usa tu correo y contraseña.');
}
/** En la web: la página se va a Google y vuelve con la sesión. (La app nativa abre su propio navegador seguro.) */
export async function signInWithGoogle() {
  await requireGoogle();
  const { error } = await sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: conf().redirectTo } });
  if (error) throw authError(error);
}
export async function sendPasswordReset(email: string) {
  const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: conf().redirectTo });
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
type DbErr = { message?: string; code?: string; hint?: string };
const english = (m: string) => /permission denied|row-level security|violates|constraint|syntax|relation|column|function|JWT/i.test(m);
// Lo que se arregla solo y vale la pena reintentar: sin respuesta (sin código), tiempo agotado, la base ocupada o
// reiniciándose, la sesión vencida (se renueva sola).
const TRANSIENT = new Set(['57014', '40001', '40P01', '53300', '53400', '57P01', '57P03', '08000', '08001', '08003', '08006',
  'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', 'PGRST301']);
export function dbError(e: DbErr): Error {
  const m = e.message ?? '';
  if (!e.code || /failed to fetch|network|load failed|abort/i.test(m)) return new RetryLater(OFFLINE);
  if (e.hint === 'rate_limited') return new RetryLater(m); // el límite de intentos: el mensaje dice cuánto esperar
  if (TRANSIENT.has(e.code)) return new RetryLater(DB_ES[e.code] ?? OFFLINE);
  if (m && !english(m) && ['P0001', '22023', '28000', '42501'].includes(e.code)) return new Error(m);
  return new Error(DB_ES[e.code ?? ''] ?? 'No se pudo completar. Revisa tu conexión e intenta de nuevo.');
}

// ── lectura ──────────────────────────────────────────────────
async function ok<T>(q: PromiseLike<{ data: T | null; error: DbErr | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw dbError(error);
  return data as T;
}
// Las columnas jsonb llegan como Json: aquí se les pone la forma que la app les da al guardarlas.
const fromJson = <T>(j: Json) => j as unknown as T;
const toJson = (v: unknown) => v as Json;

type Money = Pick<Tables<'expense_payers'>, 'profile_id' | 'amount'>;
type ExpenseRow = Tables<'expenses'> & { expense_payers: Money[]; expense_shares: Money[] };
type GroupRow = Pick<Tables<'groups'>, 'id' | 'name' | 'kind' | 'currency' | 'invite_token' | 'created_at' | 'budget' | 'simplify' | 'archived_at' | 'photo_path' | 'starts_on' | 'ends_on'> & {
  group_members: Pick<Tables<'group_members'>, 'profile_id' | 'role'>[];
};
const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id, groupId: r.group_id, description: r.description, category: r.category, date: r.date, currency: r.currency,
  amount: Number(r.amount), fxRate: Number(r.fx_rate), isPayment: r.is_payment, paymentStatus: r.payment_status,
  splitMode: r.split_mode, splitParams: fromJson<Expense['splitParams']>(r.split_params) ?? {}, items: fromJson<Item[] | null>(r.items),
  tax: Number(r.tax), tip: Number(r.tip), note: r.note, repeat: r.repeat, createdBy: r.created_by, createdAt: r.created_at, deletedAt: r.deleted_at,
  photoPath: r.photo_path, repeatFrom: r.repeat_from,
  payers: Object.fromEntries(r.expense_payers.map(x => [x.profile_id, Number(x.amount)])),
  shares: Object.fromEntries(r.expense_shares.map(x => [x.profile_id, Number(x.amount)])),
});
const toGroup = (r: GroupRow): Group => ({
  id: r.id, name: r.name, kind: r.kind, currency: r.currency, inviteToken: r.invite_token, createdAt: r.created_at,
  members: r.group_members.map(m => m.profile_id),
  roles: Object.fromEntries(r.group_members.map(m => [m.profile_id, m.role])),
  budget: r.budget == null ? null : Number(r.budget), simplify: r.simplify, archivedAt: r.archived_at, photoPath: r.photo_path,
  startsOn: r.starts_on, endsOn: r.ends_on,
});

let me: Id | null = null;
const mine = () => { if (!me) throw new Error('Sesión vencida'); return me; };
const toSnake = (e: ExpenseInput & { id: Id }) => ({
  id: e.id, group_id: e.groupId, description: e.description, category: e.category, date: e.date, currency: e.currency,
  amount: e.amount, fx_rate: e.fxRate, split_mode: e.splitMode, split_params: e.splitParams, items: e.items, tax: e.tax, tip: e.tip,
  note: e.note, repeat: e.repeat, payers: e.payers, shares: e.shares, is_payment: e.isPayment,
});

// Cada cambio de la cola, como lo recibe apply_op. Un gasto nuevo lleva su id en new_id (con id, la base edita).
function opArgs(op: Op): Json {
  switch (op.kind) {
    case 'save_expense': {
      const p = toSnake(op.input);
      return toJson({ p: op.create ? { ...p, id: null, new_id: p.id } : p });
    }
    case 'add_comment': return { id: op.commentId, expense_id: op.expenseId, body: op.body };
    default: return { id: op.expenseId };
  }
}

export const supabaseBackend: Server = {
  async load(): Promise<Snapshot> {
    const user = await sessionUser();
    const c = sb();
    const [profiles, groups, expenses, comments, activity, legal, items] = await Promise.all([
      // el correo no se pide (la base no lo deja leer): el tuyo viene de la sesión
      ok(c.from('profiles').select('id, user_id, name, payout, username, deleted_at, fund_of')),
      // también los archivados: sus saldos siguen contando y se pueden desarchivar
      ok(c.from('groups').select('id, name, kind, currency, invite_token, created_at, budget, simplify, archived_at, photo_path, starts_on, ends_on, group_members(profile_id, role)')),
      ok(c.from('expenses').select('*, expense_payers(profile_id, amount), expense_shares(profile_id, amount)').order('date', { ascending: false }).limit(3000)),
      ok(c.from('comments').select('id, expense_id, profile_id, body, created_at').is('deleted_at', null).order('created_at')),
      ok(c.from('activity').select('*').order('id', { ascending: false }).limit(300)),
      ok(c.from('legal_acceptances').select('version').eq('version', LEGAL_VERSION)),
      ok(c.from('group_items').select('*').order('created_at')),
    ]);
    me = profiles.find(p => p.user_id === user.id)?.id ?? null;
    if (!me) throw new Error('No encontramos tu perfil');
    return {
      me,
      profiles: Object.fromEntries(profiles.map(p => [p.id, { id: p.id, userId: p.user_id, name: p.name, email: p.user_id === user.id ? user.email ?? null : null,
        payout: p.payout, username: p.username, deletedAt: p.deleted_at, fundOf: p.fund_of }])),
      groups: groups.map(toGroup),
      expenses: expenses.map(toExpense),
      comments: comments.map(r => ({ id: r.id, expenseId: r.expense_id, profileId: r.profile_id, body: r.body, createdAt: r.created_at })),
      activity: activity.map((r): Activity => ({ id: String(r.id), groupId: r.group_id, actor: r.actor, verb: r.verb, expenseId: r.expense_id,
        payload: fromJson<Record<string, unknown>>(r.payload) ?? {}, createdAt: r.created_at })),
      items: items.map((r): ListItem => ({ id: r.id, groupId: r.group_id, name: r.name, addedBy: r.added_by, doneBy: r.done_by, doneAt: r.done_at, createdAt: r.created_at })),
      legalOk: legal.length > 0,
    };
  },
  subscribe(onChange) {
    const ch = sb().channel('saldao-cambios');
    for (const table of ['expenses', 'expense_payers', 'expense_shares', 'comments', 'activity', 'group_members', 'groups', 'profiles', 'group_items'])
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    ch.subscribe();
    return () => { sb().removeChannel(ch); };
  },
  async applyOp(op) {
    await sessionUser(); // sin sesión no se envía: la base lo rechazaría y el cambio se perdería
    return ok(sb().rpc('apply_op', { p_op: op.id, p_kind: op.kind, p_args: opArgs(op) }));
  },
  createGroup: (name, kind) => ok(sb().rpc('create_group', { p_name: name, p_kind: kind })),
  addPlaceholder: (groupId, name) => ok(sb().rpc('add_placeholder', { p_group: groupId, p_name: name })),
  addMember: async (groupId, profileId) => { await ok(sb().rpc('add_member', { p_group: groupId, p_profile: profileId })); },
  directGroup: other => ok(sb().rpc('direct_group', { p_other: other })),
  invitePreview: async token => fromJson<InvitePreview | null>(await ok(sb().rpc('invite_preview', { p_token: token }))),
  joinGroup: (token, as) => ok(sb().rpc('join_group', { p_token: token, ...(as ? { p_as: as } : {}) })),
  async updateProfile(p) {
    const { error } = await sb().from('profiles').update({ name: p.name, payout: p.payout || null, username: p.username || null }).eq('id', mine());
    if (error?.code === '23505') throw new Error(TAKEN);
    if (error) throw dbError(error);
  },
  acceptLegal: async () => { await ok(sb().rpc('accept_legal', { p_version: LEGAL_VERSION })); },
  async deleteAccount(confirm) {
    await ok(sb().rpc('delete_account', { p_confirm: confirm }));
    conf().onAccountDeleted?.();
    // la cuenta ya no existe: la sesión se cierra en este teléfono (el servidor ya no la reconoce)
    await sb().auth.signOut({ scope: 'local' });
  },
  async signOut() { await sb().auth.signOut(); },
  // ── grupos ──
  async updateGroup(groupId, x) {
    const p: Record<string, unknown> = {};
    if (x.name !== undefined) p.name = x.name;
    if (x.budget !== undefined) p.budget = x.budget;
    if (x.simplify !== undefined) p.simplify = x.simplify;
    if (x.photoPath !== undefined) p.photo_path = x.photoPath;
    if (x.archived !== undefined) p.archived = x.archived;
    if (x.startsOn !== undefined) p.starts_on = x.startsOn;
    if (x.endsOn !== undefined) p.ends_on = x.endsOn;
    await ok(sb().rpc('update_group', { p_group: groupId, p: toJson(p) }));
  },
  setMemberRole: async (groupId, profileId, role) => { await ok(sb().rpc('set_member_role', { p_group: groupId, p_profile: profileId, p_role: role })); },
  leaveGroup: async groupId => { await ok(sb().rpc('leave_group', { p_group: groupId })); },
  removeMember: async (groupId, profileId) => { await ok(sb().rpc('remove_member', { p_group: groupId, p_profile: profileId })); },
  renamePlaceholder: async (groupId, profileId, name) => { await ok(sb().rpc('rename_placeholder', { p_group: groupId, p_profile: profileId, p_name: name })); },
  createFund: groupId => ok(sb().rpc('create_fund', { p_group: groupId })),
  catchUpRecurring: () => ok(sb().rpc('catch_up_recurring')),
  // ── lista de compras ──
  addItem: (groupId, name) => ok(sb().rpc('add_item', { p_group: groupId, p_name: name })),
  toggleItem: async id => { await ok(sb().rpc('toggle_item', { p_id: id })); },
  deleteItem: async id => { await ok(sb().rpc('delete_item', { p_id: id })); },
  // ── fotos: almacenamiento privado, se ven con una dirección firmada por un rato ──
  async uploadPhoto(path, file) {
    const { error } = await sb().storage.from('adjuntos').upload(path, file.data, { contentType: file.type, upsert: true });
    if (error) throw new Error(/size|large/i.test(error.message) ? 'La foto pesa más de 2 MB.' : 'No se pudo subir la foto. Revisa tu conexión.');
  },
  async photoUrl(path) {
    const { data, error } = await sb().storage.from('adjuntos').createSignedUrl(path, 3600);
    if (error || !data) throw new Error('No se pudo abrir la foto');
    return data.signedUrl;
  },
  // sin foto: null (la base la quita); los tipos de la base no saben que el texto puede faltar
  setExpensePhoto: async (expenseId, path) => { await ok(sb().rpc('set_expense_photo', { p_id: expenseId, p_path: path as string })); },
  // ── avisos y recibos ──
  savePushToken: async (kind, token) => { await ok(sb().rpc('save_push_token', { p_kind: kind, p_token: token })); },
  deletePushToken: async token => { await ok(sb().rpc('delete_push_token', { p_token: token })); },
  async scanReceipt(image, mime) {
    await sessionUser();
    const { data, error } = await sb().functions.invoke<ScanResult & { error?: string }>('leer-recibo', { body: { image, mime } });
    if (error) {
      const msg = await (error as { context?: Response }).context?.json?.().then((j: { error?: string }) => j?.error, () => null).catch(() => null);
      throw new Error(msg || 'No se pudo leer el recibo. Prueba con una foto más clara o anótalo a mano.');
    }
    if (!data || data.error) throw new Error(data?.error || 'No se pudo leer el recibo.');
    return data;
  },
};
