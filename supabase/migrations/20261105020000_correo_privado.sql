-- Saldao · el correo de cada perfil, solo para su dueño
-- Los demás miembros del grupo ya no lo ven (la app lo pedía para mostrarlo en Cuenta; ahora lo lee de la sesión).
-- Va aparte y después de publicar la app que ya no lo pide: si se corre antes, la app anterior no carga.
revoke select on public.profiles from authenticated;
grant select (id, user_id, name, username, payout, avatar_url, default_currency, created_by, created_at, deleted_at)
  on public.profiles to authenticated;
