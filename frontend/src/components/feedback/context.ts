import { createContext, useContext } from 'react';

export type ToastVariant = 'success' | 'danger' | 'warning' | 'info' | 'dark';

export interface ToastOptions {
  variant?: ToastVariant;
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'warning';
}

export interface Feedback {
  toast: (message: string, options?: ToastOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export const FeedbackContext = createContext<Feedback | null>(null);

export const useFeedback = () => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('FeedbackProvider가 필요합니다.');
  return ctx;
};
