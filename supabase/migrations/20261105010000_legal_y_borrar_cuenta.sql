-- Saldao · términos, privacidad y borrar la cuenta (lo que piden las tiendas de apps)
-- 1. Qué versión de los términos y la privacidad aceptó cada cuenta, cuándo y desde qué navegador. Al registrarse con
--    correo se guarda sola (va en los datos del registro); con Google, o si cambia la versión, la app la pide al entrar.
-- 2. Borrar la cuenta desde la app: se va el acceso y lo personal; el nombre se queda en los gastos compartidos porque
--    también son las cuentas de las otras personas. Un grupo que se queda sin nadie con cuenta se borra completo.
-- (El correo de cada perfil se cierra en la migración siguiente, cuando la app ya no lo pida.)

-- ── 1. aceptación ────────────────────────────────────────────
-- La versión vigente: la misma de src/lib/legal.ts (LEGAL_VERSION) y de las páginas. Las pruebas revisan que coincidan.
create function private.legal_version() returns text
language sql immutable set search_path = '' as $$ select '2026-11-05' $$;
revoke execute on function private.legal_version() from public, anon, authenticated;

create table public.legal_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_at timestamptz not null default now(),
  user_agent text check (length(user_agent) <= 300),
  primary key (user_id, version)
);
alter table public.legal_acceptances enable row level security;
create policy "ver lo que acepté" on public.legal_acceptances for select to authenticated using (user_id = auth.uid());
grant select on public.legal_acceptances to authenticated;

create function public.accept_legal(p_version text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_me();
  if p_version is distinct from private.legal_version() then
    raise exception 'Hay una versión más nueva de los términos. Vuelve a abrir la app para leerla.' using errcode = 'P0001';
  end if;
  insert into public.legal_acceptances (user_id, version, user_agent)
  values (auth.uid(), p_version, left(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'user-agent', 300))
  on conflict do nothing;
end $$;

-- El registro con correo trae la versión que aceptó (options.data.legal). Además del usuario, como antes.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text := lower(trim(new.raw_user_meta_data ->> 'username'));
begin
  if u !~ '^[a-z0-9._]{3,20}$' or exists (select 1 from public.profiles where username = u) then u := null; end if;
  insert into public.profiles (user_id, name, email, username)
  values (new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(new.email, '@', 1), ''), 'Yo'), 80),
    new.email, u);
  if new.raw_user_meta_data ->> 'legal' = private.legal_version() then
    insert into public.legal_acceptances (user_id, version) values (new.id, private.legal_version()) on conflict do nothing;
  end if;
  return new;
end $$;

-- ── 2. borrar la cuenta ──────────────────────────────────────
alter table public.profiles add column deleted_at timestamptz;

create function public.delete_account(p_confirm text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); uid uuid := auth.uid(); u text;
begin
  if p_confirm is distinct from 'BORRAR' then raise exception 'Escribe BORRAR para confirmar.' using errcode = 'P0001'; end if;
  select username into u from public.profiles where id = me;
  delete from public.login_attempts where username = u;
  delete from private.rate_limits where key like '%:' || me::text;
  -- Grupos donde ya no quedaría nadie con cuenta: nadie más los ve, se borran completos (con sus gastos).
  delete from public.groups g
  where exists (select 1 from public.group_members where group_id = g.id and profile_id = me)
    and not exists (select 1 from public.group_members gm join public.profiles p on p.id = gm.profile_id
                    where gm.group_id = g.id and p.id <> me and p.user_id is not null);
  -- Lo personal se va; el nombre se queda en lo compartido.
  update public.profiles set user_id = null, email = null, username = null, payout = null, avatar_url = null, deleted_at = now()
  where id = me;
  -- Si ya no está en ningún grupo, el perfil tampoco hace falta; tampoco las personas sin cuenta que agregó y que se
  -- quedaron sin grupo.
  begin
    delete from public.profiles p where p.created_by = me and p.user_id is null and p.id <> me
      and not exists (select 1 from public.group_members where profile_id = p.id);
    delete from public.profiles where id = me and not exists (select 1 from public.group_members where profile_id = me);
  exception when foreign_key_violation then null; -- algo suyo sigue en un grupo: se queda con su nombre
  end;
  delete from auth.users where id = uid;
end $$;

-- Un perfil de cuenta borrada no se puede reclamar con el enlace de invitación (no es una persona «sin cuenta todavía»).
create or replace function public.invite_preview(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text := 'invitacion:' || public.require_me(); r jsonb;
begin
  if private.rate_blocked(k, 20, interval '1 hour') then
    raise exception 'Probaste demasiados enlaces. Espera una hora o pide el enlace otra vez.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  select jsonb_build_object('id', g.id, 'name', g.name, 'kind', g.kind,
    'members', (select count(*) from public.group_members where group_id = g.id),
    'placeholders', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
       from public.group_members gm join public.profiles p on p.id = gm.profile_id
       where gm.group_id = g.id and p.user_id is null and p.deleted_at is null), '[]'))
  into r from public.groups g where g.invite_token = p_token and g.archived_at is null and g.kind <> 'directo';
  if r is null then perform private.rate_take(k, 20, interval '1 hour'); end if;
  return r;
end $$;

create or replace function public.join_group(p_token uuid, p_as uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); g uuid;
begin
  select id into g from public.groups where invite_token = p_token and archived_at is null and kind <> 'directo';
  if g is null then raise exception 'La invitación no es válida o expiró' using errcode = '22023'; end if;
  if p_as is not null then
    if not exists (select 1 from public.group_members gm join public.profiles p on p.id = gm.profile_id
                   where gm.group_id = g and p.id = p_as and p.user_id is null and p.deleted_at is null) then
      raise exception 'Ese lugar ya lo reclamó alguien' using errcode = '22023';
    end if;
    perform public.merge_profiles(p_as, me);
  end if;
  insert into public.group_members (group_id, profile_id) values (g, me) on conflict do nothing;
  insert into public.activity (group_id, actor, verb) values (g, me, 'se_unio');
  return g;
end $$;

-- ── permisos de las funciones nuevas ─────────────────────────
revoke execute on function public.accept_legal(text), public.delete_account(text) from public, anon;
grant execute on function public.accept_legal(text), public.delete_account(text) to authenticated;
