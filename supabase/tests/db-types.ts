// Escribe los tipos de la base para supabase-js a partir de la base ya migrada (el mismo formato que
// `supabase gen types typescript`), pero solo con lo que la app puede usar con su sesión:
// - tablas y columnas que `authenticated` puede leer (el correo de profiles no aparece);
// - Insert y Update solo con las columnas que puede escribir (`never` si no puede escribir nada);
// - funciones que `anon` o `authenticated` pueden llamar (las internas y los triggers no aparecen);
// - las columnas de texto con `check (x in ('a', 'b'))` llevan esos valores como tipo ('a' | 'b').
// Así, usar algo cerrado en la base es un error al compilar, no al probar en el teléfono.
import type { PGlite } from '@electric-sql/pglite';

const TS: Record<string, string> = {
  uuid: 'string', text: 'string', varchar: 'string', bpchar: 'string', citext: 'string', name: 'string', inet: 'string', bytea: 'string',
  date: 'string', time: 'string', timetz: 'string', timestamp: 'string', timestamptz: 'string', interval: 'string',
  int2: 'number', int4: 'number', int8: 'number', float4: 'number', float8: 'number', numeric: 'number',
  bool: 'boolean', json: 'Json', jsonb: 'Json', void: 'undefined',
};
const ts = (type: string, elem: string | null) => (elem ? `${TS[elem] ?? 'unknown'}[]` : TS[type] ?? 'unknown');

interface Col {
  table: string; col: string; type: string; elem: string | null; nullable: boolean; has_default: boolean; identity_always: boolean;
  can_select: boolean; can_insert: boolean; can_update: boolean;
}
interface Rel { conname: string; table: string; cols: string[]; ref_table: string; ref_cols: string[]; one_to_one: boolean }
interface Fn { name: string; arg_names: string[] | null; arg_types: string[] | null; arg_elems: (string | null)[] | null; n_defaults: number; ret: string; ret_elem: string | null; setof: boolean }

const obj = (fields: string[], indent: string) => (fields.length ? `{\n${fields.map(f => `${indent}  ${f}`).join('\n')}\n${indent}}` : '{ [_ in never]: never }');

export async function dbTypes(db: PGlite): Promise<string> {
  const cols = (await db.query<Col>(`
    select c.relname as table, a.attname as col, t.typname::text as type, et.typname::text as elem, not a.attnotnull as nullable,
      (a.atthasdef or a.attidentity <> '' or a.attgenerated <> '') as has_default, a.attidentity = 'a' as identity_always,
      has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT') as can_select,
      has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT') as can_insert,
      has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE') as can_update
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    join pg_type t on t.oid = a.atttypid left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname, a.attname`)).rows;

  const rels = (await db.query<Rel>(`
    select con.conname, cl.relname as table, array_agg(att.attname order by k.ord) as cols, rcl.relname as ref_table,
      array_agg(ratt.attname order by k.ord) as ref_cols,
      exists (select 1 from pg_index i where i.indrelid = con.conrelid and i.indisunique
              and i.indkey::int2[] @> con.conkey and i.indkey::int2[] <@ con.conkey) as one_to_one
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
    join pg_class rcl on rcl.oid = con.confrelid join pg_namespace rn on rn.oid = rcl.relnamespace
    cross join lateral unnest(con.conkey, con.confkey) with ordinality as k(attnum, refnum, ord)
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
    join pg_attribute ratt on ratt.attrelid = con.confrelid and ratt.attnum = k.refnum
    where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
    group by con.oid, con.conname, cl.relname, rcl.relname, con.conrelid, con.conkey
    order by cl.relname, con.conname`)).rows;

  const fns = (await db.query<Fn>(`
    select p.proname as name, p.proargnames as arg_names,
      (select array_agg(t2.typname::text order by a.ord) from unnest(p.proargtypes::oid[]) with ordinality a(oid, ord) join pg_type t2 on t2.oid = a.oid) as arg_types,
      (select array_agg(coalesce(e2.typname::text, '') order by a.ord) from unnest(p.proargtypes::oid[]) with ordinality a(oid, ord) join pg_type t2 on t2.oid = a.oid
         left join pg_type e2 on e2.oid = t2.typelem and t2.typcategory = 'A') as arg_elems,
      p.pronargdefaults as n_defaults, t.typname::text as ret, et.typname::text as ret_elem, p.proretset as setof
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
    where n.nspname = 'public' and p.prokind = 'f' and t.typname not in ('trigger', 'event_trigger')
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
    order by p.proname, pg_get_function_identity_arguments(p.oid)`)).rows;

  // check (x = any (array['a'::text, 'b'::text])) de una sola columna → 'a' | 'b'
  const checks = (await db.query<{ table: string; col: string; def: string }>(`
    select cl.relname as table, a.attname as col, pg_get_constraintdef(con.oid) as def
    from pg_constraint con join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'c' and n.nspname = 'public' and array_length(con.conkey, 1) = 1`)).rows;
  const literal = new Map<string, string>();
  for (const c of checks) {
    const m = c.def.match(/^CHECK \(\((\w+) = ANY \(ARRAY\[((?:'[^']*'::text(?:, )?)+)\]\)\)\)$/);
    if (m && m[1] === c.col) literal.set(`${c.table}.${c.col}`, [...m[2].matchAll(/'([^']*)'::text/g)].map(x => JSON.stringify(x[1])).join(' | '));
  }
  const colTs = (c: Col) => literal.get(`${c.table}.${c.col}`) ?? ts(c.type, c.elem);

  const byTable = new Map<string, Col[]>();
  for (const c of cols) byTable.set(c.table, [...(byTable.get(c.table) ?? []), c]);
  const visible = [...byTable.keys()].filter(t => byTable.get(t)!.some(c => c.can_select)).sort();

  const I = '      '; // sangría dentro de Tables
  const tables = visible.map(t => {
    const cs = byTable.get(t)!;
    const t_ = (c: Col) => `${colTs(c)}${c.nullable ? ' | null' : ''}`;
    const row = cs.filter(c => c.can_select).map(c => `${c.col}: ${t_(c)}`);
    const ins = cs.filter(c => c.can_insert).map(c => c.identity_always ? `${c.col}?: never` : `${c.col}${c.nullable || c.has_default ? '?' : ''}: ${t_(c)}`);
    const upd = cs.filter(c => c.can_update).map(c => c.identity_always ? `${c.col}?: never` : `${c.col}?: ${t_(c)}`);
    const rs = rels.filter(r => r.table === t && visible.includes(r.ref_table)).map(r => [
      '{',
      `  foreignKeyName: ${JSON.stringify(r.conname)}`,
      `  columns: ${JSON.stringify(r.cols)}`,
      `  isOneToOne: ${r.one_to_one}`,
      `  referencedRelation: ${JSON.stringify(r.ref_table)}`,
      `  referencedColumns: ${JSON.stringify(r.ref_cols)}`,
      '},'].map(l => `${I}    ${l}`).join('\n'));
    return [
      `${I}${t}: {`,
      `${I}  Row: ${obj(row, I + '  ')}`,
      `${I}  Insert: ${ins.length ? obj(ins, I + '  ') : 'never'}`,
      `${I}  Update: ${upd.length ? obj(upd, I + '  ') : 'never'}`,
      `${I}  Relationships: ${rs.length ? `[\n${rs.join('\n')}\n${I}  ]` : '[]'}`,
      `${I}}`,
    ].join('\n');
  });

  const byFn = new Map<string, string[]>();
  for (const f of fns) {
    const names = f.arg_names ?? [], types = f.arg_types ?? [], elems = f.arg_elems ?? [];
    const firstDefault = types.length - f.n_defaults;
    const args = types.map((ty, i) => `${names[i]}${i >= firstDefault ? '?' : ''}: ${ts(ty, elems[i] || null)}`)
      .sort((a, b) => a.localeCompare(b));
    const ret = ts(f.ret, f.ret_elem) + (f.setof ? '[]' : '');
    const sig = [`{`, `  Args: ${args.length ? obj(args, I + '  ') : 'Record<PropertyKey, never>'}`, `  Returns: ${ret}`, `}`];
    byFn.set(f.name, [...(byFn.get(f.name) ?? []), sig.map((l, i) => (i ? I + l : l)).join('\n')]);
  }
  const functions = [...byFn.keys()].sort().map(name => `${I}${name}: ${byFn.get(name)!.join(`\n${I}  | `)}`);

  return `// Generado desde supabase/migrations con \`npm run db:types\`: no se edita a mano (las pruebas fallan si no coincide).
// Solo trae lo que la app puede usar con su sesión: lo cerrado en la base no existe aquí.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
${tables.join('\n')}
    }
    Views: { [_ in never]: never }
    Functions: {
${functions.join('\n')}
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
};

type Public = Database['public'];
export type Tables<T extends keyof Public['Tables']> = Public['Tables'][T]['Row'];
export type Rpc<F extends keyof Public['Functions']> = Public['Functions'][F];
`;
}
