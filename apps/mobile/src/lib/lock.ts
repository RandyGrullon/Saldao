// Bloqueo con Face ID, huella o el PIN del teléfono al abrir la app (y al volver después de cinco minutos).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

const KEY = 'saldao:bloqueo';

export async function lockSupported(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try { return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()); } catch { return false; }
}
export const lockOn = async () => (await AsyncStorage.getItem(KEY).catch(() => null)) === '1';

export async function unlock(): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Desbloquea Saldao', cancelLabel: 'Cancelar', disableDeviceFallback: false });
  return r.success;
}
export async function enableLock() {
  if (!(await unlock())) throw new Error('No se pudo comprobar. Intenta de nuevo.');
  await AsyncStorage.setItem(KEY, '1');
}
export const disableLock = () => AsyncStorage.removeItem(KEY);
