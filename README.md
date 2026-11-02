# Saldao

Saldao es una PWA para dividir gastos con amigos, la pareja, el apartamento o un viaje. Te dice quién le debe a quién, **por qué** (qué gastos), **desde cuándo** y **qué ya se saldó**.

Está hecha solo para el teléfono: se instala, abre a pantalla completa y se comporta como una app nativa. No hace zoom, la página no rebota, tiene gestos de volver y hojas que se arrastran.

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
   - **SQL Editor:** pega `supabase/migrations/20261102000000_init.sql` y dale a Run.
   - **CLI:** corre `npx supabase login`, luego `npx supabase link --project-ref TU_REF` y luego `npx supabase db push`.
3. Configura Authentication:
   - **Email:** actívalo. En *Email Templates → Magic Link* pon el código con `{{ .Token }}`; la app entra con un código de 6 dígitos.
   - **URL Configuration:** en *Redirect URLs* agrega `http://localhost:5173`, tu IP local para probar en el teléfono y el dominio de producción.
   - **Google:** opcional. Se activa en *Providers* con su Client ID y Secret.
   - **SMTP propio:** usa Resend o similar antes de tener usuarios reales. El correo que trae Supabase manda muy pocos emails por hora.
4. Arranca con `npm run dev`. Para probar en el teléfono, abre `http://TU-IP:5173` en la misma red wifi.

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
  - grupos de a dos.

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
