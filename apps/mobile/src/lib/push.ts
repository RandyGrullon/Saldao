// Avisos en el teléfono (Expo): el permiso, el token y lo que pasa al tocarlos. Necesitan una compilación propia de la
// app (con su proyecto de Expo): Expo Go en Android ya no recibe avisos.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { getBackend } from '@saldao/core';
import { tr } from '@saldao/core';

const KEY = 'saldao:aviso-token';
const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
const inExpoGo = Constants.executionEnvironment === 'storeClient';

/** null si se puede; si no, por qué. */
export function pushUnavailable(): string | null {
  if (Platform.OS === 'web') return tr("En el navegador se activan desde la web de Saldao.");
  if (!Device.isDevice) return tr("Los avisos solo llegan a un teléfono de verdad.");
  if (inExpoGo && Platform.OS === 'android') return tr("En Expo Go para Android no llegan avisos: hace falta la app instalada.");
  if (!projectId) return tr("Los avisos llegan con la app instalada (falta conectarla a su proyecto de Expo).");
  return null;
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
  });
  // al tocar un aviso, a donde corresponde (un gasto, un grupo)
  Notifications.addNotificationResponseReceivedListener(r => {
    const url = r.notification.request.content.data?.path as string | undefined;
    if (url) setTimeout(() => router.push(url as never), 300);
  });
}

export async function pushOn(): Promise<boolean> {
  if (pushUnavailable()) return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' && !!(await AsyncStorage.getItem(KEY));
}
export async function enablePush() {
  const why = pushUnavailable();
  if (why) throw new Error(why);
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: tr("Saldao"), importance: Notifications.AndroidImportance.DEFAULT });
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') throw new Error(tr("El teléfono no dio permiso para avisos. Actívalo en los ajustes."));
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await getBackend()!.savePushToken('expo', token);
  await AsyncStorage.setItem(KEY, token);
}
export async function disablePush() {
  const token = await AsyncStorage.getItem(KEY);
  if (token) await getBackend()?.deletePushToken(token).catch(() => {});
  await AsyncStorage.removeItem(KEY);
}

/** Lo nuevo en Actividad, en el ícono de la app (iPhone y los Android que lo muestran). */
export const setBadge = (n: number) => { if (Platform.OS !== 'web') Notifications.setBadgeCountAsync(n).catch(() => {}); };
