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
| 14 | Exportar | CSV para Excel y PDF (imprimir en la web; compartir en la nativa) | — |
| 15 | Administrar el grupo | renombrar, foto, fechas (de fecha a fecha), roles, quitar personas, archivar y salir | — |
| 16 | Dividir por noches | forma de dividir «Noches» (partes con su nombre) | — |
| 17 | Lista de compras | tabla `group_items`, en tiempo real | — |
| 18 | Bloqueo con Face ID o huella | web: WebAuthn; nativa: el sistema | — |
| 19 | Contador en el ícono | web: la insignia de la app instalada; nativa: la del sistema | un widget de verdad pide una compilación propia (no Expo Go) |
| 20 | Inglés | `tr()` y el diccionario `en.ts` en el núcleo, para las dos apps; se elige en Cuenta | — |

## Estado

- [x] Migraciones y pruebas de la base (`20261107000000_mejoras.sql` y `20261107010000_grupos_temporales.sql`)
- [x] Núcleo
- [x] Web
- [x] App nativa
- [x] Funciones de servidor (`leer-recibo` y `avisar`)
- [x] Inglés

### Para encenderlo en producción

1. Correr las dos migraciones, en orden, en el SQL Editor.
2. Poner los secretos de las funciones, publicarlas y crear el webhook de avisos (README › Conectar Supabase, paso 5).
3. Para avisos en el teléfono: una compilación propia de la app con su proyecto de Expo (Expo Go en Android no recibe
   avisos).
