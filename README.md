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

**Sin conexión**
- La app abre al instante con lo último que vio, también sin señal.
- Gastos, pagos, borrados, confirmaciones y comentarios se anotan sin internet: se ven al momento con la marca
  *sin enviar* y salen solos cuando vuelve la conexión.
- Reenviar no duplica nada: cada cambio lleva su id y la base lo aplica una sola vez (`apply_op`).
- Si la base rechaza algo enviado después (por ejemplo, ya no eres del grupo), la app lo avisa y se puede descartar.
- Crear grupos, invitar y editar el perfil sí necesitan internet.

**Grupos que se administran**
- Cambiar el nombre y la foto, archivar, salir y simplificar deudas (el grupo salda con el menor número de pagos).
- Grupos de fecha a fecha (un viaje, un evento): al pasar la última fecha el grupo propone saldar y archivar.
- Personas: hacer o quitar admin, quitar a alguien (con sus cuentas saldadas) y cambiar el nombre de quien todavía no
  tiene cuenta. Siempre queda al menos un admin.
- Fondo común: cada uno aporta y los gastos salen del fondo; las deudas con el fondo se leen «El fondo te guarda».
- Presupuesto del mes con barra y aviso al 80 %, y lista de compras en tiempo real que se convierte en gasto.

**Anotar más rápido**
- Escanear el recibo: una foto y Claude llena los ítems, el ITBIS y la ley (función `leer-recibo`, hasta 40 al día).
- Foto del comprobante en cada gasto (privada, solo la ve el grupo).
- Gastos que se repiten (cada semana, quincena, mes o año), «De siempre» con los que más repites, la tasa del dólar del
  día al elegir US$ y dividir por noches.

**Saber y cobrar**
- «Para cobrar» en Inicio: quién te debe hace más de 15 días, con un toque para recordarle.
- Resumen del mes por categoría y por grupo, buscar por texto, ítem, grupo, persona o categoría, y exportar a Excel
  (CSV) o PDF.
- Tu código QR para cobrar, con tus datos y el monto.
- Avisos en el teléfono y en el navegador (función `avisar`), el contador de lo nuevo en el ícono y bloqueo con Face ID,
  huella o Windows Hello.
- En español o en inglés (Cuenta › Idioma). Empieza en español.

## Probar sin backend

```bash
npm install
```

```bash
npm run dev:demo
```

Abre la URL que imprime Vite. El modo demo usa datos de ejemplo en memoria y no guarda nada.

## App nativa (iPhone y Android)

La app nativa está en `apps/mobile` (Expo SDK 58, React Native 0.88) y usa el mismo núcleo que la web
(`packages/core`): las mismas cuentas, la misma cola sin conexión y la misma base. Se ve igual (estilo «De noche»,
Unbounded y Sora, claro u oscuro) y tiene todas las pantallas de la web: entrar y crear cuenta, Inicio, Grupos,
Actividad, Cuenta, grupo, persona, gasto, gasto nuevo (con el teclado del monto y las seis formas de dividir),
saldar, pagar, invitar, unirse, términos y borrar la cuenta.

Hace falta **Node 22.13 o más nuevo** (Expo SDK 58 no funciona bien con Node 20).

1. Copia `apps/mobile/.env.example` como `apps/mobile/.env.local` con los mismos valores de la web, pero con el
   prefijo `EXPO_PUBLIC_` (`EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
2. Instala **Expo Go** en tu teléfono (App Store o Google Play).
3. Arranca:

```bash
npm run mobile
```

4. Escanea el código QR que aparece: con la cámara en iPhone y con Expo Go en Android. El teléfono y la computadora
   tienen que estar en la misma red Wi-Fi.

Para verla con los datos de ejemplo, sin Supabase:

```bash
npm run mobile:demo
```

Cómo guarda las cosas: la sesión va en el llavero del teléfono (Keychain en iPhone, Keystore en Android), cifrada
por el sistema; la última foto y la cola sin conexión, en el almacenamiento de la app. Lo pendiente sale solo al
volver la señal o al volver a la app.

Para entrar con Google desde la app nativa, cuando lo actives en Supabase, agrega a *Redirect URLs* `saldao://**`
(la app instalada) y `exp://**` (Expo Go).

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
5. Funciones de servidor (`supabase/functions/`), para leer recibos y mandar avisos:
   - **Secretos** (*Edge Functions → Secrets*): `ANTHROPIC_API_KEY` (de console.anthropic.com), `VAPID_PUBLIC_KEY`,
     `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (están en `supabase/.secrets.local`, que no se sube) y `AVISOS_SECRETO`
     (cualquier texto largo al azar). Si activaste la seguridad de Expo para avisos, también `EXPO_ACCESS_TOKEN`.
   - **Publicar:** `npx supabase functions deploy leer-recibo` y `npx supabase functions deploy avisar --no-verify-jwt`.
   - **Webhook de avisos** (*Database → Webhooks → Create*): tabla `activity`, evento *Insert*, tipo *Supabase Edge
     Functions*, función `avisar`, con el encabezado `x-avisos` igual a `AVISOS_SECRETO`.
   - `leer-recibo` usa `claude-opus-5-5` con formato JSON fijo y, si el modelo declina una foto, la API la reintenta sola
     con otro modelo (`fallbacks`). Cada persona puede leer hasta 40 recibos al día (`scan_quota`).

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
- **Términos y privacidad** en [/terminos.html](public/terminos.html) y [/privacidad.html](public/privacidad.html), con fecha de versión:
  - al crear la cuenta se aceptan con una casilla, y se guarda qué versión, cuándo y desde qué navegador;
  - con Google, con una cuenta vieja o cuando cambia la versión, la app los pide al entrar.
- **Borrar la cuenta** en Cuenta, escribiendo BORRAR:
  - se va el acceso, el correo, el usuario y dónde te pagan;
  - los gastos compartidos se quedan con el nombre, para las demás personas;
  - un grupo sin nadie más con cuenta se borra completo.
- **El correo** de cada perfil solo lo ve su dueño.
- **En el navegador:**
  - política de contenido (CSP) y cabeceras de seguridad en `vercel.json`;
  - los errores de la base se muestran en español y sin detalles internos;
  - si una pantalla se rompe, sale un aviso en vez de la pantalla en blanco;
  - el enlace de invitación solo se acepta con su forma.

## Tests

```bash
npm test
```

Corren en cada subida a GitHub (`.github/workflows/ci.yml`): tipos, pruebas y compilación. Hay cinco suites:
- `packages/core/src/domain.test.ts` prueba las reglas de dinero: repartos con centavos justos, ítems con ITBIS y ley, multimoneda, saldos por pareja y estados del "por qué".
- `supabase/tests/migration.test.ts` corre la migración real en Postgres (PGlite). Prueba:
  - RLS: nadie ve grupos ajenos y nadie escribe directo en las tablas;
  - que los gastos cuadren;
  - reclamar a una persona marcador;
  - que solo quien recibe un pago lo confirme;
  - borrar y restaurar;
  - comentarios;
  - grupos de a dos;
  - entrar con usuario y su bloqueo;
  - seguridad: que toda tabla tenga RLS, que la lista de funciones y permisos abiertos sea exacta y que los límites frenen;
  - cambios sin conexión: repetidos cuentan una vez, con el id que puso la app, y un cambio que falla se puede corregir.
- `packages/core/src/store.test.ts` prueba la cola contra una base a la que se le corta la señal: se ve al instante,
  sale sola al volver, no duplica, llega en orden, se guarda en el teléfono y cada cuenta tiene la suya.
- `supabase/tests/db-types.test.ts` revisa que los tipos de la base estén al día con las migraciones (ver abajo).
- `packages/core/src/core.test.ts` revisa que el núcleo no use nada del navegador, de Vite ni de React.
- `packages/core/src/features.test.ts` prueba las mejoras del núcleo: fondo común, presupuesto, resumen del mes,
  buscar, quién te debe hace mucho, exportar, el QR y los grupos de fecha a fecha.
- `packages/core/src/i18n.test.ts` prueba el inglés y revisa que **toda** frase que pasa por `tr()` en la web, la app
  nativa y el núcleo tenga su traducción en `en.ts`, con los mismos `{0}`, `{1}`… Si agregas un texto, agrégalo ahí.
- `supabase/tests/functions.test.ts` prueba las funciones sin red: el cifrado de los avisos web (se descifra aparte,
  como lo haría el navegador), la firma VAPID, a qué servicios se les manda, el texto de cada aviso y cómo se pasa un
  recibo leído a la app.

### Tipos de la base

`packages/core/src/database.types.ts` sale de las migraciones, no de la base en línea: corre todas en PGlite y escribe
los tipos con lo que la app puede usar con su sesión (el correo de los perfiles y las funciones internas no aparecen, y
los campos con lista de valores, como `kind` o `verb`, llevan esos valores). Si cambias una migración:

```bash
npm run db:types
```

Así, leer una columna cerrada, llamar una función interna o escribir donde la base no deja es un error al compilar.

## Documentos

- `docs/PLAN.md`: el plan completo, lo que hace Splitwise y cómo lo mejoramos.
- `docs/prototipos/`: los dos diseños de ejemplo (A Pastel, el elegido, y B Libreta).

## Estructura

```
apps/mobile/         la app nativa (Expo): src/app son las rutas, src/screens las pantallas, src/ui las piezas
packages/core/       lo que comparten la web y la app nativa (sin navegador ni React)
  src/app.ts         nombre de la app (un solo lugar)
  src/domain.ts      reglas de dinero, sin dependencias
  src/derive.ts      saldos, deudas y textos que salen de los datos
  src/format.ts      RD$ y fechas (en español o en inglés)
  src/features.ts    las mejoras: fondo, presupuesto, resumen, buscar, exportar, QR, tasa del dólar, fechas del grupo
  src/i18n.ts        tr(): el texto en español o su traducción de en.ts
  src/store.ts       la foto de los datos, la cola sin conexión y las acciones (cada app la conecta con sus hooks)
  src/queue.ts       cómo se ve la cola encima de la foto
  src/supabase.ts    sesión, lectura y escritura en Supabase (configurable: la web y la nativa pasan lo suyo)
  src/demo.ts        datos de demostración en memoria
  src/database.types.ts  tipos de la base, generados desde las migraciones
src/                 la web (PWA)
  data/connect.ts    conecta el núcleo con las variables de Vite
  data/store.ts      hooks de React sobre el almacén del núcleo
  ui/nav.tsx         pestañas, pila de pantallas, gesto de volver, hojas, toasts, botón atrás de Android
  ui/kit.tsx         dinero, avatares, filas, el renglón del "por qué"
  screens/           Inicio, Grupos, Actividad, Cuenta, grupo, persona, gasto
  sheets/            nuevo gasto, saldar, pagar, grupos e invitaciones
supabase/
  migrations/        esquema, RLS y funciones (save_expense valida que todo cuadre)
  functions/         leer-recibo (Claude) y avisar (Web Push y Expo), con lo que comparten en _shared
  tests/             la migración probada en PGlite, el generador de tipos y las funciones
.github/workflows/   pruebas automáticas en cada subida
```

## Lo que viene

- **Avisos en el idioma de cada quien:** hoy los avisos salen en español; habría que guardar el idioma con cada
  teléfono.
- **App nativa publicada:** conectarla a su proyecto de Expo (EAS) para los avisos y las tiendas, con su id de paquete
  definitivo (hoy `do.saldao.app`), y un widget de verdad en la pantalla de inicio.
- **Términos y privacidad en inglés.**
