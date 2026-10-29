import { useState } from 'react';
import { posterUrl } from '../lib/format.js';

// Pôster do TMDB com plano B quando não há imagem (ou ela falha ao carregar)
export default function Poster({ path, titulo, tamanho = 'w342', className = '' }) {
  const [erro, setErro] = useState(false);
  const url = posterUrl(path, tamanho);

  if (!url || erro) {
    return (
      <div className={`flex aspect-[2/3] flex-col items-center justify-center gap-2 bg-gradient-to-br from-cine-surface-2 to-cine-bg p-3 text-center ${className}`}>
        <span className="text-3xl opacity-60" aria-hidden>🎬</span>
        <span className="line-clamp-3 text-xs text-cine-muted">{titulo}</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`Pôster de ${titulo}`}
      loading="lazy"
      onError={() => setErro(true)}
      className={`aspect-[2/3] w-full bg-cine-surface-2 object-cover ${className}`}
    />
  );
}
