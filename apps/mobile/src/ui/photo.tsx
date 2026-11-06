import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Path, Rect, Svg } from 'react-native-svg';
import { getBackend, qrPath, type Group } from '@saldao/core';
import { useC } from '../lib/theme';
import { Icon, type IconName } from './icons';
import { tr } from '@saldao/core';

export const KIND_IC: Record<string, IconName> = { casa: 'home', viaje: 'compass', pareja: 'heart', otro: 'users', directo: 'swap' };

// Las fotos están en un almacenamiento privado: se ven con una dirección firmada que dura una hora.
const cache = new Map<string, string>();
export function usePhotoUrl(path?: string | null) {
  const [url, setUrl] = useState(() => (path && cache.get(path)) || '');
  useEffect(() => {
    if (!path) { setUrl(''); return; }
    const hit = cache.get(path);
    if (hit) { setUrl(hit); return; }
    let live = true;
    getBackend()?.photoUrl(path).then(u => { if (u) cache.set(path, u); if (live) setUrl(u); }, () => {});
    return () => { live = false; };
  }, [path]);
  return url;
}

/** La foto del grupo o, si no tiene, el ícono de su tipo en su caja. */
export function GroupPhoto({ g, size = 40 }: { g: Group; size?: number }) {
  const c = useC(), url = usePhotoUrl(g.photoPath), r = Math.round(size * 0.3);
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: r, backgroundColor: c.surface2 }} accessibilityIgnoresInvertColors />;
  return <View style={{ width: size, height: size, borderRadius: r, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
    <Icon n={KIND_IC[g.kind]} size={Math.round(size * 0.5)} color={c.accentInk} /></View>;
}

/** Un QR (blanco siempre: las cámaras lo leen mejor). */
export function Qr({ text, size = 260 }: { text: string; size?: number }) {
  const q = qrPath(text);
  return (
    <View style={{ alignSelf: 'center', padding: 14, borderRadius: 22, backgroundColor: '#fff' }} accessibilityRole="image" accessibilityLabel={tr("Código QR con tus datos de cobro")}>
      <Svg width={size} height={size} viewBox={`-2 -2 ${q.size + 4} ${q.size + 4}`}>
        <Rect x={-2} y={-2} width={q.size + 4} height={q.size + 4} fill="#fff" />
        <Path d={q.d} fill="#0e0f13" />
      </Svg>
    </View>
  );
}
