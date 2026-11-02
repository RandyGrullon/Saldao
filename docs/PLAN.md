# Cuentas Claras: plan de la PWA

PWA para dividir gastos. Solo para teléfono: nada de escritorio, nada de zoom, nada de scroll de página web.
"Cuentas Claras" es un nombre de trabajo.

El punto de partida es Splitwise, estudiado con evidencia pública:

- su API oficial (`splitwise/api-docs`);
- respuestas reales de la API guardadas por SDKs de terceros;
- su centro de ayuda (kb.splitwise.com);
- las páginas Pro, Pay y Card;
- la ficha de la App Store;
- reseñas en Trustpilot.

> **Aviso legal (no es asesoría):** los términos de la API de Splitwise prohíben usar sus materiales para hacer una app que compita. Esa prohibición cubre la API, la documentación, los datos y los iconos de categorías. Aquí usamos solo los conceptos funcionales, que son genéricos. Nada de su nombre, iconos, colores ni API.

---

## 1. Lo que hace Splitwise y cómo lo mejoramos

| Área | Splitwise hoy | Cuentas Claras |
|---|---|---|
| Límite | Gratis: unos 4 gastos al día (las reseñas de 2026 dicen 2–3), cuenta regresiva de 10 s y anuncios | Sin límite y sin anuncios |
| Por qué debo | Solo el saldo; para entenderlo hay que revisar gasto por gasto | **Cada deuda se explica:** qué gastos, cuándo, cuánto de cada uno, y si ya se saldó (con qué pago y en qué fecha) |
| Estado de cada gasto | No existe | Pendiente · quedan RD$ X · saldado el 1 nov · se compensó con «Cena…» |
| Permisos | Cualquiera puede editar o borrar cualquier gasto | Roles (admin / miembro), quién puede editar qué e historial visible |
| Simplificar deudas | Confunde: te pide pagarle a alguien a quien nunca le debiste; desactivarla desvía pagos | Opcional y explicada. Cada pago "en cadena" se registra como pagos directos, así el porqué sigue cuadrando |
| Multimoneda | Saldos separados por moneda; la conversión es Pro, manual y casi irreversible | Tasa del día guardada en cada gasto y saldos convertibles a una moneda en vivo, sin tocar el historial |
| Ítems | Pro, no se combina con partes y no funciona con una foto ya subida | Gratis: OCR o foto existente, ITBIS + ley 10 % + descuento repartidos en proporción, combinable con partes |
| Pagos | Solo EE. UU. / parte de la UE (Venmo, PayPal, Splitwise Pay) | Datos bancarios del que cobra (copiar en un toque), QR, efectivo y **confirmación de recibido** |
| Saldar todo | Crea asientos que no se actualizan si editas el pago | Asientos vinculados: editar o borrar el pago los recalcula |
| Actividad | No se puede limpiar; en móvil solo muestra 100 eventos | Infinita, con filtros y "marcar todo leído" |
| Búsqueda y gráficos | Pro | Incluidos |
| Personas sin cuenta | El "miembro marcador" solo existe en la web | En el móvil. Cuando la persona se registra, reclama su historial |

## 2. Base PWA y técnicas móviles

- **Instalable:** manifest, iconos, splash, `display: standalone`, `theme-color` para claro y oscuro.
- **Service worker:** shell offline, cola de cambios offline con sincronización y conflictos resueltos por versión.
- **Contenedor `100dvh`:** la página nunca hace scroll; solo hacen scroll los contenedores internos (`overscroll-behavior: none / contain`).
  - Sin rebote de página ni pull-to-refresh del navegador.
  - Tenemos nuestro propio pull-to-refresh.
- **Sin zoom:**
  - inputs de 16 px (iOS no hace zoom al enfocar);
  - `touch-action: manipulation` (sin zoom por doble toque);
  - `touch-action: pan-x pan-y` + `gesturestart` (sin pellizco).
  - ⚠️ Bloquear el pellizco afecta la accesibilidad; lo hacemos porque se pidió.
- **Zonas seguras:** `viewport-fit=cover`, `env(safe-area-inset-*)` en la barra de pestañas, las hojas y los toasts.
- **Toques:**
  - sin destello al tocar;
  - hover solo con `(hover: hover) and (pointer: fine)`;
  - `user-select: none` solo en controles;
  - respuesta al presionar (`scale .97`, 100–160 ms ease-out).
- **Gestos:**
  - hojas inferiores que se cierran arrastrando (cuenta la velocidad);
  - volver deslizando desde el borde;
  - filas con acción al deslizar (scroll-snap nativo);
  - carruseles con scroll-snap.
- **Navegación:**
  - barra de pestañas (Inicio · Grupos · **+** · Actividad · Cuenta);
  - pantallas que entran desde la derecha con la curva tipo iOS;
  - cambiar de pestaña es instantáneo, sin animación.
- **Teclado:**
  - teclado numérico propio para el monto;
  - `inputmode="decimal"` y `enterkeyhint` en el resto;
  - `interactive-widget=resizes-content`.
- **APIs del dispositivo:** vibración (Android), Web Share (WhatsApp), Share Target (compartir una foto de factura a la app), Badging (contador en el icono), cámara, Contact Picker (Android) y Web Push (iOS 16.4+ instalada).
- **Accesibilidad e idioma:** modo oscuro, `prefers-reduced-motion`, español por defecto, RD$ con formato 1,234.56.

## 3. Funciones

### Cuenta y onboarding
- Entrada con código por email (OTP), Google y Apple.
- Perfil: foto, nombre, teléfono, moneda por defecto, idioma, zona horaria, formato de fecha.
- **Dónde me pagan:** cuentas bancarias y otros métodos, visibles para quien te va a pagar.
- Código o biometría para abrir la app (WebAuthn).
- Cerrar sesión en todos los dispositivos, exportar todos los datos, borrar la cuenta.
- Primer uso: crear el primer grupo o gasto en menos de 30 s.

### Amigos
- Agregar por email, teléfono, contactos, enlace personal o QR.
- Invitar a quien no tiene cuenta (miembro "marcador"); al registrarse reclama su historial.
- Saldo por amigo, desglosado por grupo. **Pantalla "Por qué":** cada gasto con fecha, monto y estado.
- Recordar (push o email, con tono amable).
- Bloquear y reportar.
- Eliminar solo si están a mano.

### Grupos
- Tipos: Casa, Viaje, Pareja, Otro. Foto y portada.
- Invitación por enlace o QR, con opción de resetear el enlace.
- Roles admin / miembro.
- **Quién le debe a quién:** cada deuda se despliega y muestra su porqué.
- Simplificar deudas (opcional y explicada).
- División por defecto del grupo y plantillas de división.
- Pizarra de notas con control de concurrencia.
- Presupuesto de viaje.
- Archivar; salir (solo a mano); borrar y restaurar.

### Gastos
- Campos: descripción, monto, moneda, fecha, categoría, notas, recibo o adjunto, comentarios.
- **Varios pagadores**, cada uno con su monto.
- **Formas de dividir:**
  - partes iguales (eligiendo quiénes entran);
  - montos exactos;
  - porcentajes;
  - partes (acciones);
  - extra o ajuste;
  - ítems (ITBIS, ley 10 % y descuento en proporción);
  - reembolso.
- Validación en vivo ("faltan RD$ 120", "sobra 5 %").
- Centavos repartidos de forma justa (resto mayor).
- Categoría sugerida a partir de la descripción.
- Historial de cambios ("el monto cambió de X a Y").
- Borrar con **Deshacer** y restaurar desde Actividad.
- Recurrentes:
  - frecuencia semanal, quincenal, mensual o anual;
  - recordatorio de 0 a 14 días antes;
  - "solo esta vez" o "cancelar las siguientes".
- Escribir un gasto en lenguaje natural ("cena 3,450 con Laura y Miguel") → gasto armado.

### Saldos y saldar
- **Inicio:** te deben / debes / neto, y por persona: cuánto, cuántos gastos sin saldar y desde cuándo.
- **Estado por movimiento:** los pagos y gastos en sentido contrario cierran primero lo más viejo. Cada deuda muestra:
  - pendiente;
  - "quedan RD$ X";
  - "saldado 20 oct", con qué pago o gasto la cerró.
- **Registrar un pago** (total o parcial; transferencia o efectivo):
  - el cobrador **confirma** que recibió;
  - si el pago cubre varios grupos, se reparte entre ellos de forma automática.
- Resumen del viaje para compartir por WhatsApp y exportar en PDF o CSV.

### Actividad y notificaciones
- Feed infinito con filtros: persona, grupo, tipo.
- Avisos por push y email, configurables por tipo:
  - gasto agregado, editado, borrado o restaurado;
  - comentario;
  - agregado o removido de un grupo;
  - grupo borrado, restaurado o con ajustes cambiados;
  - amigo agregado o removido;
  - simplificación;
  - conversión de moneda;
  - pago registrado o confirmado;
  - recordatorio;
  - resumen mensual.

### Monedas, búsqueda e informes
- **Monedas:**
  - todas las ISO 4217;
  - tasa del día del gasto (Open Exchange Rates o similar);
  - saldos convertidos en vivo a tu moneda.
- **Búsqueda:** texto completo y filtros (persona, categoría, fechas, monto).
- **Totales por mes o histórico:**
  - lo que pagaste;
  - tu parte;
  - pagos hechos y recibidos;
  - gasto por categoría.
- **Exportar:** CSV por grupo, respaldo JSON de la cuenta.

### Categorías (dos niveles)
- **Casa:** Alquiler, Hipoteca, Muebles, Electrodomésticos, Mantenimiento, Artículos del hogar, Mascotas, Servicios.
- **Servicios básicos:** Luz, Agua, Gas, Internet / TV / Teléfono, Basura, Limpieza.
- **Comida y bebida:** Supermercado, Restaurantes, Alcohol.
- **Transporte:** Gasolina, Taxi / Uber, Guagua / Metro, Avión, Parqueo, Peaje, Carro, Hotel.
- **Entretenimiento:** Juegos, Cine, Música, Deportes, Excursiones.
- **Vida:** Salud, Ropa, Educación, Regalos, Seguros, Cuidado de niños, Impuestos.
- **General**

## 4. Supabase: qué necesito de ti

1. **Project URL** y **anon (publishable) key**. Las pones tú en `.env.local`; no las pegues en el chat.
2. **Migraciones:** `supabase login` + `supabase link --project-ref <ref>` en tu máquina, o la contraseña de la base en tu `.env` local.
3. **Auth:**
   - Email OTP activado;
   - Google y Apple (client IDs y secrets, configurados por ti en el panel);
   - URLs de redirect de la PWA (local y producción).
4. **SMTP propio** (Resend, Postmark…). El de Supabase tiene límites muy bajos.
5. **Storage:** buckets `avatars` (público) y `receipts` (privado, con políticas por grupo).
6. **Extensiones:** `pg_cron` (recurrentes, recordatorios, resumen mensual) y `pg_net`.
7. **Secrets de Edge Functions:**
   - claves VAPID (push);
   - clave de la API de visión para el OCR de recibos;
   - clave de la API de tasas de cambio.
8. **Plan:** el gratis sirve para desarrollar. Para producción, Pro (sin pausa por inactividad, con backups).

## 5. Esquema (borrador)

Montos en **centavos `bigint`**, siempre con su `currency`. Borrado suave con `deleted_at`/`deleted_by` en gastos, grupos y comentarios. RLS en todas las tablas.

- **Personas y grupos**
  - `profiles` (id = auth.users, name, phone, avatar_url, default_currency, locale, timezone, date_format, status: confirmed|placeholder|invited, claimed_by)
  - `payout_methods` (user_id, kind: bank|cash|paypal|otro, bank, account_type, account_last4, account_full_encrypted, holder_name, is_default)
  - `friendships` (user_a, user_b, created_at; una fila por pareja con `user_a < user_b`)
  - `blocks` (blocker, blocked)
  - `groups` (name, kind, cover_url, simplify_debts, default_split jsonb, budget_cents, whiteboard, whiteboard_version, invite_token, archived_at)
  - `group_members` (group_id, user_id, role: admin|member, joined_at, left_at)
  - `invites` (token, group_id?, inviter, email/phone, accepted_by, expires_at)
- **Gastos**
  - `expenses` (group_id?, description, notes, category_id, date, currency, amount_cents, fx_rate_to_base, split_mode, split_params jsonb, is_payment, payment_method, payment_status: pending|confirmed, confirmed_at, repeat_rule_id?, bundle_id?, created_by, updated_by)
  - `expense_payers` (expense_id, user_id, amount_cents)
  - `expense_shares` (expense_id, user_id, amount_cents)
  - `expense_items` (expense_id, name, amount_cents, qty) + `item_assignments` (item_id, user_id, weight)
  - `expense_extras` (expense_id, kind: tax|tip|discount, rate, amount_cents)
  - `receipts` (expense_id, storage_path, ocr_json, ocr_status)
  - `expense_revisions` (expense_id, changed_by, at, diff jsonb), que alimenta el historial de cambios
  - `comments` (expense_id, user_id, body, kind: user|system)
  - `recurring_rules` (template jsonb, interval, next_run, remind_days_before, ends_at)
  - `split_templates` (group_id, name, params jsonb)
- **Catálogos**
  - `categories` (id, parent_id, name, icon)
  - `currencies` (code, name, symbol, minor_units)
  - `exchange_rates` (date, base, quote, rate)
- **Avisos**
  - `activity` (actor, verb, subject_type, subject_id, group_id, payload jsonb, created_at)
  - `notifications` (user_id, activity_id, read_at)
  - `notification_prefs` (user_id, verb, push, email)
  - `push_subscriptions` (user_id, endpoint, p256dh, auth, ua)

**Lógica en la base (RPC / vistas)**
- `create_expense(payload)` / `update_expense`: transaccionales. Validan que pagadores y partes sumen el monto, guardan la revisión y emiten actividad.
- `pair_ledger(a, b, group?)`: movimientos entre dos personas con su estado (pendiente / quedan / saldado con X). Es el corazón de la pantalla "Por qué".
- Vistas `balances_by_pair`, `balances_by_group` y `balances_by_user`.
- `simplify_debts(group)`: plan de pagos mínimo; al pagar, se descompone en pagos directos.
- `record_payment(from, to, amount, group?)`: reparte el pago entre grupos y crea los asientos vinculados.
- `confirm_payment(id)`.
- **Realtime** en `expenses`, `comments`, `activity` y `notifications`.
- **Edge Functions:**
  - `ocr-receipt`;
  - `send-push`;
  - `fx-daily` (cron);
  - `run-recurring` (cron);
  - `monthly-summary` (cron).

## 6. Diseños de ejemplo

Los dos comparten los datos, la lógica y los gestos (`disenos/shared.js` y `shared.css`); cambian el estilo y la pantalla de inicio.

- **A · Pastel** (`disenos/a-pastel.html`):
  - cada persona tiene su tono;
  - tarjetas de 20 px de radio, letra Manrope;
  - en Inicio, mosaicos por persona con cuánto, cuántos gastos y desde cuándo.
- **B · Libreta** (`disenos/b-libreta.html`):
  - estado de cuenta en tinta, letra Geist;
  - barras divergentes por persona;
  - cada gasto con su fecha a la izquierda y el saldo acumulado.

Datos de ejemplo: un viaje a Samaná, un apartamento en Naco y un almuerzo. Todos los montos cuadran: hay `console.assert` en los datos.

## 7. Fuera de la v1
- Tarjeta de débito propia.
- Importar movimientos del banco.
- Billetera con saldo.
- Pagos procesados dentro de la app: solo los registramos y confirmamos.
