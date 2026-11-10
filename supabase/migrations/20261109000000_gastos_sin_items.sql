-- Guardar un gasto sin ítems fallaba con «Algún dato no es válido»: la app manda "items": null y un null de JSON en una
-- columna jsonb queda como el valor jsonb null, no como vacío, así que la regla expenses_items_tope (de la migración de
-- seguridad) lo rechazaba. Afectaba a todo gasto y pago que no fuera por ítems. La app ya no lo manda, pero los
-- teléfonos con la versión anterior y los cambios guardados en la cola sin conexión sí: save_expense ahora los toma
-- como «sin ítems». Igual que la versión de 20261107000000_mejoras.sql salvo eso.
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
  -- un null de JSON («items": null) es «sin ítems», no el valor jsonb null que la regla expenses_items_tope rechaza
  its jsonb := case when jsonb_typeof(p -> 'items') = 'null' then null else p -> 'items' end;
  params jsonb := case when jsonb_typeof(p -> 'split_params') = 'null' then null else p -> 'split_params' end;
begin
  if not public.is_member(g) then raise exception 'No perteneces a ese grupo' using errcode = '42501'; end if;
  if jsonb_typeof(p -> 'payers') <> 'object' or jsonb_typeof(p -> 'shares') <> 'object' then
    raise exception 'Faltan pagadores o partes' using errcode = '22023';
  end if;
  if (its is not null and jsonb_typeof(its) <> 'array') or (params is not null and jsonb_typeof(params) <> 'object') then
    raise exception 'Los ítems o las partes no son válidos' using errcode = '22023';
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
      coalesce(p ->> 'split_mode', 'exact'), coalesce(params, '{}'), its,
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
      split_params = coalesce(params, split_params), items = its, tax = coalesce((p ->> 'tax')::numeric, tax),
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

