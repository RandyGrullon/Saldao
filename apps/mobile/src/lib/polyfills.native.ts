// En el teléfono faltan dos cosas que supabase-js y el núcleo usan: URL completa y crypto.randomUUID.
import 'react-native-url-polyfill/auto';
import * as Crypto from 'expo-crypto';

const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: <T extends ArrayBufferView>(a: T) => T } };
if (!g.crypto) g.crypto = {};
if (!g.crypto.randomUUID) g.crypto.randomUUID = () => Crypto.randomUUID();
if (!g.crypto.getRandomValues) g.crypto.getRandomValues = a => Crypto.getRandomValues(a as unknown as Uint8Array) as unknown as typeof a;
