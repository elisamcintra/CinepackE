import { votosTexto } from '../lib/format.js';

// Notas: TMDB sempre; IMDb, Rotten Tomatoes e Metacritic quando o OMDb tiver
export default function Ratings({ titulo, compacto = false }) {
  const n = titulo.notas_externas;
  const itens = [];
  if (titulo.nota_tmdb) {
    itens.push({ nome: 'TMDB', valor: titulo.nota_tmdb.toFixed(1).replace('.', ','), extra: `${votosTexto(titulo.votos)} votos` });
  }
  if (n?.imdb) itens.push({ nome: 'IMDb', valor: n.imdb.nota.replace('.', ','), extra: n.imdb.votos ? `${n.imdb.votos} votos` : null, url: n.imdb_url });
  if (n?.rotten_tomatoes) itens.push({ nome: 'Rotten Tomatoes', curto: 'RT', valor: n.rotten_tomatoes });
  if (n?.metacritic) itens.push({ nome: 'Metacritic', curto: 'MC', valor: n.metacritic });

  if (!itens.length) return <p className="text-xs text-cine-muted">Ainda sem notas.</p>;

  return (
    <dl className="flex flex-wrap gap-2">
      {itens.map((i) => (
        <div
          key={i.nome}
          className="rounded-lg border border-cine-border bg-cine-bg/60 px-2.5 py-1.5"
          title={i.extra ? `${i.nome}: ${i.valor} (${i.extra})` : `${i.nome}: ${i.valor}`}
        >
          <dt className="text-[10px] uppercase tracking-wide text-cine-muted">{compacto ? i.curto || i.nome : i.nome}</dt>
          <dd className="text-sm font-semibold text-cine-text">
            {i.url ? (
              <a href={i.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">
                {i.valor}
              </a>
            ) : (
              i.valor
            )}
            {!compacto && i.extra && <span className="ml-1 text-[11px] font-normal text-cine-muted">({i.extra})</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
