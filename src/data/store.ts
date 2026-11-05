// El almacén vive en el núcleo (sin React); aquí solo se conecta con los componentes.
import { useSyncExternalStore } from 'react';
import { getSnap, isBusy, onBusy, onSnap, type Snapshot } from '@saldao/core';

export const useSnap = (): Snapshot | null => useSyncExternalStore(onSnap, getSnap);
export const useBusy = (): boolean => useSyncExternalStore(onBusy, isBusy);
