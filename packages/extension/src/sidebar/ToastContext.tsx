import { createContext, useContext } from 'react';
import type { ToastVariant } from './hooks/useToast';

type ShowToastFn = (text: string, variant?: ToastVariant) => void;

export const ToastContext = createContext<ShowToastFn>(() => {});

export function useToastContext(): ShowToastFn {
  return useContext(ToastContext);
}
