import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

// iOS ignora user-scalable=no en el navegador: sin esto, el pellizco haría zoom.
document.addEventListener('gesturestart', e => e.preventDefault());

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
