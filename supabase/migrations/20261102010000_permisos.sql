-- Saldao · permisos de funciones y comentarios
-- Supabase le da EXECUTE a anon y authenticated en cada función nueva del esquema public
-- (privilegios por defecto), así que el "revoke ... from public" de la migración inicial no bastaba.

-- Internas: nadie las llama por la API.
revoke execute on function public.merge_profiles(uuid, uuid) from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.log_comment() from anon, authenticated;
revoke execute on function public.require_me() from anon, authenticated;

-- Sin sesión no se ejecuta nada (tampoco la vista previa de invitaciones).
revoke execute on all functions in schema public from anon;

-- Un comentario no se puede mover a un gasto de otro grupo al editarlo.
drop policy "borrar mi comentario" on public.comments;
create policy "borrar mi comentario" on public.comments for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id()
    and exists (select 1 from public.expenses e where e.id = expense_id and public.is_member(e.group_id)));
