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
    -- el almacenamiento de archivos y la clave de servicio, como en Supabase
    create role service_role;
    grant usage on schema public to service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text,
      owner uuid default auth.uid(), created_at timestamptz default now(), metadata jsonb);
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant all on storage.objects to authenticated;
    grant execute on function storage.foldername(text) to authenticated;
    -- como en Supabase: cada tabla y función nueva de public queda abierta a anon y authenticated (la migración de
    -- seguridad lo cierra; las pruebas revisan que lo cierre de verdad)
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  await db.exec(sql);
  return db;
}
