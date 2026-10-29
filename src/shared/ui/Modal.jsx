import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Pilha de modais abertos: o Esc fecha só o de cima (ex.: nota aberta sobre os detalhes)
const pilha = [];

// Janela modal genérica: fecha com Esc, clique fora ou no X; trava a rolagem da página.
export default function Modal({ aberto, onFechar, titulo, children, largura = 'max-w-lg', semPadding = false }) {
  const painel = useRef(null);
  // Guarda a função mais recente sem reexecutar o efeito (evita roubar o foco a cada renderização)
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement;
    const eu = Symbol('modal');
    pilha.push(eu);
    const onKey = (e) => e.key === 'Escape' && pilha.at(-1) === eu && fechar.current();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    painel.current?.focus();
    return () => {
      pilha.splice(pilha.indexOf(eu), 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      anterior?.focus?.();
    };
  }, [aberto]);

  if (!aberto) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div
        ref={painel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`relative max-h-[92dvh] w-full ${largura} animate-[subir_.2s_ease-out] overflow-y-auto rounded-t-2xl border border-cine-border bg-cine-surface shadow-2xl outline-none sm:rounded-2xl`}
      >
        <button
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-xl text-cine-text hover:bg-black/80"
        >
          ×
        </button>
        {titulo && !semPadding && <h2 className="px-6 pt-6 pr-14 text-lg font-semibold">{titulo}</h2>}
        <div className={semPadding ? '' : 'p-6'}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
