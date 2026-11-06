-- Saldao · grupos de fecha a fecha y manejar a las personas del grupo
-- 1. Un grupo puede tener fecha de inicio y de fin (un viaje, un evento): se ve en el grupo y, al terminar, propone
--    saldar y archivar.
-- 2. Un admin puede quitar a alguien del grupo (con sus cuentas saldadas) y cambiar el nombre de quien todavía no tiene
--    cuenta.
-- Solo agrega: la app publicada antes de esta migración sigue funcionando igual.

alter table public.activity drop constraint activity_verb_check;
alter table public.activity add constraint activity_verb_check check (verb in ('grupo_creado', 'miembro_agregado', 'se_unio',
  'gasto_creado', 'gasto_editado', 'gasto_borrado', 'gasto_restaurado', 'pago_registrado', 'pago_confirmado', 'comentario',
  'grupo_editado', 'salio', 'fondo_creado', 'miembro_quitado'));

-- ── 1. de fecha a fecha ──────────────────────────────────────
alter table public.groups
  add column starts_on date,
  add column ends_on date,
  add constraint groups_fechas check (ends_on is null or starts_on is null or ends_on >= starts_on);

-- Igual que antes, más las fechas (starts_on y ends_on; null las quita).
create or replace function public.update_group(p_group uuid, p jsonb) returns void
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
    archived_at = case when p ? 'archived' then case when (p ->> 'archived')::boolean then now() else null end else archived_at end,
    starts_on = case when p ? 'starts_on' then nullif(p ->> 'starts_on', '')::date else starts_on end,
    ends_on = case when p ? 'ends_on' then nullif(p ->> 'ends_on', '')::date else ends_on end
  where id = p_group and kind <> 'directo';
  if not found then raise exception 'Ese grupo no se puede cambiar' using errcode = '22023'; end if;
  insert into public.activity (group_id, actor, verb, payload) values (p_group, me, 'grupo_editado', p - 'photo_path');
end $$;

-- ── 2. las personas del grupo ────────────────────────────────
-- Quitar a alguien: un admin, con las cuentas de esa persona saldadas en el grupo (lo que compartió se queda).
create function public.remove_member(p_group uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); net numeric;
begin
  if not public.is_admin(p_group) then raise exception 'Solo un admin puede quitar personas' using errcode = '42501'; end if;
  if p_profile = me then raise exception 'Para irte, usa «Salir del grupo»' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles where id = p_profile and fund_of = p_group) then
    raise exception 'El fondo común no se quita' using errcode = '22023';
  end if;
  if not exists (select 1 from public.group_members where group_id = p_group and profile_id = p_profile) then
    raise exception 'Esa persona no está en el grupo' using errcode = '22023';
  end if;
  select coalesce(sum(x), 0) into net from (
    select round(p.amount * e.fx_rate) as x from public.expense_payers p join public.expenses e on e.id = p.expense_id
    where e.group_id = p_group and e.deleted_at is null and p.profile_id = p_profile
    union all
    select -round(s.amount * e.fx_rate) from public.expense_shares s join public.expenses e on e.id = s.expense_id
    where e.group_id = p_group and e.deleted_at is null and s.profile_id = p_profile) t;
  if abs(net) > 99 then raise exception 'Esa persona tiene cuentas pendientes en el grupo: primero hay que saldarlas.' using errcode = 'P0001'; end if;
  delete from public.group_members where group_id = p_group and profile_id = p_profile;
  insert into public.activity (group_id, actor, verb, payload)
  values (p_group, me, 'miembro_quitado', jsonb_build_object('nombre', (select name from public.profiles where id = p_profile)));
end $$;

-- Cambiar el nombre de quien todavía no tiene cuenta (al unirse, reclama su lugar y queda con el suyo).
create function public.rename_placeholder(p_group uuid, p_profile uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_me();
  if not public.is_admin(p_group) then raise exception 'Solo un admin puede cambiar nombres' using errcode = '42501'; end if;
  update public.profiles p set name = trim(p_name)
  where p.id = p_profile and p.user_id is null and p.deleted_at is null and p.fund_of is null
    and exists (select 1 from public.group_members gm where gm.group_id = p_group and gm.profile_id = p.id);
  if not found then raise exception 'Solo se puede cambiar el nombre de quien todavía no tiene cuenta' using errcode = '22023'; end if;
end $$;

revoke execute on function public.remove_member(uuid, uuid), public.rename_placeholder(uuid, uuid, text) from public, anon;
grant execute on function public.remove_member(uuid, uuid), public.rename_placeholder(uuid, uuid, text) to authenticated;
