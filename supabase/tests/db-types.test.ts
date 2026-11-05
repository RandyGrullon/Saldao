// Los tipos de la base que usa la app (packages/core) salen de las migraciones. Si cambias una migración, corre
// `npm run db:types` para escribirlos de nuevo; esta prueba falla mientras no coincidan.
import { expect, it } from 'vitest';
import { migratedDb } from './db';
import { dbTypes } from './db-types';

it('los tipos de la base están al día con las migraciones', async () => {
  const types = await dbTypes(await migratedDb());
  await expect(types).toMatchFileSnapshot('../../packages/core/src/database.types.ts');
}, 60000);
