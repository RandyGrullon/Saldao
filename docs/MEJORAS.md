# Las 20 mejoras (web y app nativa)

Cada una va en las dos apps sobre el mismo núcleo (`packages/core`). Lo que necesita la base va en una sola migración
(`supabase/migrations/20261107000000_mejoras.sql`); lo que necesita un servicio de afuera va en funciones de Supabase
(`supabase/functions/`) y se activa al poner su clave.

| # | Mejora | Dónde vive | Necesita de ti |
|---|--------|-----------|----------------|
| 1 | Escanear el recibo | función `leer-recibo` (Claude con visión) + hoja de gasto | clave de Anthropic en Supabase y desplegar la función |
| 2 | Gastos que se repiten | `catch_up_recurring()` en la base; se ponen al día al abrir | — |
| 3 | Gastos de siempre (plantillas) | núcleo: los que más repites, a un toque al anotar | — |
| 4 | Foto del comprobante | almacenamiento `adjuntos` con permisos por grupo | — |
| 5 | Tasa del dólar automática | núcleo: la del día al elegir US$ | — |
| 6 | Avisos en el teléfono | función `avisar` + Web Push y Expo | claves VAPID en Supabase; en el teléfono, una compilación propia (Expo Go no recibe avisos en Android) |
| 7 | Recordatorios automáticos | núcleo: quién te debe hace más de 15 días, en Inicio | — |
| 8 | Simplificar deudas | grupo con `simplify`: menos pagos | — |
| 9 | Código QR para cobrar | tus datos de cobro y el monto en un QR | — |
| 10 | Fondo común | una «persona» fondo en el grupo: aportes y gastos del fondo | — |
| 11 | Resumen del mes | núcleo: gasto por categoría, grupo y persona | — |
| 12 | Presupuesto por grupo | `budget` en el grupo, barra y aviso | — |
| 13 | Buscar y filtrar | núcleo: texto, persona, categoría, fecha | — |
| 14 | Exportar | CSV para Excel (y PDF imprimiendo desde la web) | — |
| 15 | Administrar el grupo | renombrar, foto, roles, archivar y salir | — |
| 16 | Dividir por noches | forma de dividir «Noches» (partes con su nombre) | — |
| 17 | Lista de compras | tabla `group_items`, en tiempo real | — |
| 18 | Bloqueo con Face ID o huella | web: WebAuthn; nativa: el sistema | — |
| 19 | Contador en el ícono | web: la insignia de la app instalada; nativa: la del sistema | un widget de verdad pide una compilación propia (no Expo Go) |
| 20 | Inglés | diccionarios en el núcleo y en cada app | — |

## Estado

- [ ] Migración y pruebas de la base
- [ ] Núcleo
- [ ] Web
- [ ] App nativa
- [ ] Funciones de servidor
- [ ] Inglés
