// Una base nueva en PGlite (Postgres en WASM) con todas las migraciones aplicadas, en orden, como en Supabase.
// La usan las pruebas de la migración y el generador de tipos.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../migrations/', import.meta.url);
const sql = readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(new URL(f, dir), 'utf8')).join(';\n');

export async function migratedDb(): Promise<PGlite> {
  const db = new PGlite();
  // Lo mínimo de Supabase que las migraciones necesitan: los roles, un "auth" de imitación y los permisos por defecto.
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', encrypted_password text default '');
    -- PGlite no trae pgcrypto: un crypt de imitación que se usa igual (hash = crypt(clave, hash))
    create schema extensions;
    create function extensions.crypt(p text, salt text) returns text language sql immutable as $$ select 'h:' || p $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated;
    grant usage on schema public to anon;
    grant execute on function auth.uid() to authenticated;
    -- como en Supabase: cada tabla y función nueva de public queda abierta a anon y authenticated (la migración de
    -- seguridad lo cierra; las pruebas revisan que lo cierre de verdad)
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  await db.exec(sql);
  return db;
}
