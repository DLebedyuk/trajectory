import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { IconCheck } from './icons.js';

interface ToastItem {
  id: number;
  text: string;
}
interface ToastApi {
  show: (text: string) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, text }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 2600);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-root" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className="toast">
            <IconCheck />
            <span>{i.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = (): ToastApi => useContext(ToastContext);
