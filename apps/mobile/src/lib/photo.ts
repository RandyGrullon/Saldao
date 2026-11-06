// Fotos en la app nativa: la cámara o la galería, achicada (1600 px de lado, JPEG) para subirla liviana o mandarla a leer.
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { tr } from '@saldao/core';

export interface Photo { uri: string; base64: string; data: ArrayBuffer }

const toBuffer = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;

/** Abre la cámara (o la galería). Si la persona cancela o no da permiso: null. */
export async function pickPhoto(camera = true, max = 1600): Promise<Photo | null> {
  const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(camera ? tr("Saldao necesita la cámara para la foto. Actívala en los ajustes del teléfono.") : tr("Saldao necesita ver tus fotos. Actívalo en los ajustes del teléfono."));
  const res = camera
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const wide = (a.width || max) >= (a.height || max);
  const out = await manipulateAsync(a.uri, [{ resize: wide ? { width: Math.min(max, a.width || max) } : { height: Math.min(max, a.height || max) } }],
    { compress: 0.8, format: SaveFormat.JPEG, base64: true });
  return { uri: out.uri, base64: out.base64 ?? '', data: toBuffer(out.base64 ?? '') };
}
