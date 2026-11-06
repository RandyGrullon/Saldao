// La sesión de Supabase en el llavero del teléfono (Keychain en iPhone, Keystore en Android), cifrada por el sistema.
// El llavero guarda poco por valor (unos 2 KB) y la sesión pesa más: se parte en pedazos.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK = 1800;
const safe = (k: string) => k.replace(/[^\w.-]/g, '_'); // el llavero solo acepta letras, números, punto, guion y guion bajo

const keychain = {
  async getItem(key: string): Promise<string | null> {
    const k = safe(key), n = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    if (!n) return null;
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${k}.${i}`)));
    return parts.some(p => p == null) ? null : parts.join('');
  },
  async setItem(key: string, value: string) {
    const k = safe(key), old = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(`${k}.${i}`, parts[i]);
    await SecureStore.setItemAsync(`${k}.n`, String(parts.length));
    for (let i = parts.length; i < old; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
  },
  async removeItem(key: string) {
    const k = safe(key), n = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
  },
};

// En el navegador (solo para probar) no hay llavero: va al almacenamiento de la página.
export const sessionStore = Platform.OS === 'web' ? AsyncStorage : keychain;
