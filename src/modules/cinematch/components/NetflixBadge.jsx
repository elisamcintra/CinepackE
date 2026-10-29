import { dataCurta, linkNetflix } from '../lib/format.js';

// Selo "✅ Na Netflix Brasil · verificado em DD/MM" + botão "Abrir na Netflix"
export function NetflixBadge({ netflix }) {
  if (!netflix?.disponivel) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-cine-ok/10 px-2.5 py-1 text-xs font-medium text-green-300"
      title="Disponibilidade verificada via JustWatch (dados do TMDB)"
    >
      ✅ Na Netflix Brasil · verificado em {dataCurta(netflix.verificado_em)}
    </span>
  );
}

export function BotaoNetflix({ titulo, className = '' }) {
  return (
    <a
      href={linkNetflix(titulo)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 rounded-xl bg-[#e50914] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#f6121d] ${className}`}
    >
      ▶ Abrir na Netflix
    </a>
  );
}
