import React, { createContext, useCallback, useContext, useState } from 'react';
import type { Task } from '@/types';

export interface ModalState {
  kind: 'task' | 'goal' | 'note' | null;
  task?: Task;
  defaultDate?: string;
  rescheduleMode?: boolean;
}

interface UICtx {
  modal: ModalState;
  openModal: (m: ModalState) => void;
  closeModal: () => void;
  refreshKey: number;
  refresh: () => void;
}

const Ctx = createContext<UICtx>(null as any);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<ModalState>({ kind: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const closeModal = useCallback(() => setModal({ kind: null }), []);
  const openModal = useCallback((m: ModalState) => setModal(m), []);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  return <Ctx.Provider value={{ modal, openModal, closeModal, refreshKey, refresh }}>{children}</Ctx.Provider>;
}

export const useUI = () => useContext(Ctx);
