import { Tabs } from 'expo-router';
import { useC } from '../../lib/theme';
import { TabBar } from '../../ui/tabbar';

// Como en la web: cuatro secciones y ningún botón en el centro. «Añadir gasto» va en la tarjeta principal de Inicio,
// de cada grupo y de cada persona, que ya saben con quién es el gasto.
export default function TabsLayout() {
  const c = useC();
  return (
    <Tabs tabBar={p => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg }, animation: 'fade' }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="grupos" />
      <Tabs.Screen name="actividad" />
      <Tabs.Screen name="cuenta" />
    </Tabs>
  );
}
