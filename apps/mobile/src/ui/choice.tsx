// Elegir de una lista (grupo, categoría, fecha) en una hoja que sube desde abajo: el reemplazo nativo de <select>.
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fday, isoDay, today } from '@saldao/core';
import { buzz } from '../lib/nav';
import { R, useC } from '../lib/theme';
import { Chip, LinkBtn } from './base';
import { Icon, type IconName } from './icons';
import { Txt } from './text';

export type ChoiceGroup<T extends string> = { title?: string; options: [T, string][] };

function Bottom({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const c = useC(), insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[ch.scrim, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityLabel="Cerrar" />
      <View style={[ch.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 12 }]}>
        <View style={ch.head}><Txt f="semi" s={17}>{title}</Txt><LinkBtn title="Listo" strong onPress={onClose} /></View>
        {children}
      </View>
    </Modal>
  );
}

export function ChoiceChip<T extends string>({ icon, value, groups, onChange, title, disabled }: {
  icon: IconName; value: T; groups: ChoiceGroup<T>[]; onChange: (v: T) => void; title: string; disabled?: boolean;
}) {
  const c = useC();
  const [open, setOpen] = useState(false);
  const label = groups.flatMap(g => g.options).find(([k]) => k === value)?.[1] ?? '';
  return (
    <>
      <Chip title={label} label={`${title}: ${label}`} onPress={disabled ? undefined : () => setOpen(true)}
        left={<View style={{ paddingLeft: 8 }}><Icon n={icon} sm color={c.fg2} /></View>} />
      <Bottom open={open} onClose={() => setOpen(false)} title={title}>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
          {groups.map((g, gi) => (
            <View key={gi} style={{ gap: 2 }}>
              {g.title && <Txt f="semi" s={13} c="muted" style={{ marginTop: 8, marginLeft: 4 }}>{g.title}</Txt>}
              {g.options.map(([k, l]) => {
                const on = k === value;
                return (
                  <Pressable key={k} onPress={() => { buzz(); onChange(k); setOpen(false); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    style={({ pressed }) => [ch.opt, { backgroundColor: on ? c.accentSoft : pressed ? c.surface2 : 'transparent' }]}>
                    <Txt f={on ? 'semi' : 'regular'} color={on ? c.accentInk : c.fg} style={{ flex: 1 }}>{l}</Txt>
                    {on && <Icon n="check" sm color={c.accentInk} />}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </Bottom>
    </>
  );
}

/** La fecha del gasto: el calendario del teléfono (en Android su diálogo, en iPhone en una hoja). Nunca en el futuro. */
export function DateChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useC();
  const [open, setOpen] = useState(false);
  const d = new Date(`${value}T12:00:00`), label = value === today() ? 'Hoy' : fday(value);
  const pick = (x?: Date) => { if (x) { onChange(isoDay(x)); buzz(); } };
  const press = () => {
    if (Platform.OS === 'android') DateTimePickerAndroid.open({ value: d, mode: 'date', maximumDate: new Date(), onChange: (ev, x) => { if (ev.type === 'set') pick(x); } });
    else setOpen(true);
  };
  const days = Array.from({ length: 30 }, (_, i) => { const x = new Date(); x.setDate(x.getDate() - i); return isoDay(x); });
  return (
    <>
      <Chip title={label} label={`Fecha: ${label}`} onPress={press} left={<View style={{ paddingLeft: 8 }}><Icon n="cal" sm color={c.fg2} /></View>} />
      {Platform.OS === 'ios' && (
        <Bottom open={open} onClose={() => setOpen(false)} title="Fecha">
          <DateTimePicker value={d} mode="date" display="inline" maximumDate={new Date()} accentColor={c.accentInk} themeVariant={c.isDark ? 'dark' : 'light'}
            onChange={(_, x) => pick(x)} style={{ alignSelf: 'center' }} />
        </Bottom>
      )}
      {Platform.OS === 'web' && (
        <Bottom open={open} onClose={() => setOpen(false)} title="Fecha">
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 2 }}>
            {days.map(k => (
              <Pressable key={k} onPress={() => { onChange(k); setOpen(false); }} style={[ch.opt, k === value && { backgroundColor: c.accentSoft }]}>
                <Txt color={k === value ? c.accentInk : c.fg}>{k === today() ? 'Hoy' : fday(k)}</Txt>
              </Pressable>
            ))}
          </ScrollView>
        </Bottom>
      )}
    </>
  );
}

const ch = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet, paddingTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8, minHeight: 52 },
  opt: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 14, borderRadius: 12 },
});
