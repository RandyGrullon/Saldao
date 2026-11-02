-- Saldao · esquema inicial
-- Montos en centavos (bigint). Las escrituras de gastos van por funciones que validan que todo cuadre;
-- las tablas solo se leen con RLS. Cada persona es un `profile`: con cuenta (user_id) o "marcador" (sin cuenta todavía).

-- ── tablas ────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 80),
  email text check (length(email) <= 254),
  avatar_url text,
  default_currency text not null default 'DOP' check (default_currency ~ '^[A-Z]{3}$'),
  payout text check (length(payout) <= 200), -- "Banco Popular · ahorro · 7734": lo ven sus grupos para pagarle
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  kind text not null default 'otro' check (kind in ('casa', 'viaje', 'pareja', 'otro', 'directo')), -- directo: gastos entre dos sin grupo
  currency text not null default 'DOP' check (currency ~ '^[A-Z]{3}$'),
  invite_token uuid not null unique default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'miembro' check (role in ('admin', 'miembro')),
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index group_members_profile_idx on public.group_members (profile_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 120),
  category text not null default 'general' check (length(category) <= 40),
  date date not null default current_date,
  currency text not null default 'DOP' check (currency ~ '^[A-Z]{3}$'),
  amount bigint not null check (amount > 0 and amount < 100000000000),
  fx_rate numeric(14, 6) not null default 1 check (fx_rate > 0), -- moneda del grupo por 1 de esta moneda, del día del gasto
  is_payment boolean not null default false,
  payment_status text check (payment_status in ('pendiente', 'confirmado')),
  split_mode text not null default 'equal' check (split_mode in ('equal', 'exact', 'percent', 'shares', 'adjust', 'items', 'payment')),
  split_params jsonb not null default '{}',
  items jsonb,                -- [{name, price, to: [profile_id]}]
  tax numeric(5, 2) not null default 0 check (tax between 0 and 100),
  tip numeric(5, 2) not null default 0 check (tip between 0 and 100),
  note text check (length(note) <= 1000),
  repeat text check (repeat in ('semanal', 'quincenal', 'mensual', 'anual')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz,
  deleted_by uuid references public.profiles(id),
  deleted_at timestamptz
);
create index expenses_group_date_idx on public.expenses (group_id, date desc);

create table public.expense_payers (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  amount bigint not null check (amount > 0),
  primary key (expense_id, profile_id)
);
create table public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  amount bigint not null check (amount > 0),
  primary key (expense_id, profile_id)
);
create index expense_payers_profile_idx on public.expense_payers (profile_id);
create index expense_shares_profile_idx on public.expense_shares (profile_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index comments_expense_idx on public.comments (expense_id);

create table public.activity (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  actor uuid not null references public.profiles(id),
  verb text not null check (verb in ('grupo_creado', 'miembro_agregado', 'se_unio', 'gasto_creado', 'gasto_editado',
    'gasto_borrado', 'gasto_restaurado', 'pago_registrado', 'pago_confirmado', 'comentario')),
  expense_id uuid references public.expenses(id) on delete cascade,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index activity_group_idx on public.activity (group_id, created_at desc);

-- ── quién soy y a qué pertenezco ─────────────────────────────
create function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where user_id = auth.uid()
$$;

create function public.is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and profile_id = public.current_profile_id())
$$;

create function public.is_admin(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and profile_id = public.current_profile_id() and role = 'admin')
$$;

create function public.shares_group(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
    where a.profile_id = p and b.profile_id = public.current_profile_id())
$$;

-- ── RLS: solo lectura para lo tuyo y lo de tus grupos ─────────
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payers enable row level security;
alter table public.expense_shares enable row level security;
alter table public.comments enable row level security;
alter table public.activity enable row level security;

create policy "ver mi perfil y el de mis grupos" on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.shares_group(id));
create policy "editar mi perfil" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ver mis grupos" on public.groups for select to authenticated using (public.is_member(id));
create policy "admin edita el grupo" on public.groups for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));
create policy "ver miembros de mis grupos" on public.group_members for select to authenticated using (public.is_member(group_id));
create policy "ver gastos de mis grupos" on public.expenses for select to authenticated using (public.is_member(group_id));
create policy "ver quién pagó" on public.expense_payers for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_member(e.group_id)));
create policy "ver partes" on public.expense_shares for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_member(e.group_id)));
create policy "ver comentarios" on public.comments for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_member(e.group_id)));
create policy "comentar en mis grupos" on public.comments for insert to authenticated
  with check (profile_id = public.current_profile_id()
    and exists (select 1 from public.expenses e where e.id = expense_id and public.is_member(e.group_id)));
create policy "borrar mi comentario" on public.comments for update to authenticated
  using (profile_id = public.current_profile_id()) with check (profile_id = public.current_profile_id());
create policy "ver actividad de mis grupos" on public.activity for select to authenticated using (public.is_member(group_id));

-- ── perfil automático al registrarse ─────────────────────────
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, name, email)
  values (new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(new.email, '@', 1), ''), 'Yo'), 80),
    new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ── actividad de comentarios ─────────────────────────────────
create function public.log_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity (group_id, actor, verb, expense_id, payload)
  select e.group_id, new.profile_id, 'comentario', new.expense_id, jsonb_build_object('texto', left(new.body, 140))
  from public.expenses e where e.id = new.expense_id;
  return new;
end $$;
create trigger on_comment_created after insert on public.comments for each row execute function public.log_comment();

-- ── funciones de escritura ───────────────────────────────────
create function public.require_me() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.current_profile_id();
begin
  if me is null then raise exception 'Necesitas iniciar sesión' using errcode = '28000'; end if;
  return me;
end $$;

create function public.create_group(p_name text, p_kind text default 'otro', p_currency text default 'DOP') returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); g uuid;
begin
  insert into public.groups (name, kind, currency, created_by) values (trim(p_name), p_kind, p_currency, me) returning id into g;
  insert into public.group_members (group_id, profile_id, role) values (g, me, 'admin');
  insert into public.activity (group_id, actor, verb) values (g, me, 'grupo_creado');
  return g;
end $$;

-- Alguien que todavía no tiene cuenta: se le puede cargar gastos y luego reclama su lugar al unirse.
create function public.add_placeholder(p_group uuid, p_name text, p_email text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); p uuid;
begin
  if not public.is_member(p_group) then raise exception 'No perteneces a ese grupo' using errcode = '42501'; end if;
  insert into public.profiles (name, email, created_by) values (trim(p_name), nullif(trim(p_email), ''), me) returning id into p;
  insert into public.group_members (group_id, profile_id) values (p_group, p);
  insert into public.activity (group_id, actor, verb, payload) values (p_group, me, 'miembro_agregado', jsonb_build_object('nombre', trim(p_name)));
  return p;
end $$;

-- Agregar a un grupo a alguien con quien ya compartes otro grupo.
create function public.add_member(p_group uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); who text;
begin
  if not public.is_member(p_group) then raise exception 'No perteneces a ese grupo' using errcode = '42501'; end if;
  if not public.shares_group(p_profile) then raise exception 'Solo puedes agregar personas de tus otros grupos' using errcode = '42501'; end if;
  if exists (select 1 from public.groups where id = p_group and kind = 'directo') then raise exception 'Ese grupo es solo de dos' using errcode = '22023'; end if;
  insert into public.group_members (group_id, profile_id) values (p_group, p_profile) on conflict do nothing;
  if found then
    select name into who from public.profiles where id = p_profile;
    insert into public.activity (group_id, actor, verb, payload) values (p_group, me, 'miembro_agregado', jsonb_build_object('nombre', who));
  end if;
end $$;

-- Gastos entre dos personas sin grupo: viven en un grupo oculto de tipo "directo".
create function public.direct_group(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); g uuid; other_name text;
begin
  if p_other = me or not public.shares_group(p_other) then raise exception 'Solo con personas de tus grupos' using errcode = '42501'; end if;
  select gm.group_id into g from public.group_members gm join public.groups gr on gr.id = gm.group_id
  where gr.kind = 'directo' and gm.profile_id = me
    and exists (select 1 from public.group_members o where o.group_id = gm.group_id and o.profile_id = p_other)
  limit 1;
  if g is null then
    select name into other_name from public.profiles where id = p_other;
    insert into public.groups (name, kind, created_by) values (left('Tú y ' || other_name, 60), 'directo', me) returning id into g;
    insert into public.group_members (group_id, profile_id, role) values (g, me, 'admin'), (g, p_other, 'admin');
  end if;
  return g;
end $$;

-- Pasa todo lo de un marcador a una cuenta real (al reclamar su lugar).
create function public.merge_profiles(p_from uuid, p_into uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.expense_payers (expense_id, profile_id, amount) select expense_id, p_into, amount from public.expense_payers where profile_id = p_from
    on conflict (expense_id, profile_id) do update set amount = public.expense_payers.amount + excluded.amount;
  delete from public.expense_payers where profile_id = p_from;
  insert into public.expense_shares (expense_id, profile_id, amount) select expense_id, p_into, amount from public.expense_shares where profile_id = p_from
    on conflict (expense_id, profile_id) do update set amount = public.expense_shares.amount + excluded.amount;
  delete from public.expense_shares where profile_id = p_from;
  insert into public.group_members (group_id, profile_id, role, joined_at) select group_id, p_into, role, joined_at from public.group_members where profile_id = p_from
    on conflict do nothing;
  delete from public.group_members where profile_id = p_from;
  update public.comments set profile_id = p_into where profile_id = p_from;
  update public.activity set actor = p_into where actor = p_from;
  update public.expenses set created_by = p_into where created_by = p_from;
  update public.expenses set updated_by = p_into where updated_by = p_from;
  update public.expenses set deleted_by = p_into where deleted_by = p_from;
  update public.groups set created_by = p_into where created_by = p_from;
  update public.profiles set created_by = p_into where created_by = p_from;
  delete from public.profiles where id = p_from;
end $$;
revoke all on function public.merge_profiles(uuid, uuid) from public;

-- Datos públicos de una invitación (para mostrar el grupo antes de unirse).
create function public.invite_preview(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'name', g.name, 'kind', g.kind,
    'members', (select count(*) from public.group_members where group_id = g.id),
    'placeholders', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
       from public.group_members gm join public.profiles p on p.id = gm.profile_id where gm.group_id = g.id and p.user_id is null), '[]'))
  from public.groups g where g.invite_token = p_token and g.archived_at is null and g.kind <> 'directo'
$$;

create function public.join_group(p_token uuid, p_as uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); g uuid;
begin
  select id into g from public.groups where invite_token = p_token and archived_at is null and kind <> 'directo';
  if g is null then raise exception 'La invitación no es válida o expiró' using errcode = '22023'; end if;
  if p_as is not null then
    if not exists (select 1 from public.group_members gm join public.profiles p on p.id = gm.profile_id
                   where gm.group_id = g and p.id = p_as and p.user_id is null) then
      raise exception 'Ese lugar ya lo reclamó alguien' using errcode = '22023';
    end if;
    perform public.merge_profiles(p_as, me);
  end if;
  insert into public.group_members (group_id, profile_id) values (g, me) on conflict do nothing;
  insert into public.activity (group_id, actor, verb) values (g, me, 'se_unio');
  return g;
end $$;

-- Puede editar o borrar: quien lo creó, quien participa o un admin del grupo.
create function public.can_edit(p_expense uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.expenses e where e.id = p_expense and public.is_member(e.group_id) and (
    e.created_by = public.current_profile_id() or public.is_admin(e.group_id)
    or exists (select 1 from public.expense_payers where expense_id = e.id and profile_id = public.current_profile_id())
    or exists (select 1 from public.expense_shares where expense_id = e.id and profile_id = public.current_profile_id())))
$$;

-- Crea o edita un gasto o un pago. Valida que pagadores y partes sumen el monto y sean del grupo.
create function public.save_expense(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.require_me();
  g uuid := (p ->> 'group_id')::uuid;
  e_id uuid := nullif(p ->> 'id', '')::uuid;
  amt bigint := (p ->> 'amount')::bigint;
  paid bigint; owed bigint; outsiders int;
  is_pay boolean := coalesce((p ->> 'is_payment')::boolean, false);
  status text;
  old public.expenses;
begin
  if not public.is_member(g) then raise exception 'No perteneces a ese grupo' using errcode = '42501'; end if;
  if jsonb_typeof(p -> 'payers') <> 'object' or jsonb_typeof(p -> 'shares') <> 'object' then
    raise exception 'Faltan pagadores o partes' using errcode = '22023';
  end if;
  select coalesce(sum(value::bigint), 0) into paid from jsonb_each_text(p -> 'payers');
  select coalesce(sum(value::bigint), 0) into owed from jsonb_each_text(p -> 'shares');
  if amt is null or amt <= 0 or paid <> amt or owed <> amt then
    raise exception 'No cuadra: monto %, pagado %, repartido %', amt, paid, owed using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each_text(p -> 'payers') where value::bigint <= 0)
     or exists (select 1 from jsonb_each_text(p -> 'shares') where value::bigint < 0) then
    raise exception 'Montos inválidos' using errcode = '22023';
  end if;
  select count(*) into outsiders from (
    select key from jsonb_each_text(p -> 'payers') union select key from jsonb_each_text(p -> 'shares')) k
  where not exists (select 1 from public.group_members where group_id = g and profile_id = k.key::uuid);
  if outsiders > 0 then raise exception 'Hay personas que no son del grupo' using errcode = '22023'; end if;

  -- un pago lo confirma quien lo recibe; si lo registra quien recibe, ya está confirmado
  if is_pay then status := case when (p -> 'shares') ? me::text then 'confirmado' else 'pendiente' end; end if;

  if e_id is null then
    insert into public.expenses (group_id, description, category, date, currency, amount, fx_rate, is_payment, payment_status,
      split_mode, split_params, items, tax, tip, note, repeat, created_by)
    values (g, trim(coalesce(p ->> 'description', 'Pago')), coalesce(p ->> 'category', 'general'), coalesce((p ->> 'date')::date, current_date),
      coalesce(p ->> 'currency', 'DOP'), amt, coalesce((p ->> 'fx_rate')::numeric, 1), is_pay, status,
      coalesce(p ->> 'split_mode', 'exact'), coalesce(p -> 'split_params', '{}'), p -> 'items',
      coalesce((p ->> 'tax')::numeric, 0), coalesce((p ->> 'tip')::numeric, 0), nullif(trim(p ->> 'note'), ''), nullif(p ->> 'repeat', ''), me)
    returning id into e_id;
    insert into public.activity (group_id, actor, verb, expense_id, payload)
    values (g, me, case when is_pay then 'pago_registrado' else 'gasto_creado' end, e_id,
      jsonb_build_object('descripcion', p ->> 'description', 'monto', amt, 'moneda', coalesce(p ->> 'currency', 'DOP')));
  else
    select * into old from public.expenses where id = e_id and group_id = g and deleted_at is null;
    if old.id is null or not public.can_edit(e_id) then raise exception 'No puedes editar ese gasto' using errcode = '42501'; end if;
    update public.expenses set description = trim(p ->> 'description'), category = coalesce(p ->> 'category', category),
      date = coalesce((p ->> 'date')::date, date), currency = coalesce(p ->> 'currency', currency), amount = amt,
      fx_rate = coalesce((p ->> 'fx_rate')::numeric, fx_rate), split_mode = coalesce(p ->> 'split_mode', split_mode),
      split_params = coalesce(p -> 'split_params', split_params), items = p -> 'items', tax = coalesce((p ->> 'tax')::numeric, tax),
      tip = coalesce((p ->> 'tip')::numeric, tip), note = nullif(trim(p ->> 'note'), ''), repeat = nullif(p ->> 'repeat', ''),
      updated_by = me, updated_at = now()
    where id = e_id;
    delete from public.expense_payers where expense_id = e_id;
    delete from public.expense_shares where expense_id = e_id;
    insert into public.activity (group_id, actor, verb, expense_id, payload)
    values (g, me, 'gasto_editado', e_id, jsonb_build_object(
      'antes', jsonb_build_object('descripcion', old.description, 'monto', old.amount, 'moneda', old.currency, 'fecha', old.date),
      'despues', jsonb_build_object('descripcion', p ->> 'description', 'monto', amt, 'moneda', p ->> 'currency', 'fecha', p ->> 'date')));
  end if;

  insert into public.expense_payers (expense_id, profile_id, amount)
    select e_id, key::uuid, value::bigint from jsonb_each_text(p -> 'payers');
  insert into public.expense_shares (expense_id, profile_id, amount)
    select e_id, key::uuid, value::bigint from jsonb_each_text(p -> 'shares') where value::bigint > 0;
  return e_id;
end $$;

create function public.delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); g uuid;
begin
  if not public.can_edit(p_id) then raise exception 'No puedes borrar ese gasto' using errcode = '42501'; end if;
  update public.expenses set deleted_at = now(), deleted_by = me where id = p_id and deleted_at is null returning group_id into g;
  if g is not null then insert into public.activity (group_id, actor, verb, expense_id) values (g, me, 'gasto_borrado', p_id); end if;
end $$;

create function public.restore_expense(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); g uuid;
begin
  if not public.can_edit(p_id) then raise exception 'No puedes restaurar ese gasto' using errcode = '42501'; end if;
  update public.expenses set deleted_at = null, deleted_by = null where id = p_id and deleted_at is not null returning group_id into g;
  if g is not null then insert into public.activity (group_id, actor, verb, expense_id) values (g, me, 'gasto_restaurado', p_id); end if;
end $$;

-- Quien recibió el pago confirma que le llegó.
create function public.confirm_payment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); g uuid;
begin
  update public.expenses e set payment_status = 'confirmado'
  where e.id = p_id and e.is_payment and e.deleted_at is null and e.payment_status = 'pendiente'
    and exists (select 1 from public.expense_shares s where s.expense_id = e.id and s.profile_id = me)
  returning group_id into g;
  if g is null then raise exception 'Solo quien recibe el pago puede confirmarlo' using errcode = '42501'; end if;
  insert into public.activity (group_id, actor, verb, expense_id) values (g, me, 'pago_confirmado', p_id);
end $$;

create function public.regenerate_invite(p_group uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid := gen_random_uuid();
begin
  if not public.is_admin(p_group) then raise exception 'Solo un admin puede cambiar el enlace' using errcode = '42501'; end if;
  update public.groups set invite_token = t where id = p_group;
  return t;
end $$;

-- ── permisos de ejecución: solo usuarios con sesión ──────────
revoke execute on function public.create_group(text, text, text), public.add_placeholder(uuid, text, text), public.add_member(uuid, uuid), public.direct_group(uuid),
  public.join_group(uuid, uuid), public.save_expense(jsonb), public.delete_expense(uuid), public.restore_expense(uuid),
  public.confirm_payment(uuid), public.regenerate_invite(uuid), public.invite_preview(uuid) from public;
grant execute on function public.create_group(text, text, text), public.add_placeholder(uuid, text, text), public.add_member(uuid, uuid), public.direct_group(uuid),
  public.join_group(uuid, uuid), public.save_expense(jsonb), public.delete_expense(uuid), public.restore_expense(uuid),
  public.confirm_payment(uuid), public.regenerate_invite(uuid), public.invite_preview(uuid) to authenticated;

-- ── tiempo real ──────────────────────────────────────────────
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.expenses, public.expense_payers, public.expense_shares,
      public.comments, public.activity, public.group_members, public.groups, public.profiles;
  end if;
end $$;
