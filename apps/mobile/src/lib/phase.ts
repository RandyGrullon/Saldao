// En qué punto está la app (entrar, cargando, lista o con un aviso) y el mensaje del aviso.
import { createContext, useContext } from 'react';

export type Phase = 'boot' | 'login' | 'loading' | 'ready' | 'setup' | 'error';
export const PhaseCtx = createContext<{ phase: Phase; err: string; retry: () => void }>({ phase: 'boot', err: '', retry: () => {} });
export const usePhase = () => useContext(PhaseCtx);
