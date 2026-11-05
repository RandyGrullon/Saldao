// Tema de la app en este teléfono: de noche (lo de siempre), claro o como el teléfono. index.html lo pone antes de pintar.
export type ThemeMode = 'dark' | 'light' | 'auto';
const KEY = 'saldao:tema';
const BAR = { dark: '#0e0f13', light: '#f6f5f0' };
const lightMq = () => matchMedia('(prefers-color-scheme: light)');

export function loadTheme(): ThemeMode {
  try { const m = localStorage.getItem(KEY); return m === 'light' || m === 'auto' ? m : 'dark'; } catch { return 'dark'; }
}

function paint(m: ThemeMode) {
  const root = document.documentElement;
  if (m === 'dark') root.removeAttribute('data-theme'); else root.dataset.theme = m;
  const light = m === 'light' || (m === 'auto' && lightMq().matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? BAR.light : BAR.dark);
}

// Con «como el teléfono», la barra del sistema sigue al teléfono si cambia de claro a oscuro con la app abierta.
let follow: (() => void) | null = null;
export function saveTheme(m: ThemeMode) {
  try { localStorage.setItem(KEY, m); } catch { /* sin almacenamiento: vale hasta cerrar la app */ }
  paint(m);
  if (follow) { lightMq().removeEventListener('change', follow); follow = null; }
  if (m === 'auto') { follow = () => paint('auto'); lightMq().addEventListener('change', follow); }
}
