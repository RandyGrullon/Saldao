// Texto con las fuentes y colores del tema. `f` es la fuente (con su peso), `s` el tamaño y `c` el color del tema.
import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { F, useC, type Colors } from '../lib/theme';

type ColorKey = { [K in keyof Colors]: Colors[K] extends string ? K : never }[keyof Colors];
export interface TxtProps {
  f?: keyof typeof F; s?: number; c?: ColorKey; color?: string; lh?: number; lines?: number; center?: boolean; selectable?: boolean;
  style?: StyleProp<TextStyle>; children?: ReactNode; onPress?: () => void;
}

export function Txt({ f = 'regular', s = 16, c = 'fg', color, lh, lines, center, selectable, style, children, onPress }: TxtProps) {
  const t = useC();
  const display = f === 'display' || f === 'displaySemi';
  return (
    <Text numberOfLines={lines} selectable={selectable} maxFontSizeMultiplier={1.4} onPress={onPress} suppressHighlighting
      accessibilityRole={onPress ? 'link' : undefined}
      style={[{ fontFamily: F[f], fontSize: s, color: color ?? t[c], lineHeight: lh ?? Math.round(s * (display ? 1.2 : 1.4)),
        letterSpacing: display ? -0.03 * s : -0.01 * s }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

/** Negrita dentro de un texto (hereda tamaño; el color, el del texto principal). */
export function B({ children }: { children: ReactNode }) {
  const t = useC();
  return <Text style={{ fontFamily: F.bold, color: t.fg }}>{children}</Text>;
}

/** Título grande de cada sección (Unbounded). */
export const H1 = ({ children, s = 27 }: { children: ReactNode; s?: number }) => <Txt f="display" s={s} lh={Math.round(s * 1.26)}>{children}</Txt>;
export const H2 = ({ children }: { children: ReactNode }) => <Txt f="displaySemi" s={16}>{children}</Txt>;
