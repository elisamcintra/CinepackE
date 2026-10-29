import { useState } from 'react';

// Seleção de nota de 1 a 5 estrelas (também funciona só para exibir, com `somenteLeitura`)
export default function RatingStars({ valor = 0, onChange, somenteLeitura = false, tamanho = 'text-2xl' }) {
  const [hover, setHover] = useState(0);
  const mostrado = hover || valor || 0;
  const rotulos = ['', 'Não gostei', 'Mais ou menos', 'Ok', 'Gostei', 'Amei'];

  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex" onMouseLeave={() => setHover(0)} role={somenteLeitura ? undefined : 'radiogroup'} aria-label="Nota">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={somenteLeitura}
            role={somenteLeitura ? undefined : 'radio'}
            aria-checked={valor === n}
            aria-label={`${n} estrela${n > 1 ? 's' : ''}: ${rotulos[n]}`}
            onMouseEnter={() => !somenteLeitura && setHover(n)}
            onClick={() => onChange?.(n)}
            className={`${tamanho} leading-none transition ${somenteLeitura ? 'cursor-default' : 'px-0.5 hover:scale-110'} ${
              n <= mostrado ? 'text-cine-accent' : 'text-cine-border'
            }`}
          >
            ★
          </button>
        ))}
      </div>
      {!somenteLeitura && mostrado > 0 && <span className="text-sm text-cine-muted">{rotulos[mostrado]}</span>}
    </div>
  );
}
