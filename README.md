# Saldao

Saldao es una PWA para dividir gastos con amigos, la pareja, el apartamento o un viaje. Te dice quién le debe a quién, **por qué** (qué gastos), **desde cuándo** y **qué ya se saldó**.

Está hecha solo para el teléfono: se instala, abre a pantalla completa y se comporta como una app nativa. No hace zoom, la página no rebota, tiene gestos de volver y hojas que se arrastran.

**Estilo «De noche»:** oscuro de base, lima para lo que te deben y coral para lo que debes, títulos y saldos en Unbounded y el resto en Sora. En Cuenta › Tema se elige De noche, Claro o Auto (como el teléfono). La distribución y el movimiento vienen de MatchMate: título grande, una tarjeta principal con el saldo y «Añadir gasto», secciones con «Ver todos», barra de abajo con cuatro secciones, pantallas y listas que entran en cascada, saldos que cuentan hasta su valor y esqueletos mientras carga.

## Qué hace

**Grupos y personas**
- Grupos de casa, viaje, pareja u otro.
- Gastos de a dos sin grupo.
- Invitación por enlace.
- Personas que todavía no tienen cuenta: después reclaman su lugar y su historial.

**Gastos**
- Teclado propio para el monto.
- RD$ y US$ con la tasa del día.
- Varios pagadores.
- Seis formas de dividir: iguales, montos, porcentajes, partes, extra e **ítems del recibo** (con ITBIS 18 % y ley 10 % repartidos en proporción).

**Saldos**
- Deudas directas por pareja.
- Cada deuda se despliega para mostrar sus gastos, con fecha y estado: *pendiente*, *quedan RD$ X* o *saldado 20 oct*.

**Pagos**
- Datos de cobro de cada persona, con un botón para copiarlos.
- "Me pagó" para registrar lo que te dieron.
- Recordatorio por WhatsApp.
- Quien recibe el pago confirma que le llegó.

**Historial**
- Editar con historial, borrar con *Deshacer* y restaurar desde Actividad.
- Comentarios en cada gasto.
- Tiempo real entre los miembros del grupo.

## Probar sin backend

```bash
npm install
```

```bash
npm run dev:demo
```

Abre la URL que imprime Vite. El modo demo usa datos de ejemplo en memoria y no guarda nada.

## Conectar Supabase

1. Copia `.env.example` como `.env.local` y pon `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Project Settings → API). La anon key es pública: la seguridad la dan las reglas RLS.
2. Crea las tablas. Hay dos formas:
   - **SQL Editor:** pega cada archivo de `supabase/migrations/` en orden (por fecha en el nombre) y dale a Run.
   - **CLI:** corre `npx supabase login`, luego `npx supabase link --project-ref TU_REF` y luego `npm run db:push`; aplica solo las que falten.
3. Configura Authentication. La app entra con **correo o usuario y contraseña** (con "olvidé mi contraseña") y con **Google**. El usuario se elige al crear la cuenta o en Cuenta; para entrar con él, la base entrega el correo solo si la contraseña es la correcta y lo bloquea 15 minutos tras 5 intentos fallidos.
   - **URL Configuration:**
     - *Site URL:* `https://saldao-green.vercel.app`.
     - *Redirect URLs:* `https://saldao-green.vercel.app/**`, `http://localhost:5173/**` y tu IP local con `:5173/**`.
     - Los enlaces de confirmar cuenta y de nueva contraseña vuelven a esas direcciones.
   - **Email:** activado, con "Confirm email" y una contraseña mínima de 8 caracteres.
   - **SMTP propio (obligatorio para usuarios reales):** el correo que trae Supabase solo llega a los miembros de tu equipo en Supabase. Con Resend:
     - verifica tu dominio;
     - en *Project Settings → Authentication → SMTP* pon `smtp.resend.com`, puerto 465, usuario `resend` y tu API key como contraseña;
     - remitente: `no-reply@tu-dominio`.
   - **Rate Limits y Attack Protection:** deja los límites de correos, entradas y registros por IP que trae Supabase; si llegan bots, activa el captcha (Turnstile).
   - **Email Templates:** la cuenta se confirma con un enlace, no con código. En *Confirm signup* y *Reset password* pega el asunto y el HTML de `supabase/templates/confirmar.html` y `recuperar.html` (los asuntos están en `supabase/config.toml`).
   - **Google:**
     - En Google Cloud crea un *OAuth client ID* de tipo Web.
     - *Authorized redirect URI:* `https://<tu-ref>.supabase.co/auth/v1/callback`.
     - Pega el Client ID y el Secret en *Sign In / Providers → Google*.
4. Arranca con `npm run dev`. Para probar en el teléfono, abre `http://TU-IP:5173` en la misma red wifi.

## Seguridad

- **Base cerrada por defecto** (`supabase/migrations/20261105000000_seguridad.sql`):
  - las tablas solo se leen, con RLS;
  - escribir directo solo se puede al comentar y al editar tu nombre, usuario y dónde te pagan;
  - todo lo demás pasa por funciones que validan;
  - cada función nueva nace cerrada y solo se abre con su nombre en la lista.
- **Límites de intentos** que no se saltan con peticiones en paralelo:
  - ver si un usuario está libre y entrar con usuario: por conexión;
  - gastos, grupos, personas sin cuenta, comentarios y enlaces de invitación: por persona;
  - además, un usuario se bloquea tras 5 contraseñas malas.
- **Datos limpios:** sin caracteres de control en nombres y textos, JSON con tamaño tope y fechas razonables.
- **En el navegador:**
  - política de contenido (CSP) y cabeceras de seguridad en `vercel.json`;
  - los errores de la base se muestran en español y sin detalles internos;
  - si una pantalla se rompe, sale un aviso en vez de la pantalla en blanco;
  - el enlace de invitación solo se acepta con su forma.

## Tests

```bash
npm test
```

Hay dos suites:
- `src/lib/domain.test.ts` prueba las reglas de dinero: repartos con centavos justos, ítems con ITBIS y ley, multimoneda, saldos por pareja y estados del "por qué".
- `supabase/tests/migration.test.ts` corre la migración real en Postgres (PGlite). Prueba:
  - RLS: nadie ve grupos ajenos y nadie escribe directo en las tablas;
  - que los gastos cuadren;
  - reclamar a una persona marcador;
  - que solo quien recibe un pago lo confirme;
  - borrar y restaurar;
  - comentarios;
  - grupos de a dos;
  - entrar con usuario y su bloqueo;
  - seguridad: que toda tabla tenga RLS, que la lista de funciones y permisos abiertos sea exacta y que los límites frenen.

## Documentos

- `docs/PLAN.md`: el plan completo, lo que hace Splitwise y cómo lo mejoramos.
- `docs/prototipos/`: los dos diseños de ejemplo (A Pastel, el elegido, y B Libreta).

## Estructura

```
src/
  app.config.ts      nombre de la app (un solo lugar)
  lib/domain.ts      reglas de dinero, sin dependencias
  lib/format.ts      RD$, fechas en español
  data/              Supabase, demo en memoria, store y cálculos derivados
  ui/nav.tsx         pestañas, pila de pantallas, gesto de volver, hojas, toasts, botón atrás de Android
  ui/kit.tsx         dinero, avatares, filas, el renglón del "por qué"
  screens/           Inicio, Grupos, Actividad, Cuenta, grupo, persona, gasto
  sheets/            nuevo gasto, saldar, pagar, grupos e invitaciones
supabase/
  migrations/        esquema, RLS y funciones (save_expense valida que todo cuadre)
  tests/             la migración probada en PGlite
```

## Lo que viene

- **Ítems:** escaneo de recibos con IA (Edge Function) que llene los ítems.
- **Notificaciones push:** Web Push con claves VAPID.
- **Recurrentes:** gastos que se repiten con `pg_cron`.
- **Tasas de cambio:** automáticas y diarias.
- **Offline:** cola de cambios sin conexión. Hoy la app abre offline, pero escribir necesita red.
- **Simplificar deudas:** como plan de pagos opcional.
- **Búsqueda, gráficos y exportar.**
- **Grupos:** salir, archivar, cambiar roles y foto.
