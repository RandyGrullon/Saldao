-- Saldao · nombre de usuario para entrar
-- Se entra con correo o con usuario. Para entrar con usuario hace falta el correo de la cuenta, pero no se
-- entrega a cualquiera: login_email solo lo devuelve si la contraseña es la correcta, y bloquea el usuario
-- 15 minutos después de 5 intentos fallidos.

alter table public.profiles add column username text unique check (username ~ '^[a-z0-9._]{3,20}$');

-- El usuario llega en los datos del registro (options.data.username). Si ya lo tomó otra persona, queda vacío
-- y se elige después en Cuenta.
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
  return new;
end $$;

create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(trim(p_username)) ~ '^[a-z0-9._]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(trim(p_username)))
$$;

-- Intentos fallidos por usuario. Sin políticas: nadie la lee por la API.
create table public.login_attempts (
  username text primary key,
  fails int not null default 0,
  last_at timestamptz not null default now()
);
alter table public.login_attempts enable row level security;

create function public.login_email(p_username text, p_password text) returns text
language plpgsql security definer set search_path = public as $$
declare u text := lower(trim(p_username)); e text;
begin
  if not exists (select 1 from public.profiles where username = u) then return null; end if;
  if exists (select 1 from public.login_attempts where username = u and fails >= 5 and last_at > now() - interval '15 minutes') then
    raise exception 'Demasiados intentos con ese usuario. Espera 15 minutos o entra con tu correo.' using errcode = 'P0001';
  end if;
  select au.email into e from auth.users au join public.profiles p on p.user_id = au.id
   where p.username = u and au.encrypted_password <> '' and au.encrypted_password = extensions.crypt(p_password, au.encrypted_password);
  if e is null then
    insert into public.login_attempts as a (username, fails, last_at) values (u, 1, now())
      on conflict (username) do update set fails = case when a.last_at < now() - interval '15 minutes' then 1 else a.fails + 1 end, last_at = now();
  else
    delete from public.login_attempts where username = u;
  end if;
  return e;
end $$;

-- Se llaman antes de tener sesión.
grant execute on function public.username_available(text), public.login_email(text, text) to anon, authenticated;
