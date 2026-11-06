import { sb } from '@saldao/core/supabase';
import { usePhase } from '../lib/phase';
import { Notice } from '../screens/auth';

/** Sin Supabase configurado, o la primera carga falló: qué pasó y qué hacer. */
export default function Aviso() {
  const { phase, err, retry } = usePhase();
  if (phase === 'setup') return (
    <Notice title="Falta conectar Supabase"
      text="Copia apps/mobile/.env.example como apps/mobile/.env.local con la URL y la anon key de tu proyecto y vuelve a arrancar. Para verla sin backend: npm run demo -w @saldao/mobile." />
  );
  return (
    <Notice title="No pudimos cargar tus cuentas" text={err}
      action={{ title: 'Intentar de nuevo', onPress: retry }} secondary={{ title: 'Cerrar sesión', onPress: () => { sb().auth.signOut().catch(() => {}); } }} />
  );
}
