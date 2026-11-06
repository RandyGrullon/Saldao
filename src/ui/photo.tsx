import { useEffect, useState } from 'react';
import { getBackend, type Group } from '@saldao/core';
import { Icon, type IconName } from './icons';

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

/** La foto del grupo o, si no tiene, el ícono de su tipo. */
export function GroupPhoto({ g, size = 40 }: { g: Group; size?: number }) {
  const url = usePhotoUrl(g.photoPath);
  if (url) return <img className="g-photo" src={url} alt="" style={{ width: size, height: size }} />;
  return <span className="row-ic accent" style={{ width: size, height: size }} aria-hidden="true"><Icon n={KIND_IC[g.kind]} /></span>;
}
