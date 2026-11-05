-- Saldao · seguridad (lo que hace MatchMate y aquí faltaba)
-- 1. Nada abierto por defecto: Supabase le da todos los permisos a anon y authenticated en cada tabla y función nueva
--    de public. Aquí se quitan y se dan solo los que la app usa (las pruebas revisan que la lista sea exacta).
-- 2. Escribir directo en las tablas solo donde la app lo hace, y solo en esas columnas: comentar y editar tu perfil.
--    Todo lo demás pasa por las funciones que validan.
-- 3. Límites de intentos que no se pueden saltar con peticiones en paralelo (contar y frenar es una sola sentencia).
-- 4. Datos limpios: sin caracteres de control en nombres y textos, JSON con tamaño tope y fechas razonables.

-- ── 1. permisos ──────────────────────────────────────────────
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
-- Leer: RLS decide qué filas ve cada quien (también el tiempo real).
grant select on public.profiles, public.groups, public.group_members, public.expenses, public.expense_payers,
  public.expense_shares, public.comments, public.activity to authenticated;
-- ── 2. escribir directo: solo esto ───────────────────────────
grant insert (expense_id, profile_id, body) on public.comments to authenticated;
grant update (body, deleted_at) on public.comments to authenticated;
grant update (name, payout, username) on public.profiles to authenticated; -- ni el correo ni la cuenta dueña
-- Nadie edita grupos por la API (el enlace nuevo va por regenerate_invite).
drop policy if exists "admin edita el grupo" on public.groups;

revoke execute on all functions in schema public from public, anon, authenticated;
-- Las usan las reglas RLS, que corren como quien consulta.
grant execute on function public.current_profile_id(), public.is_member(uuid), public.is_admin(uuid), public.shares_group(uuid),
  public.can_edit(uuid) to authenticated;
-- Lo que la app llama con sesión.
grant execute on function public.create_group(text, text, text), public.add_placeholder(uuid, text, text), public.add_member(uuid, uuid),
  public.direct_group(uuid), public.join_group(uuid, uuid), public.save_expense(jsonb), public.delete_expense(uuid),
  public.restore_expense(uuid), public.confirm_payment(uuid), public.regenerate_invite(uuid), public.invite_preview(uuid) to authenticated;
-- Sin sesión, solo para entrar y registrarse.
grant execute on function public.username_available(text), public.login_email(text, text) to anon, authenticated;

-- ── 3. límites de intentos ───────────────────────────────────
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);

-- Cuenta un intento y dice si cabía. Contar y frenar van en la misma sentencia: dos peticiones a la vez no pasan las dos.
create function private.rate_take(p_key text, p_max int, p_window interval) returns boolean
language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  insert into private.rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start > now() - p_window then r.hits + 1 else 1 end,
    window_start = case when r.window_start > now() - p_window then r.window_start else now() end
  where r.window_start <= now() - p_window or r.hits < p_max
  returning true into ok;
  -- de vez en cuando se borra lo viejo, para que la tabla no crezca
  if random() < 0.01 then delete from private.rate_limits where window_start < now() - interval '2 days'; end if;
  return coalesce(ok, false);
end $$;

-- ¿Ya se pasó? (sin contar). Para los límites que solo cuentan fallos.
create function private.rate_blocked(p_key text, p_max int, p_window interval) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.rate_limits where key = p_key and hits >= p_max and window_start > now() - p_window)
$$;

create function private.throttle(p_key text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.rate_take(p_key, p_max, p_window) then
    raise exception 'Vas muy rápido. Espera un momento y vuelve a intentarlo.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
end $$;

-- La conexión de quien llama sin sesión (Supabase pasa las cabeceras de la petición).
create function private.client_ip() returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(h ->> 'cf-connecting-ip', ''), nullif(h ->> 'x-real-ip', ''),
    nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''), 'sin-ip')
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) x
$$;

-- Ver si un usuario está libre: 120 consultas cada 10 minutos por conexión (escribir uno pide unas pocas).
create or replace function public.username_available(p_username text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform private.throttle('usuario-libre:' || private.client_ip(), 120, interval '10 minutes');
  return lower(trim(p_username)) ~ '^[a-z0-9._]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(trim(p_username)));
end $$;

-- Entrar con usuario: además del bloqueo por usuario (5 fallos), 30 fallos cada 15 minutos por conexión, sumando
-- todos los usuarios: así no se puede probar una contraseña contra muchos usuarios.
create or replace function public.login_email(p_username text, p_password text) returns text
language plpgsql security definer set search_path = public as $$
declare u text := lower(trim(p_username)); e text; ip text := 'entrar-ip:' || private.client_ip();
begin
  if private.rate_blocked(ip, 30, interval '15 minutes') then
    raise exception 'Demasiados intentos desde esta conexión. Espera 15 minutos o entra con tu correo.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if exists (select 1 from public.login_attempts where username = u and fails >= 5 and last_at > now() - interval '15 minutes') then
    raise exception 'Demasiados intentos con ese usuario. Espera 15 minutos o entra con tu correo.' using errcode = 'P0001';
  end if;
  select au.email into e from auth.users au join public.profiles p on p.user_id = au.id
   where p.username = u and au.encrypted_password <> '' and au.encrypted_password = extensions.crypt(p_password, au.encrypted_password);
  if e is null then
    perform private.rate_take(ip, 30, interval '15 minutes');
    if exists (select 1 from public.profiles where username = u) then
      insert into public.login_attempts as a (username, fails, last_at) values (u, 1, now())
        on conflict (username) do update set fails = case when a.last_at < now() - interval '15 minutes' then 1 else a.fails + 1 end, last_at = now();
    end if;
  else
    delete from public.login_attempts where username = u;
  end if;
  return e;
end $$;

-- Ver una invitación: 20 enlaces que no existen por hora y persona (solo cuentan los fallos).
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
       from public.group_members gm join public.profiles p on p.id = gm.profile_id where gm.group_id = g.id and p.user_id is null), '[]'))
  into r from public.groups g where g.invite_token = p_token and g.archived_at is null and g.kind <> 'directo';
  if r is null then perform private.rate_take(k, 20, interval '1 hour'); end if;
  return r;
end $$;

-- Escrituras con tope por persona: gastos y pagos, grupos, personas sin cuenta y comentarios. Generosos para el uso
-- normal; frenan a un script o a un dedo pegado.
create function private.pace_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who uuid := public.current_profile_id();
begin
  if who is null then return new; end if; -- sin sesión (migraciones, el panel de Supabase): sin tope
  case tg_table_name
    when 'expenses' then perform private.throttle('gastos:' || who, 120, interval '10 minutes');
    when 'groups' then perform private.throttle('grupos:' || who, 30, interval '1 day');
    when 'profiles' then perform private.throttle('personas:' || who, 100, interval '1 day');
    when 'comments' then perform private.throttle('comentar:' || who, 60, interval '10 minutes');
  end case;
  return new;
end $$;

create trigger pace before insert on public.expenses for each row execute function private.pace_rows();
create trigger pace before insert on public.groups for each row execute function private.pace_rows();
-- Solo las personas sin cuenta (add_placeholder); los perfiles de quien se registra no llevan tope.
create trigger pace before insert on public.profiles for each row when (new.user_id is null) execute function private.pace_rows();
create trigger pace before insert on public.comments for each row execute function private.pace_rows();

-- ── 4. datos limpios ─────────────────────────────────────────
-- `not valid`: valen para lo nuevo sin revisar lo que ya está guardado (si algo viejo no cumpliera, la migración no falla).
-- Nombres en una línea; textos largos (nota, comentario, dónde te pagan) aceptan saltos de línea y tabulador.
alter table public.profiles add constraint profiles_name_limpio check (name !~ '[[:cntrl:]]') not valid;
alter table public.profiles add constraint profiles_payout_limpio check (payout !~ E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]') not valid;
alter table public.groups add constraint groups_name_limpio check (name !~ '[[:cntrl:]]') not valid;
alter table public.expenses add constraint expenses_description_limpia check (description !~ '[[:cntrl:]]') not valid;
alter table public.expenses add constraint expenses_note_limpia check (note !~ E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]') not valid;
alter table public.expenses add constraint expenses_items_tope
  check (items is null or (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 200 and pg_column_size(items) < 32768)) not valid;
alter table public.expenses add constraint expenses_params_tope
  check (jsonb_typeof(split_params) = 'object' and pg_column_size(split_params) < 8192) not valid;
alter table public.expenses add constraint expenses_fecha_desde check (date >= date '2000-01-01') not valid;
alter table public.comments add constraint comments_body_limpio check (body !~ E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]') not valid;
alter table public.activity add constraint activity_payload_tope check (pg_column_size(payload) < 8192) not valid;

-- Una fecha de más de dos días en el futuro es un error de dedo (el teléfono no deja elegirla; esto frena lo demás).
create function private.expense_date_ok() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.date > current_date + 2 then
    raise exception 'La fecha del gasto no puede ser en el futuro.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger fecha_ok before insert or update of date on public.expenses for each row execute function private.expense_date_ok();

-- Las de private solo las llaman las funciones de arriba (que corren como dueño), nunca la API.
revoke execute on all functions in schema private from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;
