// El almacén vive en el núcleo (sin React); aquí solo se conecta con los componentes.
import { useSyncExternalStore } from 'react';
import { getSnap, getSync, isBusy, onBusy, onSnap, onSync, type Snapshot, type SyncState } from '@saldao/core';

export const useSnap = (): Snapshot | null => useSyncExternalStore(onSnap, getSnap);
export const useBusy = (): boolean => useSyncExternalStore(onBusy, isBusy);
export const useSync = (): SyncState => useSyncExternalStore(onSync, getSync);
/** Dentro de la app ya hay foto: las pantallas la usan sin preguntar. */
export const useS = () => useSnap() as Snapshot;
