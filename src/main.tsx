import { createRoot } from 'react-dom/client';
import { getLang, LANG_KEY, setLang } from '@saldao/core';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

// iOS ignora user-scalable=no en el navegador: sin esto, el pellizco haría zoom.
document.addEventListener('gesturestart', e => e.preventDefault());

// el idioma: español, o inglés si se eligió en Cuenta (antes de dibujar nada)
let saved: string | null = null;
try { saved = localStorage.getItem(LANG_KEY); } catch { /* sin almacenamiento */ }
setLang(saved);
document.documentElement.lang = getLang();

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
