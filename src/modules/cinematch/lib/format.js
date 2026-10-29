// Pequenos ajudantes de formatação e imagens

export function posterUrl(path, tamanho = 'w342') {
  return path ? `https://image.tmdb.org/t/p/${tamanho}${path}` : null;
}

export function backdropUrl(path, tamanho = 'w1280') {
  return path ? `https://image.tmdb.org/t/p/${tamanho}${path}` : null;
}

export function duracaoTexto(min) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${String(m).padStart(2, '0')}min` : ''}` : `${m}min`;
}

export function dataCurta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function votosTexto(n) {
  if (!n) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')} mil`;
  return String(n);
}

export function linkNetflix(titulo) {
  return `https://www.netflix.com/search?q=${encodeURIComponent(titulo)}`;
}

export const chaveDe = (t) => `${t.tipo}:${t.tmdb_id}`;
