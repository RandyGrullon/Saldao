// Iconos de trazo 24×24, los mismos de la web: una sola familia y un solo grosor.
import { Circle, G, Path, Rect, Svg } from 'react-native-svg';
import { useC } from '../lib/theme';

const P = {
  home: <><Path d="M3 10.5 12 3l9 7.5" /><Path d="M5 9.5V21h14V9.5" /></>,
  bolt: <Path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  drop: <Path d="M12 2.7s-6 6.4-6 11.3a6 6 0 0 0 12 0c0-4.9-6-11.3-6-11.3z" />,
  wifi: <><Path d="M5 12.55a11 11 0 0 1 14.08 0" /><Path d="M1.42 9a16 16 0 0 1 21.16 0" /><Path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><Path d="M12 20h.01" /></>,
  cart: <><Circle cx="8" cy="21" r="1" /><Circle cx="19" cy="21" r="1" /><Path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></>,
  fuel: <><Path d="M3 22h12" /><Path d="M4 9h10" /><Path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" /><Path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" /></>,
  car: <><Path d="M5 17h14v-5l-2-5H7l-2 5v5z" /><Path d="M5 12h14" /><Circle cx="8" cy="17" r="2" /><Circle cx="16" cy="17" r="2" /></>,
  bed: <><Path d="M2 4v16" /><Path d="M2 8h18a2 2 0 0 1 2 2v10" /><Path d="M2 17h20" /><Path d="M6 8v9" /></>,
  food: <><Path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><Path d="M7 2v20" /><Path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" /></>,
  compass: <><Circle cx="12" cy="12" r="10" /><Path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" /></>,
  heart: <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  gift: <><Rect x="3" y="8" width="18" height="4" rx="1" /><Path d="M12 8v13" /><Path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><Path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></>,
  receipt: <><Path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><Path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><Path d="M12 17.5v-11" /></>,
  swap: <><Path d="m16 3 4 4-4 4" /><Path d="M20 7H4" /><Path d="m8 21-4-4 4-4" /><Path d="M4 17h16" /></>,
  left: <Path d="m15 18-6-6 6-6" />,
  right: <><Path d="M5 12h14" /><Path d="m12 5 7 7-7 7" /></>,
  plus: <><Path d="M5 12h14" /><Path d="M12 5v14" /></>,
  users: <><Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><Circle cx="9" cy="7" r="4" /><Path d="M22 21v-2a4 4 0 0 0-3-3.87" /><Path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  bell: <><Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  user: <><Circle cx="12" cy="8" r="5" /><Path d="M20 21a8 8 0 0 0-16 0" /></>,
  copy: <><Rect width="14" height="14" x="8" y="8" rx="2" /><Path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
  check: <Path d="M20 6 9 17l-5-5" />,
  trash: <><Path d="M3 6h18" /><Path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><Path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></>,
  repeat: <><Path d="m17 2 4 4-4 4" /><Path d="M3 11v-1a4 4 0 0 1 4-4h14" /><Path d="m7 22-4-4 4-4" /><Path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  del: <><Path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><Path d="m18 9-6 6" /><Path d="m12 9 6 6" /></>,
  send: <><Path d="m22 2-7 20-4-9-9-4Z" /><Path d="M22 2 11 13" /></>,
  cal: <><Rect width="18" height="18" x="3" y="4" rx="2" /><Path d="M16 2v4" /><Path d="M8 2v4" /><Path d="M3 10h18" /></>,
  share: <><Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><Path d="m16 6-4-4-4 4" /><Path d="M12 2v13" /></>,
  link: <><Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  edit: <><Path d="M12 20h9" /><Path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  out: <><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><Path d="m16 17 5-5-5-5" /><Path d="M21 12H9" /></>,
  eye: <><Path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" /><Circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><Path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.82 0 8.68 3.06 9.94 6.65a1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49" /><Path d="M14.08 14.16a3 3 0 0 1-4.24-4.24" /><Path d="M17.48 17.5A10.75 10.75 0 0 1 2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14" /><Path d="m2 2 20 20" /></>,
  mail: <><Rect width="20" height="16" x="2" y="4" rx="2" /><Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  chevR: <Path d="m9 18 6-6-6-6" />,
  moon: <Path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  sun: <><Circle cx="12" cy="12" r="4" /><Path d="M12 2v2" /><Path d="M12 20v2" /><Path d="m4.93 4.93 1.41 1.41" /><Path d="m17.66 17.66 1.41 1.41" /><Path d="M2 12h2" /><Path d="M20 12h2" /><Path d="m6.34 17.66-1.41 1.41" /><Path d="m19.07 4.93-1.41 1.41" /></>,
  phone: <><Rect width="14" height="20" x="5" y="2" rx="2" /><Path d="M12 18h.01" /></>,
};
export type IconName = keyof typeof P;

const Google = ({ size }: { size: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
    <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <Path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
    <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
  </Svg>
);

/** `sm` es el chico (16), lo normal 20; `size` para otros tamaños. El color sigue al texto que lo acompaña. */
export function Icon({ n, sm, size, color, weight = 2 }: { n: IconName | 'google'; sm?: boolean; size?: number; color?: string; weight?: number }) {
  const c = useC(), s = size ?? (sm ? 16 : 20);
  if (n === 'google') return <Google size={s} />;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <G fill="none" stroke={color ?? c.fg} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">{P[n]}</G>
    </Svg>
  );
}
