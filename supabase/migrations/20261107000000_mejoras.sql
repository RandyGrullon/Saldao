-- Saldao · lo que la base necesita para las 20 mejoras (docs/MEJORAS.md)
-- 1. Grupos: presupuesto, simplificar deudas, foto, renombrar, archivar, roles y salir.
-- 2. Fondo común: una «persona» del grupo que recibe aportes y paga gastos.
-- 3. Gastos que se repiten: se ponen al día solos al abrir la app.
-- 4. Lista de compras del grupo.
-- 5. Fotos (comprobantes y la del grupo) en el almacenamiento, visibles solo para el grupo.
-- 6. Avisos: los teléfonos y navegadores de cada cuenta.
-- 7. Recibos escaneados: un tope por día.
-- Solo agrega: la app publicada antes de esta migración sigue funcionando igual.

-- ── actividad: lo nuevo que se anota ─────────────────────────
alter table public.activity drop constraint activity_verb_check;
alter table public.activity add constraint activity_verb_check check (verb in ('grupo_creado', 'miembro_agregado', 'se_unio', 'gasto_creado', 'gasto_editado', 'gasto_borrado', 'gasto_restaurado', 'pago_registrado', 'pago_confirmado', 'comentario',
  'grupo_editado', 'salio', 'fondo_creado'));

-- ── 1. grupos ────────────────────────────────────────────────
alter table public.groups
  add column budget bigint check (budget is null or (budget > 0 and budget < 100000000000)),
  add column simplify boolean not null default false,
  add column photo_path text check (photo_path is null or photo_path ~ '^grupos/[0-9a-f-]{36}/[0-9a-z_-]{1,60}\.(jpg|png|webp)$');

-- Cambios del grupo (lo decide un admin): nombre, presupuesto del mes, simplificar deudas, foto y archivarlo.
create function public.update_group(p_group uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me();
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Cambio incompleto' using errcode = '22023'; end if;
  if not public.is_admin(p_group) then raise exception 'Solo un admin puede cambiar el grupo' using errcode = '42501'; end if;
  update public.groups set
    name = case when p ? 'name' then trim(p ->> 'name') else name end,
    budget = case when p ? 'budget' then nullif(p ->> 'budget', '')::bigint else budget end,
    simplify = case when p ? 'simplify' then coalesce((p ->> 'simplify')::boolean, false) else simplify end,
    photo_path = case when p ? 'photo_path' then nullif(p ->> 'photo_path', '') else photo_path end,
    archived_at = case when p ? 'archived' then case when (p ->> 'archived')::boolean then now() else null end else archived_at end
  where id = p_group and kind <> 'directo';
  if not found then raise exception 'Ese grupo no se puede cambiar' using errcode = '22023'; end if;
  insert into public.activity (group_id, actor, verb, payload) values (p_group, me, 'grupo_editado', p - 'photo_path');
end $$;

-- Admin o miembro. Siempre queda al menos un admin.
create function public.set_member_role(p_group uuid, p_profile uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_me();
  if not public.is_admin(p_group) then raise exception 'Solo un admin puede cambiar los roles' using errcode = '42501'; end if;
  if p_role not in ('admin', 'miembro') then raise exception 'Ese rol no existe' using errcode = '22023'; end if;
  if p_role = 'miembro' and not exists (select 1 from public.group_members where group_id = p_group and role = 'admin' and profile_id <> p_profile) then
    raise exception 'El grupo necesita al menos un admin' using errcode = 'P0001';
  end if;
  update public.group_members set role = p_role where group_id = p_group and profile_id = p_profile;
  if not found then raise exception 'Esa persona no está en el grupo' using errcode = '22023'; end if;
end $$;

-- Salir de un grupo: solo con tus cuentas saldadas (lo tuyo ya pagado y lo que te deben, cobrado).
create function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); net numeric;
begin
  if not public.is_member(p_group) then raise exception 'No estás en ese grupo' using errcode = '42501'; end if;
  if exists (select 1 from public.groups where id = p_group and kind = 'directo') then
    raise exception 'De los gastos entre dos no se sale' using errcode = '22023';
  end if;
  select coalesce(sum(x), 0) into net from (
    select round(p.amount * e.fx_rate) as x from public.expense_payers p join public.expenses e on e.id = p.expense_id
    where e.group_id = p_group and e.deleted_at is null and p.profile_id = me
    union all
    select -round(s.amount * e.fx_rate) from public.expense_shares s join public.expenses e on e.id = s.expense_id
    where e.group_id = p_group and e.deleted_at is null and s.profile_id = me) t;
  if abs(net) > 99 then raise exception 'Salda tus cuentas en este grupo antes de salir.' using errcode = 'P0001'; end if;
  insert into public.activity (group_id, actor, verb) values (p_group, me, 'salio');
  delete from public.group_members where group_id = p_group and profile_id = me;
  -- si no queda ningún admin, pasa a serlo quien llegó primero (con cuenta)
  if not exists (select 1 from public.group_members where group_id = p_group and role = 'admin') then
    update public.group_members set role = 'admin' where (group_id, profile_id) = (
      select gm.group_id, gm.profile_id from public.group_members gm join public.profiles pr on pr.id = gm.profile_id
      where gm.group_id = p_group and pr.user_id is not null order by gm.joined_at limit 1);
  end if;
end $$;

-- ── 2. fondo común ───────────────────────────────────────────
-- Una «persona» del grupo sin cuenta: los aportes son pagos al fondo y los gastos del fondo los paga ella.
alter table public.profiles add column fund_of uuid references public.groups(id) on delete cascade;
create unique index profiles_fondo_unico on public.profiles (fund_of) where fund_of is not null;
grant select (fund_of) on public.profiles to authenticated;

create function public.create_fund(p_group uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); f uuid;
begin
  if not public.is_member(p_group) then raise exception 'No perteneces a ese grupo' using errcode = '42501'; end if;
  select id into f from public.profiles where fund_of = p_group;
  if f is not null then return f; end if;
  insert into public.profiles (name, created_by, fund_of) values ('Fondo común', me, p_group) returning id into f;
  insert into public.group_members (group_id, profile_id) values (p_group, f);
  insert into public.activity (group_id, actor, verb) values (p_group, me, 'fondo_creado');
  return f;
end $$;

-- Un pago al fondo no espera confirmación. Igual que antes en todo lo demás.
create or replace function public.save_expense(p jsonb) returns uuid
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
  -- (o si lo recibe el fondo común del grupo: nadie tiene que confirmarlo)
  if is_pay then status := case when (p -> 'shares') ? me::text
    or exists (select 1 from jsonb_object_keys(p -> 'shares') k join public.profiles f on f.id = k::uuid where f.fund_of is not null)
    then 'confirmado' else 'pendiente' end; end if;

  if e_id is null then
    insert into public.expenses (id, group_id, description, category, date, currency, amount, fx_rate, is_payment, payment_status,
      split_mode, split_params, items, tax, tip, note, repeat, created_by)
    values (coalesce(nullif(p ->> 'new_id', '')::uuid, gen_random_uuid()), g, trim(coalesce(p ->> 'description', 'Pago')), coalesce(p ->> 'category', 'general'), coalesce((p ->> 'date')::date, current_date),
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

-- El fondo no es una persona que se pueda reclamar con el enlace de invitación.
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
       where gm.group_id = g.id and p.user_id is null and p.deleted_at is null and p.fund_of is null), '[]'))
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
                   where gm.group_id = g and p.id = p_as and p.user_id is null and p.deleted_at is null and p.fund_of is null) then
      raise exception 'Ese lugar ya lo reclamó alguien' using errcode = '22023';
    end if;
    perform public.merge_profiles(p_as, me);
  end if;
  insert into public.group_members (group_id, profile_id) values (g, me) on conflict do nothing;
  insert into public.activity (group_id, actor, verb) values (g, me, 'se_unio');
  return g;
end $$;

-- ── 3. gastos que se repiten ─────────────────────────────────
-- El gasto original guarda cada cuánto (`repeat`); cada vez que toca, se crea una copia con `repeat_from` apuntando a él.
-- Las copias se calculan desde la fecha original (así un 31 de mes no se va corriendo al 28).
alter table public.expenses add column repeat_from uuid references public.expenses(id) on delete set null;
create unique index expenses_repeticion_unica on public.expenses (repeat_from, date) where repeat_from is not null;

create function public.catch_up_recurring() returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); r public.expenses; nxt date; k int; made int := 0; e_id uuid; step interval;
begin
  for r in select e.* from public.expenses e join public.groups g on g.id = e.group_id
    where e.repeat is not null and e.repeat_from is null and e.deleted_at is null and g.archived_at is null and public.is_member(e.group_id)
  loop
    step := case r.repeat when 'semanal' then interval '7 days' when 'quincenal' then interval '15 days'
      when 'mensual' then interval '1 month' else interval '1 year' end;
    k := 1;
    loop
      nxt := (r.date + step * k)::date;
      exit when nxt > current_date or made >= 24 or k > 520;
      if not exists (select 1 from public.expenses where repeat_from = r.id and date = nxt) then
        e_id := null;
        insert into public.expenses (group_id, description, category, date, currency, amount, fx_rate, is_payment, payment_status,
          split_mode, split_params, items, tax, tip, note, repeat, repeat_from, created_by)
        values (r.group_id, r.description, r.category, nxt, r.currency, r.amount, r.fx_rate, false, null,
          r.split_mode, r.split_params, r.items, r.tax, r.tip, r.note, null, r.id, r.created_by)
        on conflict (repeat_from, date) where repeat_from is not null do nothing
        returning id into e_id;
        if e_id is not null then
          insert into public.expense_payers (expense_id, profile_id, amount) select e_id, profile_id, amount from public.expense_payers where expense_id = r.id;
          insert into public.expense_shares (expense_id, profile_id, amount) select e_id, profile_id, amount from public.expense_shares where expense_id = r.id;
          insert into public.activity (group_id, actor, verb, expense_id, payload) values (r.group_id, r.created_by, 'gasto_creado', e_id,
            jsonb_build_object('descripcion', r.description, 'monto', r.amount, 'moneda', r.currency, 'repetido', true));
          made := made + 1;
        end if;
      end if;
      k := k + 1;
    end loop;
  end loop;
  return made;
end $$;

-- ── 4. lista de compras ──────────────────────────────────────
create table public.group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120 and name !~ '[[:cntrl:]]'),
  added_by uuid not null references public.profiles(id),
  done_by uuid references public.profiles(id),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index group_items_grupo_idx on public.group_items (group_id, created_at);
alter table public.group_items enable row level security;
create policy "ver la lista de mis grupos" on public.group_items for select to authenticated using (public.is_member(group_id));
grant select on public.group_items to authenticated;

create function public.add_item(p_group uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); i uuid;
begin
  if not public.is_member(p_group) then raise exception 'No perteneces a ese grupo' using errcode = '42501'; end if;
  insert into public.group_items (group_id, name, added_by) values (p_group, trim(p_name), me) returning id into i;
  return i;
end $$;
create function public.toggle_item(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me();
begin
  update public.group_items set done_by = case when done_at is null then me else null end,
    done_at = case when done_at is null then now() else null end
  where id = p_id and public.is_member(group_id);
  if not found then raise exception 'Eso ya no está en la lista' using errcode = '22023'; end if;
end $$;
create function public.delete_item(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_me();
  delete from public.group_items where id = p_id and public.is_member(group_id);
end $$;

-- Con tope, como lo demás: 200 cosas por día.
create or replace function private.pace_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who uuid := public.current_profile_id();
begin
  if who is null then return new; end if; -- sin sesión (migraciones, el panel de Supabase): sin tope
  case tg_table_name
    when 'expenses' then perform private.throttle('gastos:' || who, 120, interval '10 minutes');
    when 'groups' then perform private.throttle('grupos:' || who, 30, interval '1 day');
    when 'profiles' then perform private.throttle('personas:' || who, 100, interval '1 day');
    when 'comments' then perform private.throttle('comentar:' || who, 60, interval '10 minutes');
    when 'group_items' then perform private.throttle('lista:' || who, 200, interval '1 day');
  end case;
  return new;
end $$;
create trigger pace before insert on public.group_items for each row execute function private.pace_rows();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.group_items;
  end if;
end $$;

-- ── 5. fotos ─────────────────────────────────────────────────
-- En el almacenamiento «adjuntos» (privado): gastos/<grupo>/<archivo> y grupos/<grupo>/<archivo>. Las ve y las sube
-- solo la gente del grupo; hasta 2 MB, en JPG, PNG o WebP.
alter table public.expenses add column photo_path text
  check (photo_path is null or photo_path ~ '^gastos/[0-9a-f-]{36}/[0-9a-z_-]{1,80}\.(jpg|png|webp)$');

create function public.set_expense_photo(p_id uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  perform public.require_me();
  select group_id into g from public.expenses where id = p_id;
  if g is null or not public.can_edit(p_id) then raise exception 'No puedes cambiar ese gasto' using errcode = '42501'; end if;
  if p_path is not null and p_path not like 'gastos/' || g || '/%' then raise exception 'Esa foto no es de este grupo' using errcode = '22023'; end if;
  update public.expenses set photo_path = p_path where id = p_id;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos', 'adjuntos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- El grupo sale de la ruta (la segunda carpeta). `case` primero revisa la forma: una ruta rara da «no», no un error.
create policy "ver adjuntos de mis grupos" on storage.objects for select to authenticated using (
  bucket_id = 'adjuntos' and case when (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    then public.is_member(((storage.foldername(name))[2])::uuid) else false end);
create policy "subir adjuntos a mis grupos" on storage.objects for insert to authenticated with check (
  bucket_id = 'adjuntos' and (storage.foldername(name))[1] in ('gastos', 'grupos') and case when (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    then public.is_member(((storage.foldername(name))[2])::uuid) else false end);
create policy "borrar adjuntos de mis grupos" on storage.objects for delete to authenticated using (
  bucket_id = 'adjuntos' and case when (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    then public.is_member(((storage.foldername(name))[2])::uuid) else false end);

-- ── 6. avisos ────────────────────────────────────────────────
-- Dónde avisarle a cada cuenta: suscripciones de Web Push (web) y tokens de Expo (app nativa). Nadie los lee por la API:
-- solo la función que manda los avisos (con la clave de servicio).
create table private.push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null check (length(token) <= 2048),
  kind text not null check (kind in ('web', 'expo')),
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

create function public.save_push_token(p_kind text, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  perform public.require_me();
  if p_kind not in ('web', 'expo') or length(coalesce(p_token, '')) not between 10 and 2048 then
    raise exception 'Ese aviso no es válido' using errcode = '22023';
  end if;
  insert into private.push_tokens (user_id, token, kind) values (uid, p_token, p_kind) on conflict do nothing;
  -- hasta 10 por cuenta (teléfonos y navegadores); los más viejos se van
  delete from private.push_tokens where user_id = uid and token in (
    select token from private.push_tokens where user_id = uid order by created_at desc offset 10);
end $$;
create function public.delete_push_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_me();
  delete from private.push_tokens where user_id = auth.uid() and token = p_token;
end $$;

-- A quién avisar de un movimiento: la gente del grupo con cuenta, menos quien lo hizo. Solo para la función de avisos,
-- que antes revisa que quien la llama sea quien hizo el movimiento.
create function public.push_targets(p_activity bigint, p_user uuid) returns table (token text, kind text)
language sql stable security definer set search_path = public as $$
  select t.token, t.kind from public.activity a
  join public.profiles actor on actor.id = a.actor and actor.user_id = p_user
  join public.group_members gm on gm.group_id = a.group_id
  join public.profiles pr on pr.id = gm.profile_id and pr.user_id is not null and pr.id <> a.actor
  join private.push_tokens t on t.user_id = pr.user_id
  where a.id = p_activity and a.created_at > now() - interval '1 hour'
$$;
-- Las suscripciones que el servicio de avisos dio por muertas (teléfono sin la app, navegador que se dio de baja).
create function public.forget_push_tokens(p_tokens text[]) returns void
language sql security definer set search_path = public as $$
  delete from private.push_tokens where token = any (p_tokens)
$$;

-- ── 7. recibos escaneados ────────────────────────────────────
-- Leer un recibo cuesta: hasta 40 por día por persona. La función que los lee lo pregunta antes de mandar la foto.
create function public.scan_quota() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return private.rate_take('recibo:' || public.require_me(), 40, interval '1 day');
end $$;

-- ── permisos de las funciones nuevas ─────────────────────────
revoke execute on function public.update_group(uuid, jsonb), public.set_member_role(uuid, uuid, text), public.leave_group(uuid),
  public.create_fund(uuid), public.catch_up_recurring(), public.add_item(uuid, text), public.toggle_item(uuid), public.delete_item(uuid),
  public.set_expense_photo(uuid, text), public.save_push_token(text, text), public.delete_push_token(text), public.scan_quota(),
  public.push_targets(bigint, uuid), public.forget_push_tokens(text[]) from public, anon;
grant execute on function public.update_group(uuid, jsonb), public.set_member_role(uuid, uuid, text), public.leave_group(uuid),
  public.create_fund(uuid), public.catch_up_recurring(), public.add_item(uuid, text), public.toggle_item(uuid), public.delete_item(uuid),
  public.set_expense_photo(uuid, text), public.save_push_token(text, text), public.delete_push_token(text), public.scan_quota() to authenticated;
revoke execute on function public.push_targets(bigint, uuid), public.forget_push_tokens(text[]) from authenticated;
grant execute on function public.push_targets(bigint, uuid), public.forget_push_tokens(text[]) to service_role;
revoke execute on all functions in schema private from public, anon, authenticated;
