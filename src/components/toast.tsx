"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ToastAction = { label: string; run: () => void };
type Toast = { id: number; message: string; action?: ToastAction };
type Show = (message: string, options?: { action?: ToastAction; duration?: number }) => void;

const ToastContext = createContext<Show>(() => {});
export const useToast = () => useContext(ToastContext);

// Short messages at the bottom of the screen. A toast with an action stays a
// little longer, and pausing the pointer over it keeps it open.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const next = useRef(1);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);
  const arm = useCallback((id: number, duration: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => dismiss(id), duration));
  }, [dismiss]);

  const show = useCallback<Show>((message, options) => {
    const id = next.current++;
    setToasts((list) => [...list.filter((item) => item.message !== message).slice(-2), { id, message, action: options?.action }]);
    arm(id, options?.duration ?? (options?.action ? 7000 : 4000));
  }, [arm]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {mounted && createPortal(
        <div className="toast-region" role="status" aria-live="polite">
          {toasts.map((item) => (
            <div
              key={item.id}
              className="toast"
              onPointerEnter={() => clearTimeout(timers.current.get(item.id))}
              onPointerLeave={() => arm(item.id, 2500)}
            >
              <span>{item.message}</span>
              {item.action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    item.action!.run();
                    dismiss(item.id);
                  }}
                >
                  {item.action.label}
                </button>
              )}
              <button className="toast-close" aria-label="Dismiss notification" onClick={() => dismiss(item.id)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
