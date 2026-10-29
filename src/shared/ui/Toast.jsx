import { createContext, useCallback, useContext, useState } from 'react';

// Avisos rápidos no canto da tela ("Adicionado a Quero ver")
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const mostrar = useCallback((texto, tipo = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, texto, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={mostrar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-[subir_.2s_ease-out] rounded-xl border px-4 py-3 text-sm shadow-xl ${
              t.tipo === 'erro'
                ? 'border-cine-danger/50 bg-[#2a1215] text-red-200'
                : 'border-cine-border bg-cine-surface-2 text-cine-text'
            }`}
          >
            {t.texto}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
