-- Saldao · cambios sin conexión
-- La app anota gastos, pagos, borrados y comentarios aunque no haya señal y los envía al volver. Para que reenviar no
-- duplique nada:
-- 1. Cada cambio lleva un id que pone la app. apply_op lo aplica una sola vez: si llega otra vez (porque la respuesta se
--    perdió en el camino), devuelve lo mismo que la primera vez sin repetirlo.
-- 2. Un gasto nuevo puede traer su id (new_id): así es el mismo en el teléfono antes de enviarlo y en la base después.
-- Solo agrega: la app publicada antes de esta migración sigue funcionando igual.

-- ── 1. cambios ya aplicados ──────────────────────────────────
create table private.applied_ops (
  user_id uuid not null references auth.users(id) on delete cascade,
  op uuid not null,
  kind text not null,
  result jsonb,
  at timestamptz not null default now(),
  primary key (user_id, op)
);

create function public.apply_op(p_op uuid, p_kind text, p_args jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_me(); uid uuid := auth.uid(); r jsonb; e uuid; g uuid;
begin
  if p_op is null or jsonb_typeof(p_args) is distinct from 'object' then
    raise exception 'Cambio incompleto' using errcode = '22023';
  end if;
  -- Primero se aparta el id: si otro envío del mismo cambio va en camino, este espera a que termine y ve que ya está.
  -- Si el cambio falla, todo se deshace (también esto) y se puede volver a intentar.
  insert into private.applied_ops (user_id, op, kind) values (uid, p_op, p_kind) on conflict do nothing;
  if not found then
    return (select result from private.applied_ops where user_id = uid and op = p_op);
  end if;
  delete from private.applied_ops where user_id = uid and at < now() - interval '90 days';

  case p_kind
    when 'save_expense' then r := to_jsonb(public.save_expense(p_args -> 'p'));
    when 'delete_expense' then perform public.delete_expense((p_args ->> 'id')::uuid);
    when 'restore_expense' then perform public.restore_expense((p_args ->> 'id')::uuid);
    when 'confirm_payment' then perform public.confirm_payment((p_args ->> 'id')::uuid);
    when 'add_comment' then
      -- lo mismo que pide la política "comentar en mis grupos", con el id que puso la app
      e := (p_args ->> 'expense_id')::uuid;
      select group_id into g from public.expenses where id = e;
      if g is null or not public.is_member(g) then raise exception 'No puedes comentar ese gasto' using errcode = '42501'; end if;
      insert into public.comments (id, expense_id, profile_id, body)
      values (coalesce((p_args ->> 'id')::uuid, gen_random_uuid()), e, me, p_args ->> 'body')
      returning to_jsonb(id) into r;
    else raise exception 'Ese cambio no existe' using errcode = '22023';
  end case;
  update private.applied_ops set result = r where user_id = uid and op = p_op;
  return r;
end $$;

-- ── 2. un gasto nuevo con el id que puso la app ─────────────
-- Igual que antes; lo único nuevo es new_id al crear (sin él, la base pone el id como siempre).
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
  if is_pay then status := case when (p -> 'shares') ? me::text then 'confirmado' else 'pendiente' end; end if;

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

-- ── permisos ─────────────────────────────────────────────────
revoke execute on function public.apply_op(uuid, text, jsonb) from public, anon;
grant execute on function public.apply_op(uuid, text, jsonb) to authenticated;
